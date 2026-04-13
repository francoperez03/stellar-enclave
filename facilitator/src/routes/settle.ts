import { Router, type Request, type Response } from "express";
import type { FacilitatorState } from "../state.js";
import type {
  ExtDataWireFormat,
  ShieldedProofWireFormat,
  PaymentRequirements,
} from "@enclave/core";
import type { ExtDataLike } from "@enclave/core";
import { checkBinding } from "../validation/bindingCheck.js";
import { hashExtData } from "../utils/extDataHash.js";
import { checkSolvency } from "../validation/solvencyCheck.js";
import { readBalanceSnapshot } from "../chain/balanceReader.js";
import { submitPoolTransaction, SubmitError } from "../chain/submitPoolTransaction.js";
import { offChainVerify } from "../mock/offChainVerify.js";
import { Env } from "../config/env.js";

interface ParsedSettleRequest {
  proof: ShieldedProofWireFormat;
  extData: ExtDataWireFormat;
  requirements: PaymentRequirements;
}

function hexToBytes(h: string): Uint8Array {
  const s = h.replace(/^0x/, "");
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function wireToExtDataLike(ext: ExtDataWireFormat): ExtDataLike {
  return {
    recipient: ext.recipient,
    ext_amount: BigInt(ext.ext_amount),
    encrypted_output0: hexToBytes(ext.encrypted_output0),
    encrypted_output1: hexToBytes(ext.encrypted_output1),
  };
}

function parseSettle(body: unknown): ParsedSettleRequest {
  if (!body || typeof body !== "object") {
    throw new Error("body must be object");
  }
  const b = body as Record<string, unknown>;
  const payload = b.paymentPayload as Record<string, unknown> | undefined;
  const requirements = b.paymentRequirements as PaymentRequirements | undefined;
  if (!payload || !requirements) {
    throw new Error("missing paymentPayload or paymentRequirements");
  }
  if (!payload.proof || !payload.extData) {
    throw new Error("missing paymentPayload.proof or .extData");
  }
  return {
    proof: payload.proof as ShieldedProofWireFormat,
    extData: payload.extData as ExtDataWireFormat,
    requirements,
  };
}

function getProofExtDataHash(proof: ShieldedProofWireFormat): string {
  return (proof.extDataHash ?? "").toLowerCase();
}

function getInputNullifiers(proof: ShieldedProofWireFormat): string[] {
  return proof.inputNullifiers ?? [];
}

export function createSettleRoute(state: FacilitatorState): Router {
  const router = Router();

  router.post("/", async (req: Request, res: Response) => {
    let parsed: ParsedSettleRequest;
    try {
      parsed = parseSettle(req.body);
    } catch {
      return res.status(400).json({ success: false, errorReason: "malformed_payload" });
    }

    const { proof, extData, requirements } = parsed;
    const extDataLike = wireToExtDataLike(extData);

    // 1. Binding check
    const binding = checkBinding(extDataLike, requirements);
    if (!binding.ok) {
      return res.status(400).json({ success: false, errorReason: binding.reason });
    }

    // 2. ext_data_hash check
    const computedHash = hashExtData(extDataLike);
    const claimedHash = getProofExtDataHash(proof);
    if (computedHash.hex.toLowerCase() !== claimedHash) {
      return res.status(400).json({ success: false, errorReason: "ext_data_hash_mismatch" });
    }

    // 3. TOCTOU-safe tryClaim: atomic test-and-set for each nullifier.
    //    If any fails, roll back all prior claims.
    const nullifiers = getInputNullifiers(proof);
    const claimedOrder: string[] = [];
    for (const nullifier of nullifiers) {
      if (state.cache.tryClaim(nullifier)) {
        claimedOrder.push(nullifier);
      } else {
        // Roll back prior in-flight claims
        for (const prior of claimedOrder) state.cache.release(prior);
        state.metrics.totalReplayRejections += 1;
        return res.status(409).json({ success: false, errorReason: "already_spent" });
      }
    }

    // 4. Mode split
    try {
      if (state.mode === "mock") {
        if (!state.vKey) throw new Error("mock mode not initialized");
        const mockResult = await offChainVerify(
          {
            verifyProof: async (vKey, signals, pf) => {
              // @ts-expect-error — no types
              const snarkjs = await import("snarkjs");
              return snarkjs.groth16.verify(vKey, signals, pf);
            },
            vKey: state.vKey,
          },
          { proof, extData },
        );
        if (!mockResult.ok) {
          for (const n of claimedOrder) state.cache.release(n);
          return res.status(500).json({ success: false, errorReason: "proof_verification_failed" });
        }
        for (const n of claimedOrder) state.cache.commit(n, mockResult.mockTxHash);
        state.metrics.totalSettlements += 1;
        try {
          await state.settlementsLog.append({
            ts: Date.now(),
            nullifier: nullifiers[0],
            recipient: extData.recipient,
            amount: extData.ext_amount,
            txHash: mockResult.mockTxHash,
          });
        } catch (err) {
          state.logger.warn({ err }, "settlements log append failed");
        }
        return res.status(200).json({
          success: true,
          transaction: mockResult.mockTxHash,
          network: "stellar-testnet",
        });
      }

      // On-chain path
      if (!state.client) throw new Error("on_chain client not initialized");

      // 4a. Solvency precheck (defense in depth — /verify and /settle may race)
      const snapshot = await readBalanceSnapshot(state.client.balanceReaderDeps, {
        facilitatorPublicKey: state.client.keypair.publicKey(),
        usdcContractId: state.client.config.usdcContractId,
        poolContractId: state.client.config.poolContractId,
      });
      state.lastSeenPoolRoot = snapshot.poolRootHex;
      const solvency = checkSolvency(snapshot, requirements, Env.minXlmStroops);
      if (!solvency.ok) {
        for (const n of claimedOrder) state.cache.release(n);
        return res.status(400).json({ success: false, errorReason: solvency.reason });
      }

      // 4b. Submit (synchronous — awaits chain confirmation per FACIL-06)
      const result = await submitPoolTransaction(
        {
          rpc: state.client.rpc,
          keypair: state.client.keypair,
          poolContractId: state.client.config.poolContractId,
          networkPassphrase: state.client.config.networkPassphrase,
          maxTransactionFeeStroops: Env.maxTransactionFeeStroops,
          // Shorten poll timeout in tests to avoid test hangs
          pollIntervalMs: 10,
          pollTimeoutMs: 30_000,
        },
        proof,
        extData,
      );

      // 4c. Commit all claimed nullifiers with confirmed tx hash
      for (const n of claimedOrder) state.cache.commit(n, result.txHash);
      state.metrics.totalSettlements += 1;
      try {
        await state.settlementsLog.append({
          ts: Date.now(),
          nullifier: nullifiers[0],
          recipient: extData.recipient,
          amount: extData.ext_amount,
          txHash: result.txHash,
        });
      } catch (err) {
        state.logger.warn({ err }, "settlements log append failed");
      }
      return res.status(200).json({
        success: true,
        transaction: result.txHash,
        network: "stellar-testnet",
      });
    } catch (err) {
      // Roll back all claimed nullifiers on any failure
      for (const n of claimedOrder) state.cache.release(n);
      const reason = err instanceof SubmitError ? err.reason : "pool_rejected_unknown";
      state.logger.error({ err, reason }, "settle failed");
      return res.status(500).json({ success: false, errorReason: reason });
    }
  });

  return router;
}

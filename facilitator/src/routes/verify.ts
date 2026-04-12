import { Router, type Request, type Response } from "express";
import type { FacilitatorState } from "../state.js";
import type {
  ExtDataWireFormat,
  ShieldedProofWireFormat,
  PaymentRequirements,
} from "@enclave/core";
import { checkBinding } from "../validation/bindingCheck.js";
import { hashExtData } from "../utils/extDataHash.js";
import { checkSolvency } from "../validation/solvencyCheck.js";
import { readBalanceSnapshot } from "../chain/balanceReader.js";
import { simulatePoolTransaction } from "../chain/simulatePoolTransaction.js";
import { offChainVerify } from "../mock/offChainVerify.js";
import { Env } from "../config/env.js";
import type { ExtDataLike } from "@enclave/core";

/** Canonical invalidReason values */
type VerifyInvalidReason =
  | "malformed_payload"
  | "recipient_mismatch"
  | "amount_mismatch"
  | "encrypted_output_length_invalid"
  | "ext_data_hash_mismatch"
  | "already_spent"
  | "insolvent_facilitator_xlm"
  | "insolvent_pool_usdc"
  | "pool_rejected_invalid_proof"
  | "pool_rejected_nullifier_replay"
  | "pool_rejected_ext_data_hash_mismatch"
  | "pool_rejected_insufficient_funds"
  | "pool_rejected_unknown"
  | "proof_verification_failed";

interface ParsedVerifyRequest {
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

/**
 * Convert ExtDataWireFormat (all strings) to ExtDataLike (bigint + Uint8Array)
 * as required by checkBinding and hashExtData.
 */
function wireToExtDataLike(ext: ExtDataWireFormat): ExtDataLike {
  return {
    recipient: ext.recipient,
    ext_amount: BigInt(ext.ext_amount),
    encrypted_output0: hexToBytes(ext.encrypted_output0),
    encrypted_output1: hexToBytes(ext.encrypted_output1),
  };
}

function parseRequest(body: unknown): ParsedVerifyRequest {
  if (!body || typeof body !== "object") {
    throw new Error("request body must be an object");
  }
  const b = body as Record<string, unknown>;
  const payload = b.paymentPayload as Record<string, unknown> | undefined;
  const requirements = b.paymentRequirements as PaymentRequirements | undefined;
  if (!payload || !requirements) {
    throw new Error("missing paymentPayload or paymentRequirements");
  }
  if (!payload.scheme || payload.scheme !== "shielded-exact") {
    throw new Error("scheme must be shielded-exact");
  }
  if (!payload.proof || !payload.extData) {
    throw new Error("payload must include proof and extData");
  }
  const proof = payload.proof as ShieldedProofWireFormat;
  const extData = payload.extData as ExtDataWireFormat;
  if (!proof.extDataHash) {
    throw new Error("proof must include extDataHash");
  }
  return { proof, extData, requirements };
}

function getProofExtDataHash(proof: ShieldedProofWireFormat): string {
  return (proof.extDataHash ?? "").toLowerCase();
}

function invalid(reason: VerifyInvalidReason) {
  return { isValid: false, invalidReason: reason };
}

export function createVerifyRoute(state: FacilitatorState): Router {
  const router = Router();

  router.post("/", async (req: Request, res: Response) => {
    let parsed: ParsedVerifyRequest;
    try {
      parsed = parseRequest(req.body);
    } catch (err) {
      return res.status(400).json({ error: "bad_request", details: (err as Error).message });
    }

    const { proof, extData, requirements } = parsed;
    const extDataLike = wireToExtDataLike(extData);

    // 1. Structural binding check
    const binding = checkBinding(extDataLike, requirements);
    if (!binding.ok) {
      return res.json(invalid(binding.reason as VerifyInvalidReason));
    }

    // 2. ext_data_hash cryptographic binding
    const computedHash = hashExtData(extDataLike);
    const claimedHash = getProofExtDataHash(proof);
    if (computedHash.hex.toLowerCase() !== claimedHash) {
      return res.json(invalid("ext_data_hash_mismatch"));
    }

    // 3. Early replay peek (non-authoritative)
    const nullifiers: string[] = proof.inputNullifiers ?? [];
    for (const nullifier of nullifiers) {
      const peek = state.cache.peek(nullifier);
      if (peek?.state === "committed") {
        return res.json(invalid("already_spent"));
      }
    }

    // 4. Mode split
    if (state.mode === "mock") {
      if (!state.vKey) {
        return res.status(503).json({ error: "mock_mode_not_initialized" });
      }
      try {
        const result = await offChainVerify(
          {
            verifyProof: async (vKey, publicSignals, pf) => {
              // eslint-disable-next-line @typescript-eslint/ban-ts-comment
              // @ts-expect-error — no types
              const snarkjs = await import("snarkjs");
              return snarkjs.groth16.verify(vKey, publicSignals, pf);
            },
            vKey: state.vKey,
          },
          { proof, extData },
        );
        if (!result.ok) {
          return res.json(invalid("proof_verification_failed"));
        }
        return res.json({ isValid: true });
      } catch (err) {
        state.logger.error({ err }, "offChainVerify failed");
        return res.json(invalid("proof_verification_failed"));
      }
    }

    // 5. On-chain mode: client required
    if (!state.client) {
      return res.status(503).json({ error: "on_chain_client_not_initialized" });
    }

    // 6. Solvency gate
    const snapshot = await readBalanceSnapshot(state.client.balanceReaderDeps, {
      facilitatorPublicKey: state.client.keypair.publicKey(),
      usdcContractId: state.client.config.usdcContractId,
      poolContractId: state.client.config.poolContractId,
    });
    state.lastSeenPoolRoot = snapshot.poolRootHex;

    const solvency = checkSolvency(snapshot, requirements, Env.minXlmStroops);
    if (!solvency.ok) {
      return res.json(invalid(solvency.reason as VerifyInvalidReason));
    }

    // 7. Simulation
    const sim = await simulatePoolTransaction(
      {
        rpc: state.client.rpc,
        poolContractId: state.client.config.poolContractId,
        facilitatorPublicKey: state.client.keypair.publicKey(),
        networkPassphrase: state.client.config.networkPassphrase,
      },
      proof,
      extData,
    );
    if (!sim.ok) {
      return res.json(invalid((sim.reason as VerifyInvalidReason) ?? "pool_rejected_unknown"));
    }

    return res.json({ isValid: true });
  });

  return router;
}

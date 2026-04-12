import { Contract, Keypair, TransactionBuilder, rpc as StellarRpc } from "@stellar/stellar-sdk";
import type { ShieldedProofWireFormat, ExtDataWireFormat } from "@enclave/core";
import { buildPoolTransactArgs } from "./poolTransaction.js";
import { mapSubmitError, type SubmitInvalidReason } from "./errorMapping.js";

export interface SubmitDeps {
  rpc: StellarRpc.Server;
  keypair: Keypair;
  poolContractId: string;
  networkPassphrase: string;
  maxTransactionFeeStroops: number;
  pollIntervalMs?: number;
  pollTimeoutMs?: number;
}

export interface SubmitResult {
  txHash: string;
  ledger: number;
}

/**
 * Typed error for submission failures. Carries the mapped `reason` alongside
 * a human-readable message so the /settle handler can set both `errorReason`
 * and `errorMessage` in the x402 SettleResponse.
 */
export class SubmitError extends Error {
  constructor(
    message: string,
    public readonly reason: SubmitInvalidReason,
  ) {
    super(message);
    this.name = "SubmitError";
  }
}

const DEFAULT_POLL_INTERVAL_MS = 1_000;
const DEFAULT_POLL_TIMEOUT_MS = 60_000;

/**
 * Build, sign, submit, and poll pool.transact for confirmation.
 *
 * Sequence (mirrors app/js/stellar.js::submitPoolTransaction):
 *   1. Build transaction with fee cap 10 XLM (10_000_000 stroops).
 *   2. prepareTransaction — simulation + resource footprint attachment.
 *   3. sign with facilitator Keypair — FACIL-08 compliance: outer tx signature
 *      is sufficient; no per-org contract auth entries are required or added.
 *   4. sendTransaction.
 *   5. Poll getTransaction until SUCCESS | FAILED | timeout.
 *
 * FACIL-08: the facilitator signs the outer Soroban transaction and pays XLM.
 * The pool contract validates the sender via the outer signature alone.
 * No contract-level auth entries are added.
 */
export async function submitPoolTransaction(
  deps: SubmitDeps,
  proof: ShieldedProofWireFormat,
  extData: ExtDataWireFormat,
): Promise<SubmitResult> {
  const args = buildPoolTransactArgs(proof, extData, deps.keypair.publicKey());
  const contract = new Contract(deps.poolContractId);
  const account = await deps.rpc.getAccount(deps.keypair.publicKey());

  let tx = new TransactionBuilder(account as any, {
    fee: String(deps.maxTransactionFeeStroops),
    networkPassphrase: deps.networkPassphrase,
  })
    .addOperation(contract.call("transact", ...args))
    .setTimeout(60)
    .build();

  // prepareTransaction: simulation, resource footprint, and returns a new
  // Transaction ready to sign. This is the canonical Soroban path.
  tx = await deps.rpc.prepareTransaction(tx);
  tx.sign(deps.keypair);

  const send = await deps.rpc.sendTransaction(tx);
  if (send.status === "ERROR") {
    const errorDetails = String(
      (send as any).errorResult?.result?.().switch?.()?.name ?? "unknown",
    );
    throw new SubmitError(
      `sendTransaction ERROR: ${errorDetails}`,
      mapSubmitError(errorDetails),
    );
  }

  const pollIntervalMs = deps.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const pollTimeoutMs = deps.pollTimeoutMs ?? DEFAULT_POLL_TIMEOUT_MS;
  const deadline = Date.now() + pollTimeoutMs;

  while (Date.now() < deadline) {
    const confirmation = await deps.rpc.getTransaction(send.hash);

    if (confirmation.status === "SUCCESS") {
      return { txHash: send.hash, ledger: (confirmation as any).ledger };
    }

    if (confirmation.status === "FAILED") {
      const xdrStr =
        (confirmation as any).resultXdr?.toXDR?.("base64") ?? "getTransaction FAILED";
      const reason = mapSubmitError(xdrStr);
      throw new SubmitError(`pool.transact failed (${reason})`, reason);
    }

    // status === "NOT_FOUND" — keep polling
    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }

  throw new SubmitError(
    `submit timed out after ${pollTimeoutMs}ms (hash=${send.hash})`,
    "submit_timeout",
  );
}

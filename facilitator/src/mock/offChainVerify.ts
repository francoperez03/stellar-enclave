import { readFileSync, existsSync } from "node:fs";
import type { ShieldedProofWireFormat, ExtDataWireFormat } from "@enclave/core";

export type MockVerifyResult =
  | { ok: true; mockTxHash: string }
  | { ok: false; reason: "proof_verification_failed" };

export interface OffChainVerifyDeps {
  /** Injected for unit testing. Production value uses snarkjs.groth16.verify. */
  verifyProof: (vKey: unknown, publicSignals: string[], proof: unknown) => Promise<boolean>;
  /** Resolved verifying key JSON object. Call loadVerifyingKey() to obtain it. */
  vKey: unknown;
}

export interface OffChainVerifyInput {
  proof: ShieldedProofWireFormat;
  extData: ExtDataWireFormat;
}

/**
 * Off-chain Groth16 verification for FACILITATOR_MODE=mock. Does NOT touch
 * the Stellar network, Keypair file, or replay cache. Returns a deterministic
 * mock tx hash so demo scripts can assert on it.
 *
 * The mock tx hash format is `mock_<first 16 hex chars of the first nullifier>`
 * which is guaranteed to be unique per settled shielded note and is stable across
 * re-runs with the same proof inputs.
 */
export async function offChainVerify(
  deps: OffChainVerifyDeps,
  input: OffChainVerifyInput,
): Promise<MockVerifyResult> {
  if (!input.proof.inputNullifiers?.length) {
    throw new Error("proof.input_nullifiers must contain at least one entry");
  }

  const publicSignals = [
    input.proof.root,
    input.proof.publicAmount,
    input.proof.extDataHash,
    ...input.proof.inputNullifiers,
    input.proof.outputCommitment0,
    input.proof.outputCommitment1,
    input.proof.aspMembershipRoot,
    input.proof.aspNonMembershipRoot,
  ];

  // The snarkjs proof wire format is consumed directly — our ShieldedProofWireFormat
  // is already JSON-serializable and matches snarkjs expectations.
  const verified = await deps.verifyProof(
    deps.vKey,
    publicSignals,
    input.proof as unknown,
  );

  if (!verified) {
    return { ok: false, reason: "proof_verification_failed" };
  }

  const firstNullifier = input.proof.inputNullifiers[0].replace(/^0x/, "").toLowerCase();
  return { ok: true, mockTxHash: `mock_${firstNullifier.slice(0, 16)}` };
}

let cachedVKey: unknown;

/**
 * Loads the verifying key JSON file once and caches it. Called at boot by
 * Plan 07's bootstrap when FACILITATOR_MODE=mock.
 */
export function loadVerifyingKey(circuitVkeyPath: string): unknown {
  if (cachedVKey) return cachedVKey;
  if (!existsSync(circuitVkeyPath)) {
    throw new Error(`verifying key not found at ${circuitVkeyPath}`);
  }
  const raw = readFileSync(circuitVkeyPath, "utf-8");
  cachedVKey = JSON.parse(raw);
  return cachedVKey;
}

/** Resets the cached vKey. Test-only. */
export function _resetVKeyCacheForTests(): void {
  cachedVKey = undefined;
}

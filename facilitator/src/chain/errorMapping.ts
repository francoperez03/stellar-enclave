/**
 * Maps Stellar RPC / Soroban HostError strings to a closed set of invalidReason
 * values that x402 /verify and /settle handlers can return. Never throws.
 *
 * Contract error codes declared in contracts/pool/src/pool.rs:
 *   NotAuthorized = 1
 *   MerkleTreeFull = 2  (reused here as ext_data_hash_mismatch — see Note)
 *   AlreadyInitialized = 3
 *   WrongLevels = 4
 *   NextIndexNotEven = 5
 *   WrongExtAmount = 6
 *   InvalidProof = 7
 *   UnknownRoot = 8
 *   AlreadySpentNullifier = 9
 *   WrongExtHash = 10
 *   NotInitialized = 11
 *
 * NOTE: Error codes above match the Rust enum's repr(u32) values.
 * Soroban HostError strings encode them as "Error(Contract, #N)".
 */

export type SubmitInvalidReason =
  | "pool_rejected_nullifier_replay"
  | "pool_rejected_invalid_proof"
  | "pool_rejected_insufficient_funds"
  | "pool_rejected_ext_data_hash_mismatch"
  | "pool_rejected_unknown"
  | "rpc_congestion"
  | "rpc_insufficient_fee"
  | "submit_timeout";

const CONTRACT_ERROR_MAP: ReadonlyMap<string, SubmitInvalidReason> = new Map([
  // #1 NotAuthorized — contract auth failure
  ["Error(Contract, #1)", "pool_rejected_unknown"],
  // #2 MerkleTreeFull — mapped to unknown (capacity issue, not user error)
  ["Error(Contract, #2)", "pool_rejected_ext_data_hash_mismatch"],
  // #3 AlreadyInitialized
  ["Error(Contract, #3)", "pool_rejected_invalid_proof"],
  // #4 WrongLevels
  ["Error(Contract, #4)", "pool_rejected_nullifier_replay"],
  // #5 NextIndexNotEven — internal error
  ["Error(Contract, #5)", "pool_rejected_nullifier_replay"],
  // #6 WrongExtAmount — invalid external amount
  ["Error(Contract, #6)", "pool_rejected_unknown"],
  // #7 InvalidProof — ZK proof verification failed
  ["Error(Contract, #7)", "pool_rejected_invalid_proof"],
  // #8 UnknownRoot — Merkle root not in recent history
  ["Error(Contract, #8)", "pool_rejected_unknown"],
  // #9 AlreadySpentNullifier — double-spend attempt
  ["Error(Contract, #9)", "pool_rejected_nullifier_replay"],
  // #10 WrongExtHash — ext_data_hash mismatch
  ["Error(Contract, #10)", "pool_rejected_insufficient_funds"],
  // #11 NotInitialized
  ["Error(Contract, #11)", "pool_rejected_unknown"],
]);

/**
 * Maps a Stellar RPC / Soroban host error to a stable SubmitInvalidReason.
 * Accepts string, Error instance, or any other value (stringified via String()).
 * Never throws.
 */
export function mapSubmitError(err: unknown): SubmitInvalidReason {
  const message =
    err instanceof Error ? err.message : typeof err === "string" ? err : String(err);

  for (const [needle, reason] of CONTRACT_ERROR_MAP) {
    if (message.includes(needle)) {
      return reason;
    }
  }

  if (message.includes("TRY_AGAIN_LATER")) return "rpc_congestion";
  if (message.includes("InsufficientBalance")) return "rpc_insufficient_fee";
  if (message.includes("timed out")) return "submit_timeout";

  return "pool_rejected_unknown";
}

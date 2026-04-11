// Phase 0 stub — shared type skeletons consumed by facilitator/treasury/gate/agent.
// Types are intentionally loose (string aliases, bigint, Uint8Array) so Phase 1+ can
// tighten them without forcing simultaneous updates across packages.

/**
 * An organization identifier. Off-chain only — never appears on-chain.
 * Format is an opaque string; Phase 1 CLI mints UUIDs or human-readable slugs.
 */
export type OrgId = string;

/**
 * The shared per-org spending public key (Model X). ALL agents in an org reuse
 * this single keypair to construct shielded proofs. The agent never holds the
 * private half — only the org admin (via the treasury CLI) does.
 *
 * Encoded as a BN254 field element (big-endian 32 bytes).
 */
export type OrgSpendingPubKey = Uint8Array;

/**
 * Per-agent authentication key used by the facilitator to identify which agent
 * in an org made a given request (for audit / rate-limit). Purely off-chain.
 * Ed25519 or similar — Phase 3 picks the concrete algorithm.
 */
export type AgentAuthKey = Uint8Array;

/**
 * A shielded Groth16 proof compatible with the upstream policy_tx_2_2 circuit.
 * Layout intentionally mirrors the upstream Soroban `Proof` struct:
 * see contracts/pool/src/pool.rs (field names match).
 *
 * Phase 3 populates this from the prover output; Phase 2 facilitator verifies it.
 */
export interface ShieldedProof {
  /** Groth16 proof bytes (wrapped as the contract expects). */
  proof: Uint8Array;
  /** Pool merkle root the proof was generated against. */
  root: bigint;
  /** Input nullifiers (one per pool input, typically 2). */
  inputNullifiers: bigint[];
  /** Output commitment 0 (real or dummy). */
  outputCommitment0: bigint;
  /** Output commitment 1 (real or dummy). */
  outputCommitment1: bigint;
  /** Public amount (zero for private transfer). */
  publicAmount: bigint;
  /** Hash of the ExtData (recipient, amounts, encrypted outputs). */
  extDataHash: Uint8Array;
  /** ASP membership root at proof time. */
  aspMembershipRoot: bigint;
  /** ASP non-membership root at proof time. */
  aspNonMembershipRoot: bigint;
}

/**
 * An x402 payment request as forwarded by the facilitator. Mirrors the x402
 * 402-challenge payload; Phase 2 facilitator validates the proof commits to
 * {payTo, maxAmountRequired, resource}.
 */
export interface PaymentRequest {
  /** Stellar address that will receive the public USDC settlement. */
  payTo: string;
  /** Maximum amount (stroops) the endpoint will accept. */
  maxAmountRequired: bigint;
  /** The endpoint resource being paid for (URL or opaque identifier). */
  resource: string;
  /** Nonce to prevent replay at the facilitator boundary. */
  nonce: string;
}

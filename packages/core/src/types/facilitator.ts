// Phase 2 shared types for @enclave/facilitator <-> @enclave/agent <-> @enclave/gate.
// Source of truth for HTTP request/response shapes and the /health report.

import type { ShieldedProof } from "../types.js";

/**
 * Node-friendly ExtData mirror. The pool contract struct is:
 *   pub struct ExtData { recipient: Address, ext_amount: I256, encrypted_output0: Bytes, encrypted_output1: Bytes }
 * We use bigint for ext_amount (may be negative for withdrawals) and Uint8Array for the 112-byte blobs.
 */
export interface ExtDataLike {
  recipient: string; // Stellar G... address
  ext_amount: bigint;
  encrypted_output0: Uint8Array; // exactly 112 bytes (Pitfall 8)
  encrypted_output1: Uint8Array; // exactly 112 bytes (Pitfall 8)
}

/**
 * x402 PaymentRequirements subset the facilitator consumes. Mirrors @x402/core 2.6.0.
 */
export interface PaymentRequirements {
  scheme: string; // "shielded-exact"
  network: string; // "stellar:testnet" | "stellar:mainnet"
  maxAmountRequired: string; // decimal string (bigint-safe)
  resource: string;
  description: string;
  mimeType: string;
  payTo: string;
  maxTimeoutSeconds: number;
  asset: string; // USDC SAC contract id
  extra?: unknown;
}

/**
 * Scheme-specific payload nested inside x402 PaymentPayload.payload.
 * Per 02-RESEARCH Open Questions #5 we nest the proof + ExtData here.
 */
export interface ShieldedExactPayload {
  proof: ShieldedProofWireFormat;
  extData: ExtDataWireFormat;
}

/** JSON-safe wire format for ShieldedProof (hex for bytes, decimal string for bigint). */
export interface ShieldedProofWireFormat {
  a: string; // hex 128 chars
  b: string; // hex 256 chars
  c: string; // hex 128 chars
  root: string; // decimal
  inputNullifiers: string[]; // decimal
  outputCommitment0: string;
  outputCommitment1: string;
  publicAmount: string;
  extDataHash: string; // hex 64 chars
  aspMembershipRoot: string;
  aspNonMembershipRoot: string;
}

/** JSON-safe wire format for ExtDataLike. */
export interface ExtDataWireFormat {
  recipient: string;
  ext_amount: string; // decimal bigint
  encrypted_output0: string; // hex
  encrypted_output1: string; // hex
}

export interface VerifyRequest {
  x402Version: number;
  paymentPayload: {
    x402Version: number;
    scheme: string;
    network: string;
    payload: ShieldedExactPayload;
  };
  paymentRequirements: PaymentRequirements;
}

export interface VerifyResponse {
  isValid: boolean;
  invalidReason?: string;
  invalidMessage?: string;
  payer?: string;
  extensions?: Record<string, unknown>;
}

export interface SettleRequest extends VerifyRequest {}

export interface SettleResponse {
  success: boolean;
  errorReason?: string;
  errorMessage?: string;
  payer?: string;
  transaction: string; // txHash
  network: string;
  extensions?: Record<string, unknown>;
}

/**
 * /health JSON body. Per 02-CONTEXT.md HTTP interface all nine fields are REQUIRED.
 */
export interface FacilitatorHealthReport {
  usdc_balance: string; // decimal bigint (facilitator reserve — display only)
  xlm_balance: string; // decimal bigint (gas float)
  last_seen_pool_root: string; // hex or decimal
  nullifier_cache_size: number;
  facilitator_mode: "on_chain" | "mock";
  registry_frozen: boolean;
  total_settlements: number;
  total_replay_rejections: number;
  uptime_seconds: number;
}

export type BindingCheckResult =
  | { ok: true }
  | {
      ok: false;
      reason: "recipient_mismatch" | "amount_mismatch" | "encrypted_output_length_invalid";
      details?: Record<string, unknown>;
    };

// Re-export ShieldedProof for downstream type references
export type { ShieldedProof };

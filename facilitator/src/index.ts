// @enclave/facilitator — Phase 2 target. Verifies shielded proofs on-chain,
// relays pool.transact() (meta-tx), settles USDC via x402 (FACIL-01..08).

import type { ShieldedProof, PaymentRequest } from "@enclave/core";

export const PHASE_0_STUB = true;

// Phase 2 target — real HTTP server + policy engine + replay store land after FACIL-01..08.
export async function verifyAndSettle(
  _proof: ShieldedProof,
  _request: PaymentRequest,
): Promise<{ ok: boolean; txId?: string; reason?: string }> {
  throw new Error("@enclave/facilitator: Phase 2 target, not yet implemented");
}

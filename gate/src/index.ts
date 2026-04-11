// @enclave/gate — Phase 4 target. withEnclaveGate({ orgId }) Next.js middleware
// gating an HTTP endpoint by ZK membership proof (GATE-01..04).

import type { OrgId, ShieldedProof } from "@enclave/core";

export const PHASE_0_STUB = true;

export interface EnclaveGateOptions {
  orgId: OrgId;
}

// Phase 4 target — real middleware lands after GATE-01..04.
export function withEnclaveGate(_options: EnclaveGateOptions): (proof: ShieldedProof) => Promise<boolean> {
  throw new Error("@enclave/gate: Phase 4 target, not yet implemented");
}

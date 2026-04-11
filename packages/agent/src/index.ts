// @enclave/agent — Phase 3 target. Drop-in x402 client with shielded proving.
// Phase 0: stub only. Real implementation depends on SETUP-06 benchmark winner
// (Node WASM vs Playwright fallback) — see docs/benchmarks.md after Plan 05.

import type { OrgSpendingPubKey, AgentAuthKey, ShieldedProof } from "@enclave/core";

export const PHASE_0_STUB = true;

export type AgentConfig = {
  orgSpendingPubKey: OrgSpendingPubKey;
  authKey: AgentAuthKey;
  facilitatorUrl: string;
};

export interface Agent {
  fetch(url: string, init?: unknown): Promise<Response>;
}

// Phase 3 target — real instantiation lands after SDK-01..07.
export function createAgent(_config: AgentConfig): Agent {
  throw new Error("@enclave/agent: Phase 3 target, not yet implemented");
}

export type { ShieldedProof };

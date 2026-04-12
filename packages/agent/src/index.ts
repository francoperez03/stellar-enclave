// @enclave/agent — Phase 3 implementation.
// Wave 0: types + stubs. Plans 02-05 replace the stub bodies.

export { EnclavePaymentError } from './types.js';
export type { EnclaveNote, AgentBundle, FixtureEntry, FixtureIndex, ExtData } from './types.js';
export type { ShieldedProof, PaymentRequest } from '@enclave/core';

export type AgentConfig = {
  /** Path to <agentName>.enclave.json bundle file */
  bundlePath?: string;
  /** Path to notes JSON file */
  notesPath?: string;
  /** Path to proving artifacts directory (wasm-prover-nodejs + wasm-witness-nodejs outputs) */
  provingArtifactsPath?: string;
  /** Optional path to fixture JSON (bypasses live proving when set) */
  fixturePath?: string;
};

export interface Agent {
  fetch(url: string, init?: RequestInit): Promise<Response>;
}

export async function createAgent(_config?: AgentConfig): Promise<Agent> {
  throw new Error('@enclave/agent: Phase 3 Plan 05 target — not yet implemented');
}

// Removed: PHASE_0_STUB — Phase 3 replaces the stub marker

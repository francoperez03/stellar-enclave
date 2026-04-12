// @enclave/agent — Phase 3 complete implementation.
// Drop-in x402 client: agent.fetch(url) transparently handles 402->prove->settle->retry.

export { EnclavePaymentError } from './types.js';
export type { EnclaveNote, AgentBundle, FixtureEntry, FixtureIndex, ExtData } from './types.js';
export type { ShieldedProof, PaymentRequest } from '@enclave/core';
export type { AgentConfig } from './config.js';

import { loadBundle, loadNotes } from './config.js';
import { createInterceptingFetch } from './fetch-interceptor.js';

export interface Agent {
  fetch(url: string, init?: RequestInit): Promise<Response>;
}

export type AgentCreateOptions = {
  /** Path to <agentName>.enclave.json bundle file. Defaults to ENCLAVE_BUNDLE_PATH env var. */
  bundlePath?: string;
  /** Path to notes JSON file. Defaults to ENCLAVE_NOTES_PATH env var. */
  notesPath?: string;
  /** Path to WASM proving artifacts directory. Defaults to ENCLAVE_PROVING_ARTIFACTS_PATH. */
  provingArtifactsPath?: string;
  /** Optional path to fixture JSON for demo recording. Defaults to ENCLAVE_FIXTURE_PATH. */
  fixturePath?: string;
};

/**
 * Create an Enclave agent.
 *
 * Reads configuration from env vars by default; all paths can be overridden via options.
 * The returned agent's fetch() method transparently handles x402 payment flows using
 * the org's shared spending key (Model X). SDK-01.
 *
 * @example
 *   const agent = await createAgent();
 *   const response = await agent.fetch('https://api.example.com/resource');
 */
export async function createAgent(options?: AgentCreateOptions): Promise<Agent> {
  const bundlePath = options?.bundlePath ?? process.env['ENCLAVE_BUNDLE_PATH'];
  const notesPath = options?.notesPath ?? process.env['ENCLAVE_NOTES_PATH'];
  const provingArtifactsPath =
    options?.provingArtifactsPath ?? process.env['ENCLAVE_PROVING_ARTIFACTS_PATH'];
  const fixturePath = options?.fixturePath ?? process.env['ENCLAVE_FIXTURE_PATH'];

  if (!bundlePath) throw new Error('ENCLAVE_BUNDLE_PATH is required (or pass bundlePath option)');
  if (!notesPath) throw new Error('ENCLAVE_NOTES_PATH is required (or pass notesPath option)');
  if (!provingArtifactsPath) {
    throw new Error('ENCLAVE_PROVING_ARTIFACTS_PATH is required (or pass provingArtifactsPath option)');
  }

  const [bundle, notes] = await Promise.all([loadBundle(bundlePath), loadNotes(notesPath)]);

  const fetchFn = await createInterceptingFetch({
    bundle,
    notes,
    provingArtifactsPath,
    fixturePath,
  });

  return { fetch: fetchFn };
}

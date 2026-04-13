// Agent configuration loader.
// Reads bundle from ENCLAVE_BUNDLE_PATH (required) and supporting paths
// from env vars. Never logs secret material.

import { readFile } from 'node:fs/promises';
import type { AgentBundle, EnclaveNote } from './types.js';

export type AgentConfig = {
  bundle: AgentBundle;
  notes: EnclaveNote[];
  provingArtifactsPath: string;
  fixturePath?: string;
};

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is required but not set`);
  return v;
}

export async function loadBundle(bundlePath: string): Promise<AgentBundle> {
  const raw = await readFile(bundlePath, 'utf-8');
  const parsed = JSON.parse(raw) as AgentBundle;
  // Validate required fields
  const required: (keyof AgentBundle)[] = ['orgSpendingPrivKey', 'agentAuthKey', 'orgId', 'facilitatorUrl'];
  for (const field of required) {
    if (!parsed[field]) throw new Error(`Bundle missing required field: ${field}`);
  }
  return parsed;
}

export async function loadNotes(notesPath: string): Promise<EnclaveNote[]> {
  const raw = await readFile(notesPath, 'utf-8');
  const parsed = JSON.parse(raw);
  // Accept either a bare array or the browser's wrapped export shape
  // { version, exportedAt, notes: [...] } produced by state.exportNotes().
  let rows: unknown[];
  if (Array.isArray(parsed)) rows = parsed;
  else if (parsed && Array.isArray(parsed.notes)) rows = parsed.notes;
  else {
    throw new Error(
      `notes file at ${notesPath} must be an array or { notes: [...] }; got ${typeof parsed}`,
    );
  }
  // EnclaveNote.amount is typed as bigint but JSON serializes bigint via a
  // to-string replacer upstream (browser side). Coerce back so the agent's
  // arithmetic (note.amount - payAmount, etc.) doesn't mix BigInt with string.
  return rows.map((r) => {
    const n = r as EnclaveNote & { amount: unknown };
    if (typeof n.amount !== 'bigint') {
      n.amount = BigInt(String(n.amount));
    }
    return n as EnclaveNote;
  });
}

export async function loadConfig(): Promise<AgentConfig> {
  const bundlePath = requireEnv('ENCLAVE_BUNDLE_PATH');
  const notesPath = requireEnv('ENCLAVE_NOTES_PATH');
  const provingArtifactsPath = requireEnv('ENCLAVE_PROVING_ARTIFACTS_PATH');
  const fixturePath = process.env['ENCLAVE_FIXTURE_PATH'];

  const [bundle, notes] = await Promise.all([
    loadBundle(bundlePath),
    loadNotes(notesPath),
  ]);

  return { bundle, notes, provingArtifactsPath, fixturePath };
}

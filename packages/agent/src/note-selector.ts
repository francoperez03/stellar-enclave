// Note (UTXO) selector for @enclave/agent.
// SDK-01: selects which shielded note to spend for a given payment amount.
// Selection strategy: greedy smallest-sufficient (minimizes change output size).
// Deferred: multi-note split payments (no single note covers amount -> returns null).

import type { EnclaveNote } from './types.js';

/**
 * Select a note to spend for the given payment amount.
 *
 * Strategy: greedy smallest-sufficient — pick the smallest note that fully covers
 * `amount` to minimize change-output size. This is predictable for demo and avoids
 * creating unnecessarily large change outputs.
 *
 * @param notes - All notes available (from notes.json)
 * @param amount - Amount to cover in stroops
 * @param spentNullifiers - In-memory set of nullifiers already spent this session
 * @returns The selected note, or null if no single note covers the amount
 */
export function selectNote(
  notes: EnclaveNote[],
  amount: bigint,
  spentNullifiers: Set<string>,
): EnclaveNote | null {
  // Filter: not spent, and note amount covers the payment
  const eligible = notes.filter(
    (n) => !spentNullifiers.has(n.nullifier) && n.amount >= amount,
  );

  if (eligible.length === 0) return null;

  // Sort ascending by amount; pick the smallest sufficient note
  eligible.sort((a, b) => (a.amount < b.amount ? -1 : a.amount > b.amount ? 1 : 0));

  // Non-null assertion safe: eligible.length > 0 checked above
  return eligible[0] ?? null;
}

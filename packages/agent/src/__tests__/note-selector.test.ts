import { describe, it, expect } from '@jest/globals';
import { selectNote } from '../note-selector.js';
import type { EnclaveNote } from '../types.js';

// Minimal EnclaveNote fixture — only amount + nullifier are load-bearing for selection logic
function makeNote(amount: bigint, nullifier: string): EnclaveNote {
  return {
    commitment: `commitment_${nullifier}`,
    nullifier,
    amount,
    blinding: '0',
    pathElements: Array(10).fill('0'),
    pathIndex: '0',
    aspLeaf: '0',
    aspPathElements: Array(10).fill('0'),
    aspPathIndex: '0',
  };
}

describe('selectNote — greedy smallest-sufficient strategy (SDK-01)', () => {
  it('picks the smallest note that fully covers the amount', () => {
    const notes = [
      makeNote(BigInt(500), 'n-500'),
      makeNote(BigInt(1000), 'n-1000'),
      makeNote(BigInt(200), 'n-200'),
    ];
    const selected = selectNote(notes, BigInt(600), new Set());
    expect(selected).not.toBeNull();
    expect(selected?.nullifier).toBe('n-1000');
  });

  it('returns null when no single note covers the amount (no_funds)', () => {
    const notes = [
      makeNote(BigInt(500), 'n-500'),
      makeNote(BigInt(200), 'n-200'),
    ];
    const selected = selectNote(notes, BigInt(600), new Set());
    expect(selected).toBeNull();
  });

  it('skips notes whose nullifier is in spentNullifiers set', () => {
    const notes = [
      makeNote(BigInt(1000), 'spent'),
      makeNote(BigInt(2000), 'unspent'),
    ];
    const spent = new Set(['spent']);
    const selected = selectNote(notes, BigInt(500), spent);
    expect(selected?.nullifier).toBe('unspent');
  });

  it('returns null when all notes are spent', () => {
    const notes = [
      makeNote(BigInt(1000), 'a'),
      makeNote(BigInt(2000), 'b'),
    ];
    const spent = new Set(['a', 'b']);
    const selected = selectNote(notes, BigInt(500), spent);
    expect(selected).toBeNull();
  });

  it('returns null when notes array is empty', () => {
    const selected = selectNote([], BigInt(100), new Set());
    expect(selected).toBeNull();
  });

  it('picks exact-match note when amount equals note amount', () => {
    const notes = [
      makeNote(BigInt(500), 'n-500'),
      makeNote(BigInt(1000), 'n-1000'),
    ];
    const selected = selectNote(notes, BigInt(500), new Set());
    expect(selected?.nullifier).toBe('n-500');
  });
});

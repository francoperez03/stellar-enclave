import { describe, it, expect } from '@jest/globals';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decomposePublicInputs } from '../publicInputs.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('decomposePublicInputs (Phase 03.1)', () => {
  it('all-zero input returns zero for all fields', () => {
    const result = decomposePublicInputs(new Uint8Array(352));
    expect(result.root).toBe('0');
    expect(result.publicAmount).toBe('0');
    expect(result.extDataHash).toBe('00'.repeat(32));
    expect(result.inputNullifiers).toEqual(['0', '0']);
    expect(result.outputCommitment0).toBe('0');
    expect(result.outputCommitment1).toBe('0');
    expect(result.aspMembershipRoot).toBe('0');
    expect(result.aspNonMembershipRoot).toBe('0');
  });

  it('byte 0 = 0x01, all others 0 → root is "1" (LE: first byte is least-significant)', () => {
    const b = new Uint8Array(352);
    b[0] = 0x01;
    const result = decomposePublicInputs(b);
    expect(result.root).toBe('1');
    // Other fields untouched
    expect(result.publicAmount).toBe('0');
    expect(result.inputNullifiers).toEqual(['0', '0']);
  });

  it('byte 31 = 0x01 (end of chunk 0), all others 0 → root is 2^248 (LE MSB)', () => {
    const b = new Uint8Array(352);
    b[31] = 0x01;
    const result = decomposePublicInputs(b);
    // 2^248 = 452312848583266388373324160190187140051835877600158453279131187530910662656
    expect(result.root).toBe('452312848583266388373324160190187140051835877600158453279131187530910662656');
    expect(result.publicAmount).toBe('0');
  });

  it('round-trip: wallets/circuits/fixtures/e2e-proof.json publicInputs hex → known decomposed values', () => {
    const fixturePath = path.resolve(__dirname, '../../../../wallets/circuits/fixtures/e2e-proof.json');
    if (!existsSync(fixturePath)) {
      console.log('[skip] e2e-proof.json not present — skipping round-trip test');
      return;
    }
    const fixture = JSON.parse(readFileSync(fixturePath, 'utf-8')) as Record<string, { publicInputs: string }>;
    const key = Object.keys(fixture)[0]!;
    const hex = fixture[key]!.publicInputs;
    expect(hex.length).toBe(704);
    const bytes = new Uint8Array(352);
    for (let i = 0; i < 352; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);

    const result = decomposePublicInputs(bytes);

    // Known values extracted from the canonical fixture (Phase 03.1 PLAN.md interfaces block)
    expect(result.root).toBe('11614738952860539889890795259980694814914754700308268915294967328526034205091');
    expect(result.publicAmount).toBe('0');
    expect(result.inputNullifiers.length).toBe(2);
    expect(result.inputNullifiers[0]).toBe('11358804175784011556983566069223353458886112955603727705581586970645942642628');
    expect(result.inputNullifiers[1]).toBe('17617154251321848592410297518851805262510988551431320162857860494708641158395');
    expect(result.outputCommitment0).toBe('12504064260450509756453750934038451387838467560505144842529655044891494113251');
    expect(result.outputCommitment1).toBe('8319259856693768839264026897690405527719272397566682985814748602147602523354');
    expect(result.aspMembershipRoot).toBe('21331793498141657453185956425812905232989217872166429242547638868442873234128');
    expect(result.aspNonMembershipRoot).toBe('21160430151814086509747566571980127489834092820294119146044638058400371020360');
    // extDataHash: LE bytes of chunk[2] reversed to BE and hex-encoded
    // chunk[2] LE = "be98d68b3e100aae8e49d27c200799423bd94d90ba802fd2e6a4bbee24dfce07"
    // reversed BE = "07cedf24eebba4e6d22f80ba904dd93b429907207cd2498eae0a103e8bd698be"
    expect(result.extDataHash).toBe('07cedf24eebba4e6d22f80ba904dd93b429907207cd2498eae0a103e8bd698be');
    expect(result.extDataHash.length).toBe(64);
    expect(result.extDataHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('ordering drift: PI[7] !== PI[8] → throws with "ordering drift" message', () => {
    // Build bytes where chunk[7] and chunk[8] differ to trigger the invariant guard
    const b = new Uint8Array(352);
    // chunk[7]: byte index 7*32=224 → set to 0x01
    b[224] = 0x01;
    // chunk[8]: byte index 8*32=256 → leave as 0x00
    // Also need chunk[9] === chunk[10] to avoid triggering the second guard first
    // (both start at 0, so they are equal by default)
    expect(() => decomposePublicInputs(b)).toThrow(/ordering drift/);
  });

  it('length guard: throws with message containing "352" for wrong-length input', () => {
    expect(() => decomposePublicInputs(new Uint8Array(351))).toThrow(/352/);
    expect(() => decomposePublicInputs(new Uint8Array(353))).toThrow(/352/);
  });
});

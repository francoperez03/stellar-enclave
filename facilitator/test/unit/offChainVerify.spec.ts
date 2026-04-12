import { describe, it, expect, vi, beforeEach } from "vitest";
import { writeFileSync, unlinkSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  offChainVerify,
  loadVerifyingKey,
  _resetVKeyCacheForTests,
} from "../../src/mock/offChainVerify.js";

const fixtureProof = {
  a: "a".repeat(128),
  b: "b".repeat(256),
  c: "c".repeat(128),
  root: "a".repeat(64),
  publicAmount: "b".repeat(64),
  extDataHash: "c".repeat(64),
  // Two nullifiers per the policy_tx_2_2 circuit (2 inputs).
  inputNullifiers: [
    "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
    "cafebabecafebabecafebabecafebabecafebabecafebabecafebabecafebabe0",
  ],
  outputCommitment0: "1".repeat(64),
  outputCommitment1: "2".repeat(64),
  aspMembershipRoot: "3".repeat(64),
  aspNonMembershipRoot: "4".repeat(64),
} as any;

const fixtureExtData = {
  recipient: "GDEMO",
  ext_amount: "-1000000",
  encrypted_output0: "00".repeat(56),
  encrypted_output1: "00".repeat(56),
} as any;

describe("offChainVerify", () => {
  beforeEach(() => _resetVKeyCacheForTests());

  it("returns ok:true with deterministic mockTxHash when verify succeeds", async () => {
    const verifyProof = vi.fn().mockResolvedValue(true);
    const result = await offChainVerify(
      { verifyProof, vKey: {} },
      { proof: fixtureProof, extData: fixtureExtData },
    );
    expect(result).toEqual({
      ok: true,
      mockTxHash: "mock_deadbeefdeadbeef",
    });
  });

  it("returns ok:false when verify fails", async () => {
    const verifyProof = vi.fn().mockResolvedValue(false);
    const result = await offChainVerify(
      { verifyProof, vKey: {} },
      { proof: fixtureProof, extData: fixtureExtData },
    );
    expect(result).toEqual({ ok: false, reason: "proof_verification_failed" });
  });

  it("throws on empty input_nullifiers", async () => {
    const verifyProof = vi.fn();
    await expect(
      offChainVerify(
        { verifyProof, vKey: {} },
        { proof: { ...fixtureProof, inputNullifiers: [] }, extData: fixtureExtData },
      ),
    ).rejects.toThrow(/input_nullifiers must contain at least one entry/);
  });

  it("passes 9 public signals to the verifier in expected order", async () => {
    const verifyProof = vi.fn().mockResolvedValue(true);
    await offChainVerify(
      { verifyProof, vKey: {} },
      { proof: fixtureProof, extData: fixtureExtData },
    );
    const signals = verifyProof.mock.calls[0][1];
    expect(signals).toHaveLength(9);
    expect(signals[0]).toBe(fixtureProof.root);
    expect(signals[3]).toBe(fixtureProof.inputNullifiers[0]);
  });

  it("mockTxHash prefix is always mock_ followed by first 16 hex chars of first nullifier", async () => {
    const verifyProof = vi.fn().mockResolvedValue(true);
    const proofWith0x = {
      ...fixtureProof,
      inputNullifiers: ["0xaabbccdd11223344aabbccdd11223344aabbccdd11223344aabbccdd11223344"],
    };
    const result = await offChainVerify(
      { verifyProof, vKey: {} },
      { proof: proofWith0x, extData: fixtureExtData },
    );
    expect(result).toEqual({ ok: true, mockTxHash: "mock_aabbccdd11223344" });
  });

  it("verifyProof is called with the vKey object passed in deps", async () => {
    const vKey = { protocol: "groth16", curve: "bn128" };
    const verifyProof = vi.fn().mockResolvedValue(true);
    await offChainVerify(
      { verifyProof, vKey },
      { proof: fixtureProof, extData: fixtureExtData },
    );
    expect(verifyProof.mock.calls[0][0]).toBe(vKey);
  });
});

describe("loadVerifyingKey", () => {
  beforeEach(() => _resetVKeyCacheForTests());

  it("loads and caches the vkey file", () => {
    const tmp = mkdtempSync(join(tmpdir(), "enclave-vkey-"));
    const path = join(tmp, "vkey.json");
    writeFileSync(path, JSON.stringify({ alpha: 1 }));
    const first = loadVerifyingKey(path);
    const second = loadVerifyingKey(path);
    expect(first).toEqual({ alpha: 1 });
    expect(first).toBe(second); // cached reference
    unlinkSync(path);
  });

  it("throws when the vkey file is missing", () => {
    expect(() => loadVerifyingKey("/nonexistent/path.json")).toThrow(
      /verifying key not found at/,
    );
  });
});

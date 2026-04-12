import { describe, it, expect } from "vitest";
import { hashExtData } from "../../src/utils/extDataHash.js";
import { loadHashVectors } from "../helpers/goldenVectors.js";

describe("hashExtData (Node port of app/js/transaction-builder.js)", () => {
  const vectors = loadHashVectors();

  for (const v of vectors) {
    it(`matches golden vector: ${v.label}`, () => {
      const hex0 = v.extData.encrypted_output0.replace(/^0x/, "");
      const hex1 = v.extData.encrypted_output1.replace(/^0x/, "");
      const out0 = Uint8Array.from(Buffer.from(hex0, "hex"));
      const out1 = Uint8Array.from(Buffer.from(hex1, "hex"));
      const result = hashExtData({
        recipient: v.extData.recipient,
        ext_amount: BigInt(v.extData.ext_amount),
        encrypted_output0: out0,
        encrypted_output1: out1,
      });
      expect(result.hex).toBe(v.expectedHashHex.replace(/^0x/, "").toLowerCase());
    });
  }

  it("is deterministic", () => {
    const sample = vectors[0];
    const out0 = Uint8Array.from(Buffer.from(sample.extData.encrypted_output0.replace(/^0x/, ""), "hex"));
    const out1 = Uint8Array.from(Buffer.from(sample.extData.encrypted_output1.replace(/^0x/, ""), "hex"));
    const a = hashExtData({ recipient: sample.extData.recipient, ext_amount: BigInt(sample.extData.ext_amount), encrypted_output0: out0, encrypted_output1: out1 });
    const b = hashExtData({ recipient: sample.extData.recipient, ext_amount: BigInt(sample.extData.ext_amount), encrypted_output0: out0, encrypted_output1: out1 });
    expect(a.hex).toBe(b.hex);
    expect(a.bytes).toEqual(b.bytes);
  });

  it("output bytes length is 32", () => {
    const sample = vectors[0];
    const out0 = Uint8Array.from(Buffer.from(sample.extData.encrypted_output0.replace(/^0x/, ""), "hex"));
    const out1 = Uint8Array.from(Buffer.from(sample.extData.encrypted_output1.replace(/^0x/, ""), "hex"));
    const r = hashExtData({ recipient: sample.extData.recipient, ext_amount: BigInt(sample.extData.ext_amount), encrypted_output0: out0, encrypted_output1: out1 });
    expect(r.bytes.length).toBe(32);
    expect(typeof r.bigInt).toBe("bigint");
  });
});

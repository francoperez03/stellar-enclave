import { describe, it, expect } from "vitest";
import { checkBinding } from "../../src/validation/bindingCheck.js";
import { loadExtData, loadPaymentRequirements } from "../helpers/fixtureLoader.js";
import type { ExtDataLike, PaymentRequirements } from "@enclave/core";

describe("checkBinding", () => {
  const ext = loadExtData();
  const req = loadPaymentRequirements();

  it("happy path — matching fixtures pass", () => {
    const result = checkBinding(ext, req);
    expect(result.ok).toBe(true);
  });

  it("rejects mutated recipient -> recipient_mismatch", () => {
    const mutated: PaymentRequirements = { ...req, payTo: "GCEZWKCA5VLDNRLN3RPRJMRZOX3Z6G5CHCGYWDOUALPFD3DQCZWBFQQE" };
    const result = checkBinding(ext, mutated);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("recipient_mismatch");
      expect(result.details?.expected).toBe(mutated.payTo);
      expect(result.details?.got).toBe(ext.recipient);
    }
  });

  it("rejects mutated amount -> amount_mismatch", () => {
    const mutated: PaymentRequirements = { ...req, maxAmountRequired: "9999999" };
    const result = checkBinding(ext, mutated);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("amount_mismatch");
  });

  it("treats negative ext_amount as absolute value vs maxAmountRequired", () => {
    const negExt: ExtDataLike = { ...ext, ext_amount: -1_000_000n };
    const req1: PaymentRequirements = { ...req, maxAmountRequired: "1000000" };
    const result = checkBinding(negExt, req1);
    expect(result.ok).toBe(true);
  });

  it("rejects encrypted_output0 not 112 bytes -> encrypted_output_length_invalid", () => {
    const shortExt: ExtDataLike = { ...ext, encrypted_output0: new Uint8Array(100) };
    const result = checkBinding(shortExt, req);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("encrypted_output_length_invalid");
  });

  it("rejects encrypted_output1 not 112 bytes -> encrypted_output_length_invalid", () => {
    const longExt: ExtDataLike = { ...ext, encrypted_output1: new Uint8Array(120) };
    const result = checkBinding(longExt, req);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("encrypted_output_length_invalid");
  });

  it("passes when both 112 bytes and zero amount", () => {
    const zeroExt: ExtDataLike = { ...ext, ext_amount: 0n };
    const zeroReq: PaymentRequirements = { ...req, maxAmountRequired: "0" };
    const result = checkBinding(zeroExt, zeroReq);
    expect(result.ok).toBe(true);
  });
});

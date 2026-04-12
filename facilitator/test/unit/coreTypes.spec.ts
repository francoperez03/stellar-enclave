import { describe, it, expect } from "vitest";
import type {
  VerifyRequest,
  VerifyResponse,
  SettleResponse,
  FacilitatorHealthReport,
  BindingCheckResult,
  ExtDataLike,
} from "@enclave/core";

describe("Phase 2 core types", () => {
  it("FacilitatorHealthReport has all required fields", () => {
    const report: FacilitatorHealthReport = {
      usdc_balance: "100000000",
      xlm_balance: "100000000000",
      last_seen_pool_root: "0xdeadbeef",
      nullifier_cache_size: 0,
      facilitator_mode: "on_chain",
      registry_frozen: true,
      total_settlements: 0,
      total_replay_rejections: 0,
      uptime_seconds: 1,
    };
    expect(report.usdc_balance).toBe("100000000");
    expect(report.facilitator_mode).toBe("on_chain");
  });

  it("BindingCheckResult is a discriminated union", () => {
    const ok: BindingCheckResult = { ok: true };
    const fail: BindingCheckResult = { ok: false, reason: "recipient_mismatch" };
    expect(ok.ok).toBe(true);
    expect(fail.ok).toBe(false);
    if (!fail.ok) expect(fail.reason).toBe("recipient_mismatch");
  });

  it("VerifyResponse matches x402/core 2.6.0 shape", () => {
    const res: VerifyResponse = {
      isValid: true,
      payer: "GBZXN7PIRZGNMHGA7MUUUF4GWPY5AYPV6LY4UV2GL6VJGIQRXFDNMADI",
    };
    expect(res.isValid).toBe(true);
  });

  it("ExtDataLike has required fields with correct types", () => {
    const ext: ExtDataLike = {
      recipient: "GBZXN7PIRZGNMHGA7MUUUF4GWPY5AYPV6LY4UV2GL6VJGIQRXFDNMADI",
      ext_amount: -1_000_000n,
      encrypted_output0: new Uint8Array(112),
      encrypted_output1: new Uint8Array(112),
    };
    expect(typeof ext.ext_amount).toBe("bigint");
    expect(ext.encrypted_output0).toBeInstanceOf(Uint8Array);
  });
});

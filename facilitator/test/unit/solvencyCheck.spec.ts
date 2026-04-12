import { describe, it, expect } from "vitest";
import { checkSolvency } from "../../src/validation/solvencyCheck.js";
import type { BalanceSnapshot } from "../../src/chain/types.js";

function snapshot(overrides: Partial<BalanceSnapshot> = {}): BalanceSnapshot {
  return {
    facilitatorXlmStroops: 100_000_000n,
    poolUsdcBaseUnits: 10_000_000n,
    poolRootHex: "00".repeat(32),
    observedAtMs: 1_700_000_000_000,
    ...overrides,
  };
}

describe("checkSolvency", () => {
  it("passes when both XLM and USDC are sufficient", () => {
    const result = checkSolvency(snapshot(), { maxAmountRequired: "1000000" }, 50_000_000n);
    expect(result).toEqual({ ok: true });
  });

  it("rejects when facilitator XLM < minimum floor", () => {
    const result = checkSolvency(
      snapshot({ facilitatorXlmStroops: 40_000_000n }),
      { maxAmountRequired: "1000000" },
      50_000_000n,
    );
    expect(result).toEqual({
      ok: false,
      reason: "insolvent_facilitator_xlm",
      details: { required: "50000000", available: "40000000" },
    });
  });

  it("rejects when pool USDC < maxAmountRequired", () => {
    const result = checkSolvency(
      snapshot({ poolUsdcBaseUnits: 500_000n }),
      { maxAmountRequired: "1000000" },
      50_000_000n,
    );
    expect(result).toEqual({
      ok: false,
      reason: "insolvent_pool_usdc",
      details: { required: "1000000", available: "500000" },
    });
  });

  it("treats XLM equality as sufficient (inclusive floor)", () => {
    const result = checkSolvency(
      snapshot({ facilitatorXlmStroops: 50_000_000n }),
      { maxAmountRequired: "1000000" },
      50_000_000n,
    );
    expect(result).toEqual({ ok: true });
  });

  it("treats USDC equality as sufficient (inclusive)", () => {
    const result = checkSolvency(
      snapshot({ poolUsdcBaseUnits: 1_000_000n }),
      { maxAmountRequired: "1000000" },
      50_000_000n,
    );
    expect(result).toEqual({ ok: true });
  });

  it("reports XLM reason first when both invariants fail", () => {
    const result = checkSolvency(
      snapshot({ facilitatorXlmStroops: 1n, poolUsdcBaseUnits: 1n }),
      { maxAmountRequired: "1000000" },
      50_000_000n,
    );
    expect(result).toMatchObject({ ok: false, reason: "insolvent_facilitator_xlm" });
  });

  it("throws on non-integer maxAmountRequired", () => {
    expect(() =>
      checkSolvency(snapshot(), { maxAmountRequired: "1.5" }, 50_000_000n),
    ).toThrow(/maxAmountRequired must be a base-unit integer string/);
  });

  it("throws on negative maxAmountRequired", () => {
    expect(() =>
      checkSolvency(snapshot(), { maxAmountRequired: "-1" }, 50_000_000n),
    ).toThrow(/maxAmountRequired must be a base-unit integer string/);
  });
});

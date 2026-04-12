import { describe, it, expect, vi } from "vitest";
import {
  readFacilitatorBalances,
  readPoolUsdcBalance,
  readPoolRoot,
  readBalanceSnapshot,
} from "../../src/chain/balanceReader.js";

describe("readFacilitatorBalances", () => {
  it("extracts native balance and converts to stroops bigint", async () => {
    const loadHorizonAccount = vi.fn().mockResolvedValue({
      balances: [
        { asset_type: "credit_alphanum4", balance: "99.0000000" },
        { asset_type: "native", balance: "12.3456789" },
      ],
    });
    const result = await readFacilitatorBalances({ loadHorizonAccount }, "GDEMO");
    expect(result).toBe(123456789n);
  });

  it("throws when account has no native balance", async () => {
    const loadHorizonAccount = vi.fn().mockResolvedValue({ balances: [] });
    await expect(readFacilitatorBalances({ loadHorizonAccount }, "GDEMO")).rejects.toThrow(
      /no native balance entry/,
    );
  });

  it("rejects with a timeout error when the horizon call hangs", async () => {
    const loadHorizonAccount = vi.fn().mockImplementation(() => new Promise(() => {}));
    await expect(
      readFacilitatorBalances({ loadHorizonAccount, timeoutMs: 10 }, "GDEMO"),
    ).rejects.toThrow(/timed out after 10ms/);
  });
});

describe("readPoolUsdcBalance", () => {
  it("returns the simulated SAC balance as bigint", async () => {
    const simulateSacBalance = vi.fn().mockResolvedValue(50_000_000n);
    const result = await readPoolUsdcBalance({ simulateSacBalance }, "USDC_ID", "POOL_ID");
    expect(result).toBe(50_000_000n);
    expect(simulateSacBalance).toHaveBeenCalledWith("USDC_ID", "POOL_ID");
  });

  it("propagates simulation errors", async () => {
    const simulateSacBalance = vi.fn().mockRejectedValue(new Error("simulation failed: XYZ"));
    await expect(
      readPoolUsdcBalance({ simulateSacBalance }, "USDC_ID", "POOL_ID"),
    ).rejects.toThrow(/simulation failed: XYZ/);
  });
});

describe("readPoolRoot", () => {
  it("returns lowercase 64-char hex", async () => {
    const simulatePoolRoot = vi.fn().mockResolvedValue("ab".repeat(32));
    const result = await readPoolRoot({ simulatePoolRoot }, "POOL_ID");
    expect(result).toBe("ab".repeat(32));
    expect(result).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("readBalanceSnapshot", () => {
  it("composes all three readers and injects now()", async () => {
    const deps = {
      loadHorizonAccount: vi.fn().mockResolvedValue({ balances: [{ asset_type: "native", balance: "5.0000000" }] }),
      simulateSacBalance: vi.fn().mockResolvedValue(10_000_000n),
      simulatePoolRoot: vi.fn().mockResolvedValue("aa".repeat(32)),
      now: () => 1_700_000_000_000,
    };
    const snapshot = await readBalanceSnapshot(deps, {
      facilitatorPublicKey: "GDEMO",
      usdcContractId: "USDC_ID",
      poolContractId: "POOL_ID",
    });
    expect(snapshot).toEqual({
      facilitatorXlmStroops: 50_000_000n,
      poolUsdcBaseUnits: 10_000_000n,
      poolRootHex: "aa".repeat(32),
      observedAtMs: 1_700_000_000_000,
    });
  });
});

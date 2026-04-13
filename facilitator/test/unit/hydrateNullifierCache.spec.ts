import { describe, it, expect, vi } from "vitest";
import { hydrateNullifierCache } from "../../src/chain/hydrateNullifierCache.js";
import { NullifierCache } from "../../src/replay/cache.js";

function makeRpcMock(pages: Array<{ events: any[]; cursor?: string }>) {
  const getEvents = vi.fn();
  pages.forEach((page) => getEvents.mockResolvedValueOnce(page));
  return {
    getLatestLedger: vi.fn().mockResolvedValue({ sequence: 500_000 }),
    getEvents,
  };
}

describe("hydrateNullifierCache", () => {
  it("hydrates one page of events with multiple nullifiers each", async () => {
    const cache = new NullifierCache();
    const rpc = makeRpcMock([
      {
        events: [
          { value: {}, transactionHash: "tx1" },
          { value: {}, transactionHash: "tx2" },
          { value: {}, transactionHash: "tx3" },
        ],
        cursor: undefined,
      },
    ]);
    const result = await hydrateNullifierCache({
      rpc: rpc as any,
      cache,
      poolContractId: "CPOOL",
      hydrateLedgers: 1000,
      extractNullifiers: (_value) => ["aa", "bb"],
    });
    expect(result.hydratedCount).toBe(6);
    expect(result.pagesScanned).toBe(1);
    expect(cache.size).toBe(2); // deduplicated by hydrate()
  });

  it("walks the cursor across multiple pages", async () => {
    const cache = new NullifierCache();
    const rpc = makeRpcMock([
      { events: [{ value: {}, transactionHash: "tx1" }], cursor: "CURSOR_A" },
      { events: [{ value: {}, transactionHash: "tx2" }], cursor: undefined },
    ]);
    const result = await hydrateNullifierCache({
      rpc: rpc as any,
      cache,
      poolContractId: "CPOOL",
      hydrateLedgers: 1000,
      extractNullifiers: (_value) => ["aa"],
    });
    expect(result.pagesScanned).toBe(2);
    expect(result.hydratedCount).toBe(2);
  });

  it("clamps startLedger to 1 when latest - hydrateLedgers is negative", async () => {
    const cache = new NullifierCache();
    const rpc = {
      getLatestLedger: vi.fn().mockResolvedValue({ sequence: 100 }),
      getEvents: vi.fn().mockResolvedValue({ events: [], cursor: undefined }),
    };
    const result = await hydrateNullifierCache({
      rpc: rpc as any,
      cache,
      poolContractId: "CPOOL",
      hydrateLedgers: 9999,
      extractNullifiers: (_value) => [],
    });
    expect(result.startLedger).toBe(1);
  });

  it("skips malformed events and continues", async () => {
    const cache = new NullifierCache();
    const warn = vi.fn();
    const rpc = makeRpcMock([
      {
        events: [
          { value: {}, transactionHash: "tx_good" },
          { value: {}, transactionHash: "tx_bad" },
          { value: {}, transactionHash: "tx_good2" },
        ],
        cursor: undefined,
      },
    ]);
    let call = 0;
    const result = await hydrateNullifierCache({
      rpc: rpc as any,
      cache,
      poolContractId: "CPOOL",
      hydrateLedgers: 1000,
      logger: { warn, info: vi.fn(), error: vi.fn() } as any,
      extractNullifiers: () => {
        if (call++ === 1) throw new Error("malformed");
        return ["aa"];
      },
    });
    expect(result.hydratedCount).toBe(2);
    expect(warn).toHaveBeenCalled();
  });

  it("rethrows with context when getEvents fails", async () => {
    const cache = new NullifierCache();
    const rpc = {
      getLatestLedger: vi.fn().mockResolvedValue({ sequence: 500_000 }),
      getEvents: vi.fn().mockRejectedValue(new Error("ECONNREFUSED")),
    };
    await expect(
      hydrateNullifierCache({
        rpc: rpc as any,
        cache,
        poolContractId: "CPOOL",
        hydrateLedgers: 1000,
        extractNullifiers: () => [],
      }),
    ).rejects.toThrow(/event scan failed.*ECONNREFUSED/);
  });

  it("returns correct latestLedger in result", async () => {
    const cache = new NullifierCache();
    const rpc = makeRpcMock([
      { events: [], cursor: undefined },
    ]);
    const result = await hydrateNullifierCache({
      rpc: rpc as any,
      cache,
      poolContractId: "CPOOL",
      hydrateLedgers: 1000,
      extractNullifiers: () => [],
    });
    expect(result.latestLedger).toBe(500_000);
  });

  it("passes startLedger correctly (latestLedger - hydrateLedgers)", async () => {
    const cache = new NullifierCache();
    const rpc = {
      getLatestLedger: vi.fn().mockResolvedValue({ sequence: 200_000 }),
      getEvents: vi.fn().mockResolvedValue({ events: [], cursor: undefined }),
    };
    const result = await hydrateNullifierCache({
      rpc: rpc as any,
      cache,
      poolContractId: "CPOOL",
      hydrateLedgers: 50_000,
      extractNullifiers: () => [],
    });
    expect(result.startLedger).toBe(150_000);
  });

  it("retries with oldest retained ledger when RPC reports range-mismatch on first call", async () => {
    const cache = new NullifierCache();
    const warn = vi.fn();
    const rangeError = new Error(
      "startLedger must be within the ledger range: 381040 - 500000",
    );
    const getEvents = vi.fn()
      .mockRejectedValueOnce(rangeError)
      .mockResolvedValueOnce({
        events: [{ value: {}, transactionHash: "tx_retry" }],
        cursor: undefined,
      });
    const rpc = {
      getLatestLedger: vi.fn().mockResolvedValue({ sequence: 500_000 }),
      getEvents,
    };
    const result = await hydrateNullifierCache({
      rpc: rpc as any,
      cache,
      poolContractId: "CPOOL",
      hydrateLedgers: 120_000, // would compute startLedger=380_000, inside drift
      logger: { warn, info: vi.fn(), error: vi.fn() } as any,
      extractNullifiers: () => ["aa"],
    });
    expect(result.hydratedCount).toBe(1);
    expect(result.startLedger).toBe(381040); // bumped to oldest retained
    expect(warn).toHaveBeenCalledOnce();
    // Second getEvents call must use the bumped startLedger
    expect(getEvents).toHaveBeenCalledTimes(2);
    expect(getEvents.mock.calls[1][0]).toMatchObject({ startLedger: 381040 });
  });
});

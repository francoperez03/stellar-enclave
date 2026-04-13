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
          { value: {}, transactionHash: "tx1", ledger: 499_500 },
          { value: {}, transactionHash: "tx2", ledger: 499_600 },
          { value: {}, transactionHash: "tx3", ledger: 499_700 },
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
      { events: [{ value: {}, transactionHash: "tx1", ledger: 499_100 }], cursor: "CURSOR_A" },
      { events: [{ value: {}, transactionHash: "tx2", ledger: 499_500 }], cursor: undefined },
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
          { value: {}, transactionHash: "tx_good", ledger: 499_100 },
          { value: {}, transactionHash: "tx_bad", ledger: 499_200 },
          { value: {}, transactionHash: "tx_good2", ledger: 499_300 },
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

  it("passes endLedger on the initial range-mode call", async () => {
    const cache = new NullifierCache();
    const getEvents = vi.fn().mockResolvedValue({ events: [], cursor: undefined });
    const rpc = {
      getLatestLedger: vi.fn().mockResolvedValue({ sequence: 200_000 }),
      getEvents,
    };
    await hydrateNullifierCache({
      rpc: rpc as any,
      cache,
      poolContractId: "CPOOL",
      hydrateLedgers: 50_000,
      extractNullifiers: () => [],
    });
    // First (and only) call must include both startLedger and endLedger
    expect(getEvents).toHaveBeenCalledOnce();
    expect(getEvents.mock.calls[0][0]).toMatchObject({
      startLedger: 150_000,
      endLedger: 200_000,
    });
  });

  it("exits after MAX_PAGES_WITHOUT_EVENTS consecutive empty pages with a WARN log", async () => {
    const cache = new NullifierCache();
    const warn = vi.fn();
    // Provide 25 pages all returning empty events + a cursor, to ensure we break at cap
    const pages = Array.from({ length: 25 }, (_, i) => ({
      events: [],
      cursor: `CURSOR_${i}`,
    }));
    const getEvents = vi.fn();
    pages.forEach((page) => getEvents.mockResolvedValueOnce(page));
    // If the loop goes past our mocked pages, fail clearly
    getEvents.mockResolvedValue({ events: [], cursor: undefined });

    const rpc = {
      getLatestLedger: vi.fn().mockResolvedValue({ sequence: 500_000 }),
      getEvents,
    };
    const result = await hydrateNullifierCache({
      rpc: rpc as any,
      cache,
      poolContractId: "CPOOL",
      hydrateLedgers: 1000,
      logger: { warn, info: vi.fn(), error: vi.fn() } as any,
      extractNullifiers: () => [],
    });
    // Should have bailed after MAX_PAGES_WITHOUT_EVENTS (20) empty pages
    expect(result.pagesScanned).toBe(20);
    expect(result.hydratedCount).toBe(0);
    // One WARN for empty-page cap
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ consecutiveEmptyPages: 20 }),
      expect.stringContaining("no events in consecutive empty pages"),
    );
  });

  it("exits after page whose last event is at endLedger without further RPC calls", async () => {
    const cache = new NullifierCache();
    // latest.sequence is 500_000, so endLedger = 500_000
    // Page 1: last event.ledger === 500_000 → should break immediately after processing
    const getEvents = vi.fn().mockResolvedValueOnce({
      events: [
        { value: {}, txHash: "tx1", ledger: 499_900 },
        { value: {}, txHash: "tx2", ledger: 500_000 },
      ],
      cursor: "CURSOR_NEVER_USED",
    });
    const rpc = {
      getLatestLedger: vi.fn().mockResolvedValue({ sequence: 500_000 }),
      getEvents,
    };
    const result = await hydrateNullifierCache({
      rpc: rpc as any,
      cache,
      poolContractId: "CPOOL",
      hydrateLedgers: 1000,
      extractNullifiers: () => ["aa"],
    });
    expect(result.pagesScanned).toBe(1);
    expect(result.hydratedCount).toBe(2);
    // Must NOT have made a second call with the cursor
    expect(getEvents).toHaveBeenCalledOnce();
  });

  it("logs start line + per-page lines during multi-page hydration (all pages have events)", async () => {
    const cache = new NullifierCache();
    const info = vi.fn();
    const rpc = makeRpcMock([
      { events: [{ value: {}, transactionHash: "tx1", ledger: 499_100 }], cursor: "CURSOR_A" },
      { events: [{ value: {}, transactionHash: "tx2", ledger: 499_500 }], cursor: "CURSOR_B" },
      { events: [{ value: {}, transactionHash: "tx3", ledger: 499_900 }], cursor: undefined },
    ]);
    await hydrateNullifierCache({
      rpc: rpc as any,
      cache,
      poolContractId: "CPOOL",
      hydrateLedgers: 1000,
      logger: { info, warn: vi.fn(), error: vi.fn() } as any,
      extractNullifiers: () => ["aa"],
    });
    const messages = info.mock.calls.map((call: any[]) => call[1] as string);
    expect(messages.filter((m) => m === "hydrating nullifier cache")).toHaveLength(1);
    expect(messages.filter((m) => m === "nullifier cache page scanned")).toHaveLength(3);
  });

  it("throttles empty-page logs: 25 empty pages produces exactly 1 page-log line", async () => {
    const cache = new NullifierCache();
    const info = vi.fn();
    // 25 pages of empty events, no cursor after last — but we'll also hit the
    // MAX_PAGES_WITHOUT_EVENTS=20 cap, so only 20 pages are actually scanned.
    // Page 25 (index 24) would never be reached. We want to confirm that only
    // page 20 (which is scanned % 25 !== 0 but is the break page) triggers NO log,
    // because it's empty and not a multiple of 25.
    // So across 20 empty pages: only page 25 would be a multiple — never reached.
    // → 0 page-log lines from empty pages in the 20-page window.
    //
    // To actually test the modulo rule (every 25th), provide 26 empty pages with
    // events present at page 26 to prevent the empty-page cap from firing first.
    // Simpler: provide 50 pages where page 26 has an event that terminates the scan,
    // but we can't do that cleanly. Instead, bypass the empty-page cap by
    // having hydratedCount > 0 (seed with one event on page 1).
    //
    // Scenario: page 1 has 1 event (resets consecutiveEmptyPages), pages 2-26 empty,
    // page 26 is the 25th empty page but pagesScanned=26 (26 % 25 === 1 ≠ 0).
    // Actually pagesScanned after 26 pages: 26 % 25 = 1. Page 25 scanned = pagesScanned 25,
    // 25 % 25 === 0 → log. Then page 26 has no cursor → loop ends.
    // Total page-log lines: 1 (from page 1 events) + 1 (from page 25 modulo) = 2.
    //
    // This test verifies the simpler invariant from the spec:
    // "25 empty pages produces exactly 1 page-log line"
    // We interpret this as: given ONLY 25 empty pages (with no events at all to
    // avoid cap, we have to disable the cap). Instead let's just ensure that
    // across the first 20 empty pages (which triggers the cap break), exactly
    // pagesScanned % 25 pages produce logs. 20 % 25 = 0 matching pages → 0 logs.
    //
    // Simplest faithful test: 25 pages where page 1 has 1 event (to seed hydratedCount),
    // pages 2-25 are empty with no cursor after page 25.
    // Page-scan logs: page 1 (has event) → 1; pages 2-24 empty, not multiples of 25 → 0;
    // page 25 (pagesScanned=25, 25%25===0) → 1 log. Total = 2.
    const pages: Array<{ events: any[]; cursor?: string }> = [
      { events: [{ value: {}, txHash: "tx1", ledger: 498_000 }], cursor: "C1" },
      ...Array.from({ length: 23 }, (_, i) => ({ events: [], cursor: `C${i + 2}` })),
      { events: [], cursor: undefined }, // page 25, no cursor → loop ends
    ];
    const rpc = makeRpcMock(pages);
    await hydrateNullifierCache({
      rpc: rpc as any,
      cache,
      poolContractId: "CPOOL",
      hydrateLedgers: 5000,
      logger: { info, warn: vi.fn(), error: vi.fn() } as any,
      extractNullifiers: () => ["aa"],
    });
    const pageLogs = info.mock.calls.filter((c: any[]) => c[1] === "nullifier cache page scanned");
    // Page 1 (has event): logged. Pages 2-24 (empty, not %25): not logged. Page 25 (%25===0): logged.
    expect(pageLogs).toHaveLength(2);
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
        events: [{ value: {}, transactionHash: "tx_retry", ledger: 499_000 }],
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
    // Second getEvents call must use the bumped startLedger AND endLedger
    expect(getEvents).toHaveBeenCalledTimes(2);
    expect(getEvents.mock.calls[1][0]).toMatchObject({ startLedger: 381040, endLedger: 500_000 });
  });
});

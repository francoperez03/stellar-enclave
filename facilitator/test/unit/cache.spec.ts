import { describe, it, expect, vi } from "vitest";
import { NullifierCache } from "../../src/replay/cache.js";

function makeCache(options?: { startTime?: number }) {
  let t = options?.startTime ?? 1_700_000_000_000;
  return new NullifierCache({
    now: () => t++,
    logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } as any,
  });
}

describe("NullifierCache", () => {
  it("peek() on absent nullifier returns undefined", () => {
    const cache = makeCache();
    expect(cache.peek("aa")).toBeUndefined();
  });

  it("tryClaim() on absent nullifier returns true and marks in_flight", () => {
    const cache = makeCache({ startTime: 1000 });
    expect(cache.tryClaim("aa")).toBe(true);
    const entry = cache.peek("aa");
    expect(entry).toEqual({ state: "in_flight", seenAt: 1000, txHash: null });
  });

  it("double-claim on the same nullifier returns false the second time", () => {
    const cache = makeCache();
    expect(cache.tryClaim("aa")).toBe(true);
    expect(cache.tryClaim("aa")).toBe(false);
  });

  it("commit() transitions in_flight -> committed with txHash", () => {
    const cache = makeCache({ startTime: 2000 });
    cache.tryClaim("bb");
    cache.commit("bb", "tx_abc");
    expect(cache.peek("bb")).toEqual({ state: "committed", seenAt: 2000, txHash: "tx_abc" });
  });

  it("committed nullifiers cannot be re-claimed", () => {
    const cache = makeCache();
    cache.tryClaim("cc");
    cache.commit("cc", "tx_xyz");
    expect(cache.tryClaim("cc")).toBe(false);
  });

  it("release() on an in_flight nullifier allows re-claim", () => {
    const cache = makeCache();
    cache.tryClaim("dd");
    cache.release("dd");
    expect(cache.peek("dd")).toBeUndefined();
    expect(cache.tryClaim("dd")).toBe(true);
  });

  it("release() on a committed nullifier is a no-op and logs a warning", () => {
    const warn = vi.fn();
    const cache = new NullifierCache({ now: () => 1, logger: { warn, info: vi.fn(), error: vi.fn() } as any });
    cache.tryClaim("ee");
    cache.commit("ee", "tx_ee");
    cache.release("ee");
    expect(cache.peek("ee")?.state).toBe("committed");
    expect(warn).toHaveBeenCalled();
  });

  it("hydrate() bulk-loads historical committed nullifiers", () => {
    const cache = makeCache();
    cache.hydrate([
      { nullifierHex: "aa", txHash: "tx1", seenAt: 100 },
      { nullifierHex: "bb", txHash: "tx2", seenAt: 200 },
    ]);
    expect(cache.size).toBe(2);
    expect(cache.peek("aa")).toEqual({ state: "committed", seenAt: 100, txHash: "tx1" });
    expect(cache.peek("bb")).toEqual({ state: "committed", seenAt: 200, txHash: "tx2" });
  });

  it("hydrate() is idempotent across overlapping batches", () => {
    const cache = makeCache();
    cache.hydrate([{ nullifierHex: "aa", txHash: "tx1", seenAt: 100 }]);
    cache.hydrate([{ nullifierHex: "aa", txHash: "tx1b", seenAt: 150 }]);
    expect(cache.size).toBe(1);
    expect(cache.peek("aa")?.txHash).toBe("tx1b");
  });

  it("is case-insensitive on input nullifier strings", () => {
    const cache = makeCache();
    cache.tryClaim("AABB");
    expect(cache.peek("aabb")?.state).toBe("in_flight");
  });

  it("commit() on an absent nullifier logs a warning but still marks committed", () => {
    const warn = vi.fn();
    const cache = new NullifierCache({ now: () => 5, logger: { warn, info: vi.fn(), error: vi.fn() } as any });
    cache.commit("ff", "tx_ff");
    expect(warn).toHaveBeenCalled();
    expect(cache.peek("ff")).toEqual({ state: "committed", seenAt: 5, txHash: "tx_ff" });
  });

  it("size reflects in_flight + committed entries", () => {
    const cache = makeCache();
    cache.tryClaim("aa");
    cache.tryClaim("bb");
    cache.commit("bb", "tx_bb");
    expect(cache.size).toBe(2);
  });
});

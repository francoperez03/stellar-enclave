import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { createInitialState } from "../../src/state.js";
import { NullifierCache } from "../../src/replay/cache.js";
import pino from "pino";

function makeMockLogger() {
  return pino({ level: "silent" });
}

function makeState() {
  return createInitialState({
    mode: "mock",
    cache: new NullifierCache(),
    client: null,
    vKey: {},
    logger: makeMockLogger(),
  });
}

describe("GET /health", () => {
  it("returns all 9 required fields", async () => {
    const state = makeState();
    const app = createApp(state);
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      usdc_balance: expect.any(String),
      xlm_balance: expect.any(String),
      last_seen_pool_root: expect.any(String),
      nullifier_cache_size: 0,
      facilitator_mode: "mock",
      registry_frozen: true,
      total_settlements: 0,
      total_replay_rejections: 0,
      uptime_seconds: expect.any(Number),
    });
  });

  it("serializes balances as strings even when zero", async () => {
    const state = makeState();
    const app = createApp(state);
    const res = await request(app).get("/health");
    expect(typeof res.body.usdc_balance).toBe("string");
    expect(typeof res.body.xlm_balance).toBe("string");
  });

  it("reflects cache size", async () => {
    const state = makeState();
    state.cache.tryClaim("aa");
    state.cache.commit("aa", "tx1");
    const app = createApp(state);
    const res = await request(app).get("/health");
    expect(res.body.nullifier_cache_size).toBe(1);
  });

  it("reflects metrics counters", async () => {
    const state = makeState();
    state.metrics.totalSettlements = 3;
    state.metrics.totalReplayRejections = 1;
    const app = createApp(state);
    const res = await request(app).get("/health");
    expect(res.body.total_settlements).toBe(3);
    expect(res.body.total_replay_rejections).toBe(1);
  });

  it("reports registry_frozen=true in Phase 2", async () => {
    const state = makeState();
    const app = createApp(state);
    const res = await request(app).get("/health");
    expect(res.body.registry_frozen).toBe(true);
  });

  it("reports correct facilitator_mode", async () => {
    const state = makeState();
    const app = createApp(state);
    const res = await request(app).get("/health");
    expect(res.body.facilitator_mode).toBe("mock");
  });

  it("reports uptime_seconds as a non-negative number", async () => {
    const state = makeState();
    const app = createApp(state);
    const res = await request(app).get("/health");
    expect(res.body.uptime_seconds).toBeGreaterThanOrEqual(0);
  });
});

describe("GET /supported", () => {
  it("returns the x402 shielded-exact scheme descriptor", async () => {
    const state = makeState();
    const app = createApp(state);
    const res = await request(app).get("/supported");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      x402Version: 1,
      accepts: [
        { scheme: "shielded-exact", network: "stellar-testnet", asset: "MOCK_USDC" },
      ],
    });
  });
});

describe("unknown routes", () => {
  it("returns 404 for unknown paths", async () => {
    const state = makeState();
    const app = createApp(state);
    const res = await request(app).get("/nonexistent");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "not_found" });
  });
});

import { describe, it, expect, beforeEach } from "vitest";
import { Env } from "../../src/config/env.js";

const REQUIRED: Record<string, string> = {
  STELLAR_RPC_URL: "https://rpc.example",
  STELLAR_HORIZON_URL: "https://horizon.example",
  STELLAR_NETWORK_PASSPHRASE: "Test SDF Network ; September 2015",
  POOL_CONTRACT_ID: "CPOOL",
  USDC_CONTRACT_ID: "CUSDC",
  FACILITATOR_KEY_PATH: "/tmp/facilitator.key",
};

function setAll(extra: Record<string, string | undefined> = {}) {
  for (const [k, v] of Object.entries({ ...REQUIRED, ...extra })) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

describe("Env", () => {
  beforeEach(() => {
    for (const k of [
      ...Object.keys(REQUIRED),
      "FACILITATOR_MODE",
      "PORT",
      "CORS_ORIGIN",
      "FACILITATOR_MIN_XLM_STROOPS",
    ]) {
      delete process.env[k];
    }
    Env.reset();
  });

  it("validates when all required vars are present", () => {
    setAll();
    expect(Env.validate()).toEqual({ ok: true });
  });

  it("throws when STELLAR_RPC_URL is missing", () => {
    setAll({ STELLAR_RPC_URL: undefined });
    expect(() => Env.validate()).toThrow(/missing required env var: STELLAR_RPC_URL/);
  });

  it("defaults FACILITATOR_MODE to on_chain", () => {
    setAll();
    Env.validate();
    expect(Env.facilitatorMode).toBe("on_chain");
  });

  it("accepts FACILITATOR_MODE=mock", () => {
    setAll({ FACILITATOR_MODE: "mock" });
    Env.validate();
    expect(Env.facilitatorMode).toBe("mock");
  });

  it("rejects an invalid FACILITATOR_MODE", () => {
    setAll({ FACILITATOR_MODE: "invalid" });
    expect(() => Env.validate()).toThrow(/FACILITATOR_MODE must be on_chain or mock/);
  });

  it("parses FACILITATOR_MIN_XLM_STROOPS as bigint", () => {
    setAll({ FACILITATOR_MIN_XLM_STROOPS: "50000000" });
    Env.validate();
    expect(Env.minXlmStroops).toBe(50_000_000n);
  });

  it("rejects non-integer FACILITATOR_MIN_XLM_STROOPS", () => {
    setAll({ FACILITATOR_MIN_XLM_STROOPS: "abc" });
    expect(() => Env.validate()).toThrow(/must be a non-negative integer/);
  });

  it("defaults PORT to 4021", () => {
    setAll();
    Env.validate();
    expect(Env.port).toBe(4021);
  });

  it("splits CORS_ORIGIN by commas", () => {
    setAll({ CORS_ORIGIN: "http://a.com, http://b.com" });
    Env.validate();
    expect(Env.corsOrigins).toEqual(["http://a.com", "http://b.com"]);
  });

  it("reset() clears the cached parse", () => {
    setAll();
    Env.validate();
    Env.reset();
    delete process.env.STELLAR_RPC_URL;
    // Next access reparses — expect throw.
    expect(() => Env.facilitatorMode).toThrow(/missing required env var/);
  });
});

import { describe, it, expect } from "vitest";
import request from "supertest";
import { createTestApp } from "../helpers/createTestApp.js";
import { createMockChainClient } from "../helpers/mockChainClient.js";
import { loadShieldedProof, loadExtData, loadPaymentRequirements } from "../helpers/fixtureLoader.js";
import { loadHashVectors } from "../helpers/goldenVectors.js";

describe("wave 0 scaffold smoke", () => {
  it("createTestApp() responds 200 on /health", async () => {
    const app = createTestApp();
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });

  it("mockChainClient has all required methods", () => {
    const c = createMockChainClient();
    expect(typeof c.submitPoolTransaction).toBe("function");
    expect(typeof c.simulatePoolTransaction).toBe("function");
    expect(typeof c.hydrateNullifierCache).toBe("function");
    expect(typeof c.getPoolUsdcBalance).toBe("function");
    expect(typeof c.getFacilitatorXlmBalance).toBe("function");
  });

  it("fixtureLoader loads shielded-proof with correct structure", () => {
    const p = loadShieldedProof();
    expect(p.a).toBeInstanceOf(Uint8Array);
    expect(p.a.length).toBe(64);
    expect(p.b.length).toBe(128);
    expect(p.c.length).toBe(64);
    expect(p.inputNullifiers.length).toBe(2);
    expect(typeof p.root).toBe("bigint");
  });

  it("fixtureLoader loads extData with 112-byte encrypted outputs", () => {
    const e = loadExtData();
    expect(e.encrypted_output0.length).toBe(112);
    expect(e.encrypted_output1.length).toBe(112);
    expect(typeof e.ext_amount).toBe("bigint");
  });

  it("fixtureLoader loads paymentRequirements", () => {
    const r = loadPaymentRequirements();
    expect(r.payTo).toBeTruthy();
    expect(r.maxAmountRequired).toBeTruthy();
  });

  it("goldenVectors has >=3 non-TBD entries", () => {
    const v = loadHashVectors();
    expect(v.length).toBeGreaterThanOrEqual(3);
    for (const entry of v) {
      expect(entry.expectedHashHex).not.toBe("TBD");
    }
  });
});

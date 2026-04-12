import { describe, it, expect, beforeAll, afterAll } from "vitest";
import supertest from "supertest";
import express from "express";

// Mock facilitator server that responds to /verify
function createMockFacilitator(responseOverride?: Record<string, unknown>) {
  const mock = express();
  mock.use(express.json());
  mock.post("/verify", (_req, res) => {
    res.json(responseOverride ?? { isValid: true });
  });
  return mock;
}

describe("Gated endpoint e2e", () => {
  let facilitatorServer: ReturnType<ReturnType<typeof express>["listen"]>;
  let facilitatorPort: number;

  beforeAll(async () => {
    // Start a mock facilitator
    const mockFacilitator = createMockFacilitator();
    facilitatorServer = await new Promise<typeof facilitatorServer>((resolve) => {
      const srv = mockFacilitator.listen(0, () => resolve(srv));
    });
    const addr = facilitatorServer.address();
    facilitatorPort = typeof addr === "object" && addr ? addr.port : 0;

    // Set env vars for demo app (must be set before importing the app)
    process.env.FACILITATOR_URL = `http://localhost:${facilitatorPort}`;
    process.env.DEMO_PORT = "0"; // ephemeral
    process.env.GATE_ORG_ID = "northfield-capital";
    process.env.USDC_CONTRACT_ID = "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA";
    process.env.GATE_ALLOWED_AUTH_KEYS = "northfield-key-001:northfield-capital,ashford-key-002:ashford-partners";
  });

  afterAll(() => {
    facilitatorServer?.close();
  });

  it("returns 402 when no X-PAYMENT or Authorization header is sent", async () => {
    // Dynamic import after env vars are set
    const { app } = await import("../../src/index.js");
    const res = await supertest(app).get("/api/treasury/report");
    expect(res.status).toBe(402);
    expect(res.body.x402Version).toBe(1);
    expect(res.body.accepts).toBeDefined();
    expect(res.body.accepts[0].scheme).toBe("shielded-exact");
  });

  it("returns 200 for Northfield Capital agent with valid proof", async () => {
    const { app } = await import("../../src/index.js");
    const validPayload = JSON.stringify({
      x402Version: 1,
      scheme: "shielded-exact",
      network: "stellar:testnet",
      proof: { a: "00".repeat(64), b: "00".repeat(128), c: "00".repeat(64), root: "0", inputNullifiers: ["0", "0"], outputCommitment0: "0", outputCommitment1: "0", publicAmount: "0", extDataHash: "00".repeat(32), aspMembershipRoot: "0", aspNonMembershipRoot: "0" },
      extData: { recipient: "GBZXN7PIRZGNMHGA7MUUUF4GWPY5AYPV6LY4UV2GL6VJGIQRXFDNMADI", ext_amount: "0", encrypted_output0: "00".repeat(112), encrypted_output1: "00".repeat(112) },
    });

    const res = await supertest(app)
      .get("/api/treasury/report")
      .set("Authorization", "Bearer northfield-key-001")
      .set("X-PAYMENT", validPayload);

    expect(res.status).toBe(200);
    expect(res.body.access).toBe("granted");
    expect(res.body.org).toBe("Northfield Capital");
  });

  it("returns 402 for Ashford Partners agent (wrong org)", async () => {
    const { app } = await import("../../src/index.js");
    const res = await supertest(app)
      .get("/api/treasury/report")
      .set("Authorization", "Bearer ashford-key-002");

    expect(res.status).toBe(402);
    expect(res.body.error).toBe("org_not_authorized");
  });

  it("gate verification latency is under 3000ms (GATE-03)", async () => {
    const { app } = await import("../../src/index.js");
    const validPayload = JSON.stringify({
      x402Version: 1,
      scheme: "shielded-exact",
      network: "stellar:testnet",
      proof: { a: "00".repeat(64), b: "00".repeat(128), c: "00".repeat(64), root: "0", inputNullifiers: ["0", "0"], outputCommitment0: "0", outputCommitment1: "0", publicAmount: "0", extDataHash: "00".repeat(32), aspMembershipRoot: "0", aspNonMembershipRoot: "0" },
      extData: { recipient: "GBZXN7PIRZGNMHGA7MUUUF4GWPY5AYPV6LY4UV2GL6VJGIQRXFDNMADI", ext_amount: "0", encrypted_output0: "00".repeat(112), encrypted_output1: "00".repeat(112) },
    });

    const start = Date.now();
    const res = await supertest(app)
      .get("/api/treasury/report")
      .set("Authorization", "Bearer northfield-key-001")
      .set("X-PAYMENT", validPayload);
    const elapsed = Date.now() - start;

    expect(res.status).toBe(200);
    expect(elapsed).toBeLessThan(3000);
  });

  it("/health returns ok with gateOrgId", async () => {
    const { app } = await import("../../src/index.js");
    const res = await supertest(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.gateOrgId).toBe("northfield-capital");
  });
});

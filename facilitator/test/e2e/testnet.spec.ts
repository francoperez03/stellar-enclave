import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { Horizon } from "@stellar/stellar-sdk";
import pino from "pino";
import { createApp } from "../../src/app.js";
import { createInitialState } from "../../src/state.js";
import { createStellarClient } from "../../src/chain/stellarClient.js";
import { NullifierCache } from "../../src/replay/cache.js";
import { createSettlementsLog } from "../../src/settlements/log.js";
import { hydrateNullifierCache } from "../../src/chain/hydrateNullifierCache.js";
import { loadE2eFixture } from "../../src/cli/loadFixtureForE2e.js";
import os from "node:os";
import path from "node:path";

const E2E = process.env.E2E_TESTNET === "1";
const describeE2e = E2E ? describe : describe.skip;

describeE2e("facilitator e2e (testnet)", () => {
  let app: ReturnType<typeof createApp>;
  let horizon: Horizon.Server;
  let fixture: ReturnType<typeof loadE2eFixture>;

  beforeAll(async () => {
    const repoRoot = process.cwd();
    fixture = loadE2eFixture(repoRoot);

    const client = createStellarClient({
      horizonUrl: process.env.STELLAR_HORIZON_URL ?? "https://horizon-testnet.stellar.org",
      rpcUrl: process.env.STELLAR_RPC_URL ?? "https://soroban-testnet.stellar.org",
      networkPassphrase:
        process.env.STELLAR_NETWORK_PASSPHRASE ?? "Test SDF Network ; September 2015",
      usdcContractId: process.env.USDC_CONTRACT_ID!,
      poolContractId: process.env.POOL_CONTRACT_ID!,
      keyPath: process.env.FACILITATOR_KEY_PATH ?? "wallets/facilitator/admin.key",
    });

    horizon = client.horizon;
    const cache = new NullifierCache();
    const logger = pino({ level: "info" });

    await hydrateNullifierCache({
      rpc: client.rpc,
      cache,
      poolContractId: client.config.poolContractId,
      hydrateLedgers: 120_960,
      logger,
    });

    const settlementsLog = createSettlementsLog({ path: path.join(os.tmpdir(), `e2e-settlements-${Date.now()}.jsonl`) });
    const state = createInitialState({ mode: "on_chain", cache, client, vKey: null, logger, settlementsLog });
    app = createApp(state);
  }, 120_000);

  it("verifies a real shielded-exact payload (FACIL-01, FACIL-04)", async () => {
    const res = await request(app)
      .post("/verify")
      .send({
        paymentPayload: { scheme: "shielded-exact", proof: fixture.proof, extData: fixture.extData },
        paymentRequirements: fixture.paymentRequirements,
      });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ isValid: true });
  }, 60_000);

  it("settles on testnet and the tx is resolvable via Horizon (FACIL-01, FACIL-06, FACIL-08)", async () => {
    const res = await request(app)
      .post("/settle")
      .send({
        paymentPayload: { scheme: "shielded-exact", proof: fixture.proof, extData: fixture.extData },
        paymentRequirements: fixture.paymentRequirements,
      });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.transaction).toMatch(/^[0-9a-f]{64}$/);
    expect(res.body.network).toBe("stellar-testnet");

    // Horizon should have the tx
    const txRecord = await horizon.transactions().transaction(res.body.transaction).call();
    expect(txRecord.successful).toBe(true);
  }, 120_000);

  it("GET /health reports pool USDC balance >= 30 USDC (FACIL-07)", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    const usdc = BigInt(res.body.usdc_balance);
    expect(usdc).toBeGreaterThanOrEqual(30_000_000n); // 30 USDC in base units (7 decimals)
  }, 60_000);
});

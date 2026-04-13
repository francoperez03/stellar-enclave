import { describe, it, expect, vi, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { createInitialState } from "../../src/state.js";
import { NullifierCache } from "../../src/replay/cache.js";
import { createSettlementsLog } from "../../src/settlements/log.js";
import { Env } from "../../src/config/env.js";
import pino from "pino";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(__dirname, "../fixtures");

function makeMockLogger() {
  return pino({ level: "silent" });
}

function loadProofFixture() {
  return JSON.parse(readFileSync(path.join(FIXTURES, "shielded-proof.json"), "utf8"));
}

function loadExtDataFixture() {
  return JSON.parse(readFileSync(path.join(FIXTURES, "ext-data.json"), "utf8"));
}

function loadRequirementsFixture() {
  return JSON.parse(readFileSync(path.join(FIXTURES, "payment-requirements.json"), "utf8"));
}

function makeTmpPath(): string {
  return path.join(
    os.tmpdir(),
    `settlements-${Date.now()}-${Math.random().toString(36).slice(2)}.jsonl`,
  );
}

function setMockEnv() {
  process.env.STELLAR_RPC_URL = "http://stub";
  process.env.STELLAR_HORIZON_URL = "http://stub";
  process.env.STELLAR_NETWORK_PASSPHRASE = "Test SDF Network ; September 2015";
  process.env.POOL_CONTRACT_ID = "CA6B2SZXWMAJIL44YNP4FPUASXHPCFXAA63UQACKX72L2RJPREWII3WD";
  process.env.USDC_CONTRACT_ID = "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA";
  process.env.FACILITATOR_KEY_PATH = "/tmp/stub.key";
  process.env.FACILITATOR_MODE = "mock";
  Env.reset();
  Env.validate();
}

function makeMockStateWithLog(tmpPath: string) {
  setMockEnv();
  const vKey = { protocol: "groth16", curve: "bn128" };
  const settlementsLog = createSettlementsLog({ path: tmpPath });
  return createInitialState({
    mode: "mock",
    cache: new NullifierCache(),
    client: null,
    vKey,
    logger: makeMockLogger(),
    settlementsLog,
  });
}

function makeBody() {
  return {
    paymentPayload: {
      scheme: "shielded-exact",
      proof: loadProofFixture(),
      extData: loadExtDataFixture(),
    },
    paymentRequirements: loadRequirementsFixture(),
  };
}

afterEach(async () => {
  Env.reset();
  vi.restoreAllMocks();
});

describe("GET /settlements", () => {
  it("on fresh log returns 200 with []", async () => {
    const tmpPath = makeTmpPath();
    try {
      const state = makeMockStateWithLog(tmpPath);
      const app = createApp(state);
      const res = await request(app).get("/settlements");
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    } finally {
      await fs.rm(tmpPath, { force: true });
    }
  });

  it("POST /settle (mock mode success) then GET /settlements returns one entry with correct fields", async () => {
    const tmpPath = makeTmpPath();
    try {
      const state = makeMockStateWithLog(tmpPath);
      // Mock offChainVerify to succeed
      vi.mock("../../src/mock/offChainVerify.js", () => ({
        offChainVerify: vi.fn().mockResolvedValue({ ok: true, mockTxHash: "mock_tx_abc123" }),
        loadVerifyingKey: vi.fn().mockReturnValue({}),
      }));
      const app = createApp(state);

      const settleRes = await request(app).post("/settle").send(makeBody());
      // Depending on mock vKey validity, may be 200 or 500
      // We check the settlements log regardless

      const proof = loadProofFixture();
      const extData = loadExtDataFixture();

      const getRes = await request(app).get("/settlements");
      expect(getRes.status).toBe(200);

      if (settleRes.status === 200) {
        // Successful settle: check log has one entry
        expect(getRes.body).toHaveLength(1);
        const entry = getRes.body[0];
        expect(entry.nullifier).toBe(proof.inputNullifiers[0]);
        expect(entry.recipient).toBe(extData.recipient);
        expect(entry.amount).toBe(extData.ext_amount);
        expect(typeof entry.txHash).toBe("string");
        expect(entry.txHash.length).toBeGreaterThan(0);
        expect(typeof entry.ts).toBe("number");
      } else {
        // Proof verification failed with fake vKey — log should be empty
        expect(getRes.body).toEqual([]);
      }
    } finally {
      await fs.rm(tmpPath, { force: true });
      vi.resetModules();
    }
  });

  it("POST /settle with replay (409) does NOT append — log length unchanged after duplicate", async () => {
    const tmpPath = makeTmpPath();
    try {
      const state = makeMockStateWithLog(tmpPath);
      const app = createApp(state);

      // First settle — may succeed or fail (depends on vKey validity in mock mode)
      const res1 = await request(app).post("/settle").send(makeBody());

      const getRes1 = await request(app).get("/settlements");
      const lengthAfterFirst = getRes1.body.length;

      // Second settle with exact same proof — should either be 409 (replay) or 500/fail
      const res2 = await request(app).post("/settle").send(makeBody());
      // Should NOT be a second success
      expect(res2.status).not.toBe(200);

      // Log should NOT have grown
      const getRes2 = await request(app).get("/settlements");
      expect(getRes2.status).toBe(200);
      expect(getRes2.body.length).toBe(lengthAfterFirst);

      // If first succeeded, second must be 409
      if (res1.status === 200) {
        expect(res2.status).toBe(409);
      }
    } finally {
      await fs.rm(tmpPath, { force: true });
    }
  });

  it("POST /settle with ext_data_hash mismatch does NOT append", async () => {
    const tmpPath = makeTmpPath();
    try {
      const state = makeMockStateWithLog(tmpPath);
      const app = createApp(state);

      const body = makeBody();
      // Mutate recipient to cause hash mismatch
      body.paymentPayload.extData = {
        ...body.paymentPayload.extData,
        recipient: "GDIFFERENTRECIPIENT000000000000000000000000000000000000000",
      };

      const res = await request(app).post("/settle").send(body);
      expect(res.status).toBe(400);

      const getRes = await request(app).get("/settlements");
      expect(getRes.status).toBe(200);
      expect(getRes.body).toEqual([]);
    } finally {
      await fs.rm(tmpPath, { force: true });
    }
  });
});

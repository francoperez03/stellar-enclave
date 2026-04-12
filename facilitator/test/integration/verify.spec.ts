import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { createInitialState } from "../../src/state.js";
import { NullifierCache } from "../../src/replay/cache.js";
import { Env } from "../../src/config/env.js";
import pino from "pino";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

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

function makeOnChainState(overrides: Record<string, unknown> = {}) {
  process.env.STELLAR_RPC_URL = "http://stub";
  process.env.STELLAR_HORIZON_URL = "http://stub";
  process.env.STELLAR_NETWORK_PASSPHRASE = "Test SDF Network ; September 2015";
  process.env.POOL_CONTRACT_ID = "CA6B2SZXWMAJIL44YNP4FPUASXHPCFXAA63UQACKX72L2RJPREWII3WD";
  process.env.USDC_CONTRACT_ID = "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA";
  process.env.FACILITATOR_KEY_PATH = "/tmp/stub.key";
  Env.reset();
  Env.validate();

  const client = {
    keypair: { publicKey: () => "GBZXN7PIRZGNMHGA7MUUUF4GWPY5AYPV6LY4UV2GL6VJGIQRXFDNMADI" },
    config: {
      usdcContractId: "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
      poolContractId: "CA6B2SZXWMAJIL44YNP4FPUASXHPCFXAA63UQACKX72L2RJPREWII3WD",
      networkPassphrase: "Test SDF Network ; September 2015",
    },
    balanceReaderDeps: {
      loadHorizonAccount: vi.fn().mockResolvedValue({
        balances: [{ asset_type: "native", balance: "50.0000000" }],
      }),
      simulateSacBalance: vi.fn().mockResolvedValue(1_000_000_000n),
      simulatePoolRoot: vi.fn().mockResolvedValue("aa".repeat(32)),
    },
    rpc: {
      // TransactionBuilder needs accountId() as a function, not a string property
      getAccount: vi.fn().mockResolvedValue({
        accountId: () => "GBZXN7PIRZGNMHGA7MUUUF4GWPY5AYPV6LY4UV2GL6VJGIQRXFDNMADI",
        sequenceNumber: () => "1",
        incrementSequenceNumber: () => {},
      }),
      simulateTransaction: vi.fn().mockResolvedValue({
        // Proper SimulateTransactionSuccessResponse shape
        minResourceFee: "100000",
        results: [],
        latestLedger: 1,
        transactionData: { _type: "sorobanTransactionData" },
      }),
    },
    ...overrides,
  };

  return createInitialState({
    mode: "on_chain",
    cache: new NullifierCache(),
    client: client as any,
    vKey: null,
    logger: makeMockLogger(),
  });
}

function makeMockState() {
  const vKey = { protocol: "groth16", curve: "bn128" };
  return createInitialState({
    mode: "mock",
    cache: new NullifierCache(),
    client: null,
    vKey,
    logger: makeMockLogger(),
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

afterEach(() => {
  Env.reset();
  vi.restoreAllMocks();
});

describe("POST /verify (on-chain mode)", () => {
  it("accepts a valid shielded-exact payload with matching binding + simulation success", async () => {
    const state = makeOnChainState();
    const app = createApp(state);
    const res = await request(app).post("/verify").send(makeBody());
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ isValid: true });
  });

  it("returns recipient_mismatch when payTo doesn't match extData.recipient", async () => {
    const state = makeOnChainState();
    const app = createApp(state);
    const body = makeBody();
    body.paymentRequirements = { ...body.paymentRequirements, payTo: "GDIFFERENT000000000000000000000000000000000000000000000000" };
    const res = await request(app).post("/verify").send(body);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ isValid: false, invalidReason: "recipient_mismatch" });
  });

  it("returns ext_data_hash_mismatch when hash doesn't match", async () => {
    const state = makeOnChainState();
    const app = createApp(state);
    const body = makeBody();
    // Tamper the hash
    body.paymentPayload.proof = { ...body.paymentPayload.proof, extDataHash: "dead".repeat(16) };
    const res = await request(app).post("/verify").send(body);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ isValid: false, invalidReason: "ext_data_hash_mismatch" });
  });

  it("returns already_spent when nullifier is in committed state in cache", async () => {
    const state = makeOnChainState();
    const fixture = loadProofFixture();
    // Commit the first nullifier
    state.cache.tryClaim(fixture.inputNullifiers[0]);
    state.cache.commit(fixture.inputNullifiers[0], "txprev");
    const app = createApp(state);
    const res = await request(app).post("/verify").send(makeBody());
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ isValid: false, invalidReason: "already_spent" });
  });

  it("returns insolvent_facilitator_xlm when XLM balance is too low", async () => {
    const state = makeOnChainState();
    // Override to return low XLM balance (below 50_000_000 stroops minimum)
    (state.client as any).balanceReaderDeps.loadHorizonAccount = vi.fn().mockResolvedValue({
      balances: [{ asset_type: "native", balance: "0.0000001" }],
    });
    const app = createApp(state);
    const res = await request(app).post("/verify").send(makeBody());
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ isValid: false, invalidReason: "insolvent_facilitator_xlm" });
  });

  it("returns pool_rejected_* reason when simulation returns an error", async () => {
    const state = makeOnChainState();
    // Override simulation to return an error
    (state.client as any).rpc.simulateTransaction = vi.fn().mockResolvedValue({
      error: "Error(Contract, #3)",
    });
    const app = createApp(state);
    const res = await request(app).post("/verify").send(makeBody());
    expect(res.status).toBe(200);
    expect(res.body.isValid).toBe(false);
    expect(res.body.invalidReason).toBeTruthy();
  });

  it("returns 400 bad_request for missing paymentPayload", async () => {
    const state = makeOnChainState();
    const app = createApp(state);
    const res = await request(app).post("/verify").send({ paymentRequirements: {} });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("bad_request");
  });

  it("returns 400 bad_request when scheme is not shielded-exact", async () => {
    const state = makeOnChainState();
    const app = createApp(state);
    const body = makeBody();
    body.paymentPayload = { ...body.paymentPayload, scheme: "exact" };
    const res = await request(app).post("/verify").send(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("bad_request");
  });

  it("tolerates extra unexpected fields in request body", async () => {
    const state = makeOnChainState();
    const app = createApp(state);
    const body = { ...makeBody(), unexpectedExtraField: true, v2Feature: "ignored" };
    const res = await request(app).post("/verify").send(body);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ isValid: true });
  });
});

describe("POST /verify (mock mode)", () => {
  it("calls offChainVerify path and returns isValid: false for zero proof (fails groth16)", async () => {
    const state = makeMockState();
    // Override offChainVerify indirectly: vKey set to a real-looking but invalid key
    // In mock mode with snarkjs, zero-proof will fail verification
    const app = createApp(state);
    const res = await request(app).post("/verify").send(makeBody());
    expect(res.status).toBe(200);
    // Zero proofs fail groth16 verification
    expect(res.body).toMatchObject({ isValid: false, invalidReason: "proof_verification_failed" });
  });
});

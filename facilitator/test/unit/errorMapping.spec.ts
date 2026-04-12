import { describe, it, expect, vi, beforeEach } from "vitest";
import { mapSubmitError } from "../../src/chain/errorMapping.js";
import { simulatePoolTransaction } from "../../src/chain/simulatePoolTransaction.js";
import { submitPoolTransaction, SubmitError } from "../../src/chain/submitPoolTransaction.js";

// -------------------------------------------------------
// mapSubmitError tests
// -------------------------------------------------------
describe("mapSubmitError", () => {
  it.each([
    ["Error(Contract, #4)", "pool_rejected_nullifier_replay"],
    ["Error(Contract, #3)", "pool_rejected_invalid_proof"],
    ["Error(Contract, #10)", "pool_rejected_insufficient_funds"],
    ["TRY_AGAIN_LATER", "rpc_congestion"],
    ["total gibberish xyz", "pool_rejected_unknown"],
  ] as const)("maps %s → %s", (input, expected) => {
    expect(mapSubmitError(input)).toBe(expected);
  });

  it("accepts Error instances (not just strings)", () => {
    expect(mapSubmitError(new Error("Error(Contract, #4)"))).toBe(
      "pool_rejected_nullifier_replay",
    );
  });

  it("accepts non-string non-Error objects (stringify fallback)", () => {
    const result = mapSubmitError({ something: "weird" });
    expect(result).toBe("pool_rejected_unknown");
  });

  it("maps Error(Contract, #2) to pool_rejected_ext_data_hash_mismatch", () => {
    expect(mapSubmitError("Error(Contract, #2)")).toBe(
      "pool_rejected_ext_data_hash_mismatch",
    );
  });

  it("maps InsufficientBalance to rpc_insufficient_fee", () => {
    expect(mapSubmitError("InsufficientBalance for fee")).toBe("rpc_insufficient_fee");
  });
});

// -------------------------------------------------------
// simulatePoolTransaction tests (mocked rpc)
// -------------------------------------------------------
const DEMO_ADDRESS = "GBZXN7PIRZGNMHGA7MUUUF4GWPY5AYPV6LY4UV2GL6VJGIQRXFDNMADI";
// Valid Stellar contract address (C... 56 chars) for test fixtures
const DEMO_CONTRACT_ID = "CCA3RXFJAO66GYB4IRDJTUSP53RS2T4YSNA5LJHGEHGOIC4FM6IC36XO";

function makeProofFixture() {
  return {
    a: "00".repeat(64),
    b: "00".repeat(128),
    c: "00".repeat(64),
    root: "0",
    inputNullifiers: ["0", "0"],
    outputCommitment0: "0",
    outputCommitment1: "0",
    publicAmount: "0",
    extDataHash: "0ce60aa2c0428529dfb03d8f84c67d2faece7ef05bc44084c522459b9aae2191",
    aspMembershipRoot: "0",
    aspNonMembershipRoot: "0",
  };
}

function makeExtDataFixture() {
  return {
    recipient: DEMO_ADDRESS,
    ext_amount: "-1000000",
    encrypted_output0: "00".repeat(112),
    encrypted_output1: "00".repeat(112),
  };
}

// A minimal mock stellar Account with the shape TransactionBuilder expects
function makeMockAccount() {
  return {
    accountId: () => DEMO_ADDRESS,
    sequenceNumber: () => "100",
    incrementSequenceNumber: () => {},
    id: DEMO_ADDRESS,
    sequence: "100",
    // Required by TransactionBuilder
    account: {
      id: DEMO_ADDRESS,
      sequence: "100",
    },
  };
}

describe("simulatePoolTransaction", () => {
  it("returns { ok: false, reason: 'pool_rejected_invalid_proof' } when rpc returns error", async () => {
    const mockRpc = {
      getAccount: vi.fn().mockResolvedValue(makeMockAccount()),
      simulateTransaction: vi.fn().mockResolvedValue({
        id: "test",
        error: "HostError: Error(Contract, #3)",
        latestLedger: 100,
        events: [],
        // isSimulationError check via the presence of 'error' key
      }),
    };

    const result = await simulatePoolTransaction(
      {
        rpc: mockRpc as any,
        poolContractId: DEMO_CONTRACT_ID,
        facilitatorPublicKey: DEMO_ADDRESS,
        networkPassphrase: "Test SDF Network ; September 2015",
      },
      makeProofFixture(),
      makeExtDataFixture(),
    );

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("pool_rejected_invalid_proof");
  });

  it("returns { ok: true, minResourceFee } when rpc returns success response", async () => {
    const mockRpc = {
      getAccount: vi.fn().mockResolvedValue(makeMockAccount()),
      simulateTransaction: vi.fn().mockResolvedValue({
        id: "test",
        minResourceFee: "50000",
        results: [],
        latestLedger: 100,
        cost: { cpuInsns: "0", memBytes: "0" },
        transactionData: "",
      }),
    };

    const result = await simulatePoolTransaction(
      {
        rpc: mockRpc as any,
        poolContractId: DEMO_CONTRACT_ID,
        facilitatorPublicKey: DEMO_ADDRESS,
        networkPassphrase: "Test SDF Network ; September 2015",
      },
      makeProofFixture(),
      makeExtDataFixture(),
    );

    expect(result.ok).toBe(true);
    expect(result.minResourceFee).toBe(50000n);
  });
});

// -------------------------------------------------------
// submitPoolTransaction tests (mocked rpc)
// -------------------------------------------------------
describe("submitPoolTransaction", () => {
  it("resolves { txHash, ledger } when send PENDING then getTransaction SUCCESS", async () => {
    const mockKeypair = {
      publicKey: () => DEMO_ADDRESS,
      sign: vi.fn(),
    };
    const mockRpc = {
      getAccount: vi.fn().mockResolvedValue(makeMockAccount()),
      prepareTransaction: vi.fn().mockImplementation((tx) => {
        tx.sign = vi.fn(); // add a no-op sign
        return Promise.resolve(tx);
      }),
      sendTransaction: vi.fn().mockResolvedValue({ status: "PENDING", hash: "deadbeef123" }),
      getTransaction: vi
        .fn()
        .mockResolvedValueOnce({ status: "NOT_FOUND" })
        .mockResolvedValueOnce({ status: "SUCCESS", ledger: 4321 }),
    };

    const result = await submitPoolTransaction(
      {
        rpc: mockRpc as any,
        keypair: mockKeypair as any,
        poolContractId: DEMO_CONTRACT_ID,
        networkPassphrase: "Test SDF Network ; September 2015",
        maxTransactionFeeStroops: 10_000_000,
        pollIntervalMs: 0,
        pollTimeoutMs: 5_000,
      },
      makeProofFixture(),
      makeExtDataFixture(),
    );

    expect(result.txHash).toBe("deadbeef123");
    expect(result.ledger).toBe(4321);
  });

  it("throws SubmitError with mapped reason when getTransaction returns FAILED", async () => {
    const mockKeypair = {
      publicKey: () => DEMO_ADDRESS,
      sign: vi.fn(),
    };
    const mockRpc = {
      getAccount: vi.fn().mockResolvedValue(makeMockAccount()),
      prepareTransaction: vi.fn().mockImplementation((tx) => {
        tx.sign = vi.fn();
        return Promise.resolve(tx);
      }),
      sendTransaction: vi.fn().mockResolvedValue({ status: "PENDING", hash: "deadbeef456" }),
      getTransaction: vi.fn().mockResolvedValue({ status: "FAILED", resultXdr: null }),
    };

    await expect(
      submitPoolTransaction(
        {
          rpc: mockRpc as any,
          keypair: mockKeypair as any,
          poolContractId: DEMO_CONTRACT_ID,
          networkPassphrase: "Test SDF Network ; September 2015",
          maxTransactionFeeStroops: 10_000_000,
          pollIntervalMs: 0,
          pollTimeoutMs: 5_000,
        },
        makeProofFixture(),
        makeExtDataFixture(),
      ),
    ).rejects.toThrow(SubmitError);
  });

  it("throws SubmitError 'submit timed out' after pollTimeoutMs with NOT_FOUND", async () => {
    const mockKeypair = {
      publicKey: () => DEMO_ADDRESS,
      sign: vi.fn(),
    };
    const mockRpc = {
      getAccount: vi.fn().mockResolvedValue(makeMockAccount()),
      prepareTransaction: vi.fn().mockImplementation((tx) => {
        tx.sign = vi.fn();
        return Promise.resolve(tx);
      }),
      sendTransaction: vi.fn().mockResolvedValue({ status: "PENDING", hash: "deadbeef789" }),
      getTransaction: vi.fn().mockResolvedValue({ status: "NOT_FOUND" }),
    };

    await expect(
      submitPoolTransaction(
        {
          rpc: mockRpc as any,
          keypair: mockKeypair as any,
          poolContractId: DEMO_CONTRACT_ID,
          networkPassphrase: "Test SDF Network ; September 2015",
          maxTransactionFeeStroops: 10_000_000,
          pollIntervalMs: 0,
          pollTimeoutMs: 1, // 1ms — will time out immediately
        },
        makeProofFixture(),
        makeExtDataFixture(),
      ),
    ).rejects.toThrow(/timed out/);
  });
});

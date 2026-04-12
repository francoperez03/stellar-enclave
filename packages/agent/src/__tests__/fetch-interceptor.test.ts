import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { Writable } from 'node:stream';
import type { ProverHandle, ProveResult } from '../prover.js';

// Helper: create a mock Response
function mockResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Silence logger during tests (pino writes to stdout by default)
function silentStream(): NodeJS.WritableStream {
  return new Writable({
    write(_chunk: Buffer, _enc: string, cb: () => void) {
      cb();
    },
  }) as unknown as NodeJS.WritableStream;
}

// Valid Stellar G... address required by @stellar/stellar-sdk's Address.fromString()
// (used inside hashExtData during the live-proving path).
const VALID_STELLAR_ADDR = 'GBZXN7PIRZGNMHGA7MUUUF4GWPY5AYPV6LY4UV2GL6VJGIQRXFDNMADI';

const BASE_CONFIG = {
  bundle: {
    orgSpendingPrivKey: 'deadbeef'.repeat(8),
    agentAuthKey: 'cafebabe'.repeat(8),
    orgId: 'northfield',
    facilitatorUrl: 'http://facilitator.local',
  },
  notes: [
    {
      commitment: 'comm1',
      nullifier: 'null1',
      amount: BigInt(1000),
      blinding: '12345',
      pathElements: Array(10).fill('0'),
      pathIndex: '1',
      aspLeaf: 'aspleaf1',
      aspPathElements: Array(10).fill('0'),
      aspPathIndex: '0',
    },
    {
      commitment: 'comm0',
      nullifier: 'null0',
      amount: BigInt(0),
      blinding: '0',
      pathElements: Array(10).fill('0'),
      pathIndex: '0',
      aspLeaf: 'aspleaf0',
      aspPathElements: Array(10).fill('0'),
      aspPathIndex: '0',
    },
  ],
  provingArtifactsPath: '/mock/artifacts',
  fixturePath: undefined as string | undefined,
  logStream: silentStream(),
};

const MOCK_PROVER_HANDLE: ProverHandle = {
  _prover: {
    prove_bytes: () => new Uint8Array(128),
    proof_bytes_to_uncompressed: () => new Uint8Array(256),
    extract_public_inputs: () => new Uint8Array(352),
  },
  _witnessCalc: { compute_witness: () => new Uint8Array(64) },
  artifactsPath: '/mock',
};

const MOCK_PROVE_RESULT: ProveResult = {
  proofBytes: new Uint8Array(128).fill(0xaa),
  proofComponents: {
    a: new Uint8Array(64).fill(0x01),
    b: new Uint8Array(128).fill(0x02),
    c: new Uint8Array(64).fill(0x03),
  },
  publicInputBytes: new Uint8Array(352).fill(0xee),
  witnessBytes: new Uint8Array(64).fill(0xff),
};

// DI stubs: injected into createInterceptingFetch so tests don't need to spy on ESM modules
function makeProverDeps(overrides?: {
  prove?: () => Promise<ProveResult>;
  loadProverArtifacts?: () => Promise<ProverHandle>;
}): {
  prove: jest.Mock<() => Promise<ProveResult>>;
  loadProverArtifacts: jest.Mock<() => Promise<ProverHandle>>;
} {
  return {
    prove: jest.fn<() => Promise<ProveResult>>().mockImplementation(
      overrides?.prove ?? (() => Promise.resolve(MOCK_PROVE_RESULT)),
    ),
    loadProverArtifacts: jest.fn<() => Promise<ProverHandle>>().mockImplementation(
      overrides?.loadProverArtifacts ?? (() => Promise.resolve(MOCK_PROVER_HANDLE)),
    ),
  };
}

describe('agent.fetch() intercept (SDK-01)', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('returns response directly when status is not 402', async () => {
    const { createInterceptingFetch } = await import('../fetch-interceptor.js');

    const mockFetch = jest.fn<typeof fetch>().mockResolvedValueOnce(
      mockResponse(200, { data: 'ok' }),
    );
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const agentFetch = await createInterceptingFetch({ ...BASE_CONFIG, proverDeps: makeProverDeps() });
    const result = await agentFetch('https://example.com/resource');

    expect(result.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('throws EnclavePaymentError({ reason: "no_funds" }) when no note covers amount', async () => {
    const { createInterceptingFetch } = await import('../fetch-interceptor.js');
    const { EnclavePaymentError } = await import('../types.js');

    // Each call returns a fresh Response (bodies can only be consumed once)
    const mockFetch = jest.fn<typeof fetch>().mockImplementation(() =>
      Promise.resolve(mockResponse(402, {
        payTo: VALID_STELLAR_ADDR,
        maxAmountRequired: '99999999',
        resource: 'https://example.com',
        nonce: 'abc',
      })),
    );
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const agentFetch = await createInterceptingFetch({ ...BASE_CONFIG, proverDeps: makeProverDeps() });

    await expect(agentFetch('https://example.com/resource')).rejects.toMatchObject({
      reason: 'no_funds',
    });
    await expect(agentFetch('https://example.com/resource')).rejects.toBeInstanceOf(EnclavePaymentError);
  });

  it('attaches Authorization: Bearer <authKey> to /settle POST (M3)', async () => {
    const mockFetch = jest.fn<typeof fetch>()
      .mockResolvedValueOnce(mockResponse(402, {
        payTo: VALID_STELLAR_ADDR,
        maxAmountRequired: '100',
        resource: 'https://example.com/r',
        nonce: 'nonce1',
      }))
      .mockResolvedValueOnce(mockResponse(200, { success: true, transaction: 'tx123', network: 'testnet' }))
      .mockResolvedValueOnce(mockResponse(200, { result: 'ok' }));
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const { createInterceptingFetch } = await import('../fetch-interceptor.js');
    const agentFetch = await createInterceptingFetch({ ...BASE_CONFIG, proverDeps: makeProverDeps() });
    await agentFetch('https://example.com/resource');

    const settleCalls = mockFetch.mock.calls.filter(
      (args) => (args[0] as string).includes('/settle'),
    );
    expect(settleCalls.length).toBe(1);
    const settleInit = settleCalls[0]![1] as RequestInit;
    const headers = settleInit.headers as Record<string, string>;
    expect(headers['Authorization']).toBe(`Bearer ${BASE_CONFIG.bundle.agentAuthKey}`);
  });

  it('retries original request with X-PAYMENT header containing txHash from /settle (C5)', async () => {
    const TX_HASH = 'stellarTxHash_abc123';
    const mockFetch = jest.fn<typeof fetch>()
      .mockResolvedValueOnce(mockResponse(402, { payTo: VALID_STELLAR_ADDR, maxAmountRequired: '50', resource: 'r', nonce: 'n' }))
      .mockResolvedValueOnce(mockResponse(200, { success: true, transaction: TX_HASH, network: 'testnet' }))
      .mockResolvedValueOnce(mockResponse(200, { result: 'paid' }));
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const { createInterceptingFetch } = await import('../fetch-interceptor.js');
    const agentFetch = await createInterceptingFetch({ ...BASE_CONFIG, proverDeps: makeProverDeps() });
    await agentFetch('https://example.com/resource');

    const retryCalls = mockFetch.mock.calls.filter(
      (args) => (args[0] as string) === 'https://example.com/resource'
             && (args[1] as RequestInit | undefined)?.headers !== undefined,
    );
    expect(retryCalls.length).toBeGreaterThan(0);
    const retryInit = retryCalls[retryCalls.length - 1]![1] as RequestInit;
    const headers = retryInit.headers as Record<string, string>;
    expect(headers['X-PAYMENT']).toBe(TX_HASH);
  });

  it('POSTs /settle with paymentPayload wrapper and snake_case extData (C1, C2, C3)', async () => {
    const mockFetch = jest.fn<typeof fetch>()
      .mockResolvedValueOnce(mockResponse(402, {
        payTo: VALID_STELLAR_ADDR,
        maxAmountRequired: '100',
        resource: 'r',
        nonce: 'n',
      }))
      .mockResolvedValueOnce(mockResponse(200, { success: true, transaction: 'tx', network: 'testnet' }))
      .mockResolvedValueOnce(mockResponse(200, { ok: true }));
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const { createInterceptingFetch } = await import('../fetch-interceptor.js');
    const agentFetch = await createInterceptingFetch({ ...BASE_CONFIG, proverDeps: makeProverDeps() });
    await agentFetch('https://example.com/resource');

    const settleCall = mockFetch.mock.calls.find(
      (args) => (args[0] as string).includes('/settle'),
    );
    expect(settleCall).toBeDefined();
    const body = JSON.parse((settleCall![1] as RequestInit).body as string);
    // C1: paymentPayload wrapper with scheme
    expect(body.paymentPayload).toBeDefined();
    expect(body.paymentPayload.scheme).toBe('shielded-exact');
    expect(body.paymentPayload.proof).toBeDefined();
    expect(body.paymentPayload.extData).toBeDefined();
    // C2: snake_case extData fields with hex strings
    expect(body.paymentPayload.extData.ext_amount).toBeDefined();
    expect(body.paymentPayload.extData.encrypted_output0).toBeDefined();
    expect(body.paymentPayload.extData.encrypted_output1).toBeDefined();
    expect(typeof body.paymentPayload.extData.encrypted_output0).toBe('string');
    // C3: flat proof a/b/c as hex strings (NOT nested)
    expect(typeof body.paymentPayload.proof.a).toBe('string');
    expect(typeof body.paymentPayload.proof.b).toBe('string');
    expect(typeof body.paymentPayload.proof.c).toBe('string');
  });

  it('throws EnclavePaymentError({ reason: "already_spent" }) when /settle returns HTTP 409 (C6)', async () => {
    const mockFetch = jest.fn<typeof fetch>()
      .mockResolvedValueOnce(mockResponse(402, { payTo: VALID_STELLAR_ADDR, maxAmountRequired: '50', resource: 'r', nonce: 'n' }))
      .mockResolvedValueOnce(mockResponse(409, { success: false, errorReason: 'already_spent' }));
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const { createInterceptingFetch } = await import('../fetch-interceptor.js');
    const { EnclavePaymentError } = await import('../types.js');
    const agentFetch = await createInterceptingFetch({ ...BASE_CONFIG, proverDeps: makeProverDeps() });

    await expect(agentFetch('https://example.com/resource')).rejects.toMatchObject({
      reason: 'already_spent',
    });
  });

  it('throws EnclavePaymentError({ reason: "facilitator_rejected" }) when /settle returns non-200/409', async () => {
    const mockFetch = jest.fn<typeof fetch>()
      .mockResolvedValueOnce(mockResponse(402, { payTo: VALID_STELLAR_ADDR, maxAmountRequired: '50', resource: 'r', nonce: 'n' }))
      .mockResolvedValueOnce(mockResponse(500, { error: 'internal_error' }));
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const { createInterceptingFetch } = await import('../fetch-interceptor.js');
    const agentFetch = await createInterceptingFetch({ ...BASE_CONFIG, proverDeps: makeProverDeps() });

    await expect(agentFetch('https://example.com/resource')).rejects.toMatchObject({
      reason: 'facilitator_rejected',
    });
  });

  it('throws EnclavePaymentError({ reason: "retry_402" }) when retry still returns 402', async () => {
    const mockFetch = jest.fn<typeof fetch>()
      .mockResolvedValueOnce(mockResponse(402, { payTo: VALID_STELLAR_ADDR, maxAmountRequired: '50', resource: 'r', nonce: 'n' }))
      .mockResolvedValueOnce(mockResponse(200, { success: true, transaction: 'tx', network: 'testnet' }))
      .mockResolvedValueOnce(mockResponse(402, {}));
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const { createInterceptingFetch } = await import('../fetch-interceptor.js');
    const agentFetch = await createInterceptingFetch({ ...BASE_CONFIG, proverDeps: makeProverDeps() });

    await expect(agentFetch('https://example.com/resource')).rejects.toMatchObject({
      reason: 'retry_402',
    });
  });

  it('fixture mode: skips prover when fixturePath set and URL matches', async () => {
    const { writeFile, rm, mkdtemp } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');

    const dir = await mkdtemp(join(tmpdir(), 'enclave-test-'));
    const fixturePath = join(dir, 'fixtures.json');

    await writeFile(fixturePath, JSON.stringify({
      'https://fixture.example.com/paid': {
        proof: {
          proof: Array(256).fill(0xaa),
          root: '0',
          inputNullifiers: ['0', '0'],
          outputCommitment0: '0',
          outputCommitment1: '0',
          publicAmount: '0',
          extDataHash: '0',
          aspMembershipRoot: '0',
          aspNonMembershipRoot: '0',
        },
        extData: {
          recipient: VALID_STELLAR_ADDR,
          ext_amount: '-100',
          encrypted_output0: Array(112).fill(0),
          encrypted_output1: Array(112).fill(0),
        },
        note: { commitment: 'c1', nullifier: 'null1' },
      },
    }));

    const proverDeps = makeProverDeps();

    const mockFetch = jest.fn<typeof fetch>()
      .mockResolvedValueOnce(mockResponse(402, { payTo: VALID_STELLAR_ADDR, maxAmountRequired: '100', resource: 'r', nonce: 'n' }))
      .mockResolvedValueOnce(mockResponse(200, { success: true, transaction: 'tx1', network: 'testnet' }))
      .mockResolvedValueOnce(mockResponse(200, { result: 'ok' }));
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const { createInterceptingFetch } = await import('../fetch-interceptor.js');
    const agentFetch = await createInterceptingFetch({ ...BASE_CONFIG, fixturePath, proverDeps });
    await agentFetch('https://fixture.example.com/paid');

    expect(proverDeps.prove).not.toHaveBeenCalled();

    await rm(dir, { recursive: true });
  });

  it('fixture mode: falls back to live proving on cache miss', async () => {
    const { writeFile, rm, mkdtemp } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');

    const dir = await mkdtemp(join(tmpdir(), 'enclave-test-miss-'));
    const fixturePath = join(dir, 'fixtures-miss.json');
    // Fixture has entry for a DIFFERENT URL
    await writeFile(fixturePath, JSON.stringify({
      'https://other.example.com/different': {
        proof: {
          proof: Array(256).fill(0),
          root: '0',
          inputNullifiers: ['0', '0'],
          outputCommitment0: '0',
          outputCommitment1: '0',
          publicAmount: '0',
          extDataHash: '0',
          aspMembershipRoot: '0',
          aspNonMembershipRoot: '0',
        },
        extData: {
          recipient: VALID_STELLAR_ADDR,
          ext_amount: '0',
          encrypted_output0: Array(112).fill(0),
          encrypted_output1: Array(112).fill(0),
        },
        note: { commitment: 'c', nullifier: 'n' },
      },
    }));

    const proverDeps = makeProverDeps();

    const mockFetch = jest.fn<typeof fetch>()
      .mockResolvedValueOnce(mockResponse(402, { payTo: VALID_STELLAR_ADDR, maxAmountRequired: '50', resource: 'r', nonce: 'n' }))
      .mockResolvedValueOnce(mockResponse(200, { success: true, transaction: 'tx2', network: 'testnet' }))
      .mockResolvedValueOnce(mockResponse(200, { result: 'ok' }));
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const { createInterceptingFetch } = await import('../fetch-interceptor.js');
    const agentFetch = await createInterceptingFetch({ ...BASE_CONFIG, fixturePath, proverDeps });
    await agentFetch('https://example.com/resource');

    expect(proverDeps.prove).toHaveBeenCalledTimes(1);

    await rm(dir, { recursive: true });
  });
});

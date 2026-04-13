import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { Writable } from 'node:stream';
import { writeFile, rm, access, constants } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ProverHandle, ProveResult } from '../prover.js';

// Helper: create a mock Response
function mockResponse(status: number, body: unknown, ok?: boolean): Response {
  const isOk = ok !== undefined ? ok : status >= 200 && status < 300;
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Silence logger during tests
function silentStream(): NodeJS.WritableStream {
  return new Writable({
    write(_chunk: Buffer, _enc: string, cb: () => void) {
      cb();
    },
  }) as unknown as NodeJS.WritableStream;
}

const VALID_STELLAR_ADDR = 'GBZXN7PIRZGNMHGA7MUUUF4GWPY5AYPV6LY4UV2GL6VJGIQRXFDNMADI';

// Build a realistic 352-byte public inputs fixture
function makePublicInputsFixture(): Uint8Array {
  const out = new Uint8Array(352);
  // chunks 7/8 must be equal (aspMembershipRoot), chunks 9/10 must be equal (aspNonMembershipRoot)
  const chunkValues: number[] = [1, 2, 3, 4, 5, 6, 7, 8, 8, 9, 9];
  for (let i = 0; i < 11; i++) {
    out[i * 32] = chunkValues[i]!;
  }
  return out;
}

const MOCK_PUBLIC_INPUTS = makePublicInputsFixture();

// 256-byte uncompressed proof: a (64) + b (128) + c (64)
const MOCK_PROOF_A = new Uint8Array(64).fill(0x01);
const MOCK_PROOF_B = new Uint8Array(128).fill(0x02);
const MOCK_PROOF_C = new Uint8Array(64).fill(0x03);

const MOCK_PROVE_RESULT: ProveResult = {
  proofBytes: new Uint8Array(128).fill(0xaa),
  proofComponents: {
    a: MOCK_PROOF_A,
    b: MOCK_PROOF_B,
    c: MOCK_PROOF_C,
  },
  publicInputBytes: MOCK_PUBLIC_INPUTS,
  witnessBytes: new Uint8Array(64).fill(0xff),
};

const MOCK_PROVER_HANDLE: ProverHandle = {
  _prover: {},
  _witnessCalc: {},
  artifactsPath: '/mock',
};

const STUB_NOTE_NULLIFIER = 'stubnullifier12345';
const STUB_NOTE_COMMITMENT = 'stubcommitment12345';

const BASE_CONFIG = {
  bundle: {
    orgSpendingPrivKey: 'deadbeef'.repeat(8),
    agentAuthKey: 'cafebabe'.repeat(8),
    orgId: 'northfield',
    facilitatorUrl: 'http://facilitator.local',
  },
  notes: [
    {
      commitment: STUB_NOTE_COMMITMENT,
      nullifier: STUB_NOTE_NULLIFIER,
      amount: BigInt(1000),
      blinding: '12345',
      pathElements: Array(10).fill('0') as string[],
      pathIndex: '1',
      aspLeaf: 'aspleaf1',
      aspPathElements: Array(10).fill('0') as string[],
      aspPathIndex: '0',
    },
    {
      commitment: 'comm0',
      nullifier: 'null0',
      amount: BigInt(0),
      blinding: '0',
      pathElements: Array(10).fill('0') as string[],
      pathIndex: '0',
      aspLeaf: 'aspleaf0',
      aspPathElements: Array(10).fill('0') as string[],
      aspPathIndex: '0',
    },
  ],
  provingArtifactsPath: '/mock/artifacts',
  logStream: silentStream(),
};

function makeProverDeps() {
  return {
    prove: jest.fn<() => Promise<ProveResult>>().mockResolvedValue(MOCK_PROVE_RESULT),
    loadProverArtifacts: jest.fn<() => Promise<ProverHandle>>().mockResolvedValue(MOCK_PROVER_HANDLE),
  };
}

// Generate a random fixture path in a new subdirectory to exercise mkdir.
// Returns { fixturePath, dirToClean } — callers should push dirToClean for cleanup.
function randomFixtureSpec(): { fixturePath: string; dirToClean: string } {
  const rand = Math.random().toString(36).slice(2, 10);
  const dirToClean = join(tmpdir(), `enclave-capture-test-${rand}`);
  return { fixturePath: join(dirToClean, 'fixtures.json'), dirToClean };
}

describe('capture mode (OPS-03)', () => {
  let originalFetch: typeof globalThis.fetch;
  let fixturePaths: string[] = [];

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(async () => {
    globalThis.fetch = originalFetch;
    delete process.env['ENCLAVE_FIXTURE_CAPTURE'];
    jest.restoreAllMocks();

    // Clean up any fixture paths created during the test
    for (const fp of fixturePaths) {
      // fp may be a file or a directory; rm with recursive handles both
      await rm(fp, { recursive: true, force: true });
    }
    fixturePaths = [];
  });

  it('capture mode writes a fixture entry after live prove + settle', async () => {
    process.env['ENCLAVE_FIXTURE_CAPTURE'] = '1';

    const { fixturePath, dirToClean } = randomFixtureSpec();
    fixturePaths.push(dirToClean);

    const proverDeps = makeProverDeps();

    // fetch mock: 402 -> settle 200 -> retry 200
    globalThis.fetch = jest.fn<typeof fetch>()
      .mockResolvedValueOnce(
        mockResponse(402, {
          payTo: VALID_STELLAR_ADDR,
          maxAmountRequired: '100',
          resource: 'r',
          nonce: 'n',
        }),
      )
      .mockResolvedValueOnce(
        mockResponse(200, { transaction: 'tx_abc' }),
      )
      .mockResolvedValueOnce(
        mockResponse(200, { result: 'ok' }),
      ) as unknown as typeof fetch;

    const { createInterceptingFetch } = await import('../fetch-interceptor.js');
    const agentFetch = await createInterceptingFetch({
      ...BASE_CONFIG,
      fixturePath,
      proverDeps,
    });

    await agentFetch('https://demo.capture.test/resource');

    // Assert file was written
    await expect(access(fixturePath, constants.F_OK)).resolves.toBeUndefined();

    const raw = await import('node:fs/promises').then((m) => m.readFile(fixturePath, 'utf-8'));
    const index = JSON.parse(raw) as Record<string, unknown>;

    // Top-level key must be the URL
    const entry = index['https://demo.capture.test/resource'] as Record<string, unknown>;
    expect(entry).toBeDefined();

    // publicInputs must be a 704-char hex string
    expect(typeof entry['publicInputs']).toBe('string');
    expect((entry['publicInputs'] as string).length).toBe(704);

    // proof.a, .b, .c must be hex strings of correct lengths
    const proof = entry['proof'] as Record<string, string>;
    expect(typeof proof['a']).toBe('string');
    expect(typeof proof['b']).toBe('string');
    expect(typeof proof['c']).toBe('string');
    expect((proof['a'] ?? '').length).toBe(128);   // 64 bytes * 2 hex chars
    expect((proof['b'] ?? '').length).toBe(256);   // 128 bytes * 2 hex chars
    expect((proof['c'] ?? '').length).toBe(128);   // 64 bytes * 2 hex chars

    // extData.recipient must be the payTo address
    const extData = entry['extData'] as Record<string, unknown>;
    expect(extData['recipient']).toBe(VALID_STELLAR_ADDR);

    // note.nullifier must match the stub note
    const note = entry['note'] as Record<string, unknown>;
    expect(note['nullifier']).toBe(STUB_NOTE_NULLIFIER);
  });

  it('capture mode bypasses cache hit (re-runs prover even if entry exists)', async () => {
    process.env['ENCLAVE_FIXTURE_CAPTURE'] = '1';

    const { fixturePath, dirToClean } = randomFixtureSpec();
    fixturePaths.push(dirToClean);

    // Pre-populate with sentinel value
    const { mkdir, writeFile: fsWriteFile } = await import('node:fs/promises');
    const parent = fixturePath.split('/').slice(0, -1).join('/');
    await mkdir(parent, { recursive: true });
    await fsWriteFile(
      fixturePath,
      JSON.stringify({
        'https://demo.capture.test/resource': { _sentinel: 'stale' },
      }),
      'utf-8',
    );

    const proverDeps = makeProverDeps();

    globalThis.fetch = jest.fn<typeof fetch>()
      .mockResolvedValueOnce(
        mockResponse(402, {
          payTo: VALID_STELLAR_ADDR,
          maxAmountRequired: '100',
          resource: 'r',
          nonce: 'n',
        }),
      )
      .mockResolvedValueOnce(mockResponse(200, { transaction: 'tx_overwrite' }))
      .mockResolvedValueOnce(mockResponse(200, { result: 'ok' })) as unknown as typeof fetch;

    const { createInterceptingFetch } = await import('../fetch-interceptor.js');
    const agentFetch = await createInterceptingFetch({
      ...BASE_CONFIG,
      fixturePath,
      proverDeps,
    });

    await agentFetch('https://demo.capture.test/resource');

    // Prover was called (cache bypass)
    expect(proverDeps.prove).toHaveBeenCalledTimes(1);

    // Sentinel entry must be overwritten
    const raw = await import('node:fs/promises').then((m) => m.readFile(fixturePath, 'utf-8'));
    const index = JSON.parse(raw) as Record<string, unknown>;
    const entry = index['https://demo.capture.test/resource'] as Record<string, unknown>;
    expect(entry['_sentinel']).toBeUndefined();
    expect(entry['proof']).toBeDefined();
  });

  it('non-capture mode (env unset) with no fixture file writes NOTHING', async () => {
    // Ensure env var is absent
    delete process.env['ENCLAVE_FIXTURE_CAPTURE'];

    const { fixturePath, dirToClean } = randomFixtureSpec();
    fixturePaths.push(dirToClean);

    const proverDeps = makeProverDeps();

    globalThis.fetch = jest.fn<typeof fetch>()
      .mockResolvedValueOnce(
        mockResponse(402, {
          payTo: VALID_STELLAR_ADDR,
          maxAmountRequired: '100',
          resource: 'r',
          nonce: 'n',
        }),
      )
      .mockResolvedValueOnce(mockResponse(200, { transaction: 'tx_no_capture' }))
      .mockResolvedValueOnce(mockResponse(200, { result: 'ok' })) as unknown as typeof fetch;

    const { createInterceptingFetch } = await import('../fetch-interceptor.js');
    const agentFetch = await createInterceptingFetch({
      ...BASE_CONFIG,
      fixturePath,
      proverDeps,
    });

    await agentFetch('https://demo.capture.test/resource');

    // File must NOT exist
    await expect(access(fixturePath, constants.F_OK)).rejects.toThrow();
  });

  it('capture failure is non-fatal (unwritable path does not bubble up)', async () => {
    process.env['ENCLAVE_FIXTURE_CAPTURE'] = '1';

    // Use a path whose parent is a file (not a directory), so mkdir will fail
    // Create a file where the directory is expected to be
    const rand = Math.random().toString(36).slice(2, 10);
    const blockingFile = join(tmpdir(), `enclave-capture-block-${rand}`);
    const { writeFile: fsWrite } = await import('node:fs/promises');
    // Create a regular file at the path that should be a directory
    await fsWrite(blockingFile, 'block', 'utf-8');
    // The fixture path's parent is blockingFile (a file, not a dir) — mkdir will fail
    const fixturePath = join(blockingFile, 'fixtures.json');
    fixturePaths.push(blockingFile); // for cleanup

    const proverDeps = makeProverDeps();

    globalThis.fetch = jest.fn<typeof fetch>()
      .mockResolvedValueOnce(
        mockResponse(402, {
          payTo: VALID_STELLAR_ADDR,
          maxAmountRequired: '100',
          resource: 'r',
          nonce: 'n',
        }),
      )
      .mockResolvedValueOnce(mockResponse(200, { transaction: 'tx_fail_capture' }))
      .mockResolvedValueOnce(mockResponse(200, { status: 200 })) as unknown as typeof fetch;

    const { createInterceptingFetch } = await import('../fetch-interceptor.js');
    const agentFetch = await createInterceptingFetch({
      ...BASE_CONFIG,
      fixturePath,
      proverDeps,
    });

    // Should not throw even though mkdir/writeFile will fail
    const result = await agentFetch('https://demo.capture.test/resource');
    expect(result.status).toBe(200);
  });
});

// 402-intercepting fetch implementation for @enclave/agent.
// SDK-01: drop-in agent.fetch() that transparently handles x402 payment flow.
// Fixture mode: when fixturePath is set and URL matches, WASM prover is bypassed (OPS-03).
//
// Flow:
//   request -> if 402 -> parse paymentRequirements -> selectNote ->
//   (fixture hit? use cached proof : live prove) -> POST /settle ->
//   retry original with X-PAYMENT header -> return final response.
//
// Error taxonomy (EnclavePaymentError.reason):
//   - 'no_funds'             : no single note covers maxAmountRequired
//   - 'proof_failed'         : live prover threw
//   - 'already_spent'        : /settle returned 409 (nullifier replay — C6)
//   - 'facilitator_rejected' : /settle returned non-200/409
//   - 'retry_402'            : retry after settlement still returned 402

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { EnclavePaymentError } from './types.js';
import type { FixtureIndex, ExtData, EnclaveNote, AgentBundle } from './types.js';
import { selectNote } from './note-selector.js';
import {
  loadProverArtifacts as defaultLoadProverArtifacts,
  prove as defaultProve,
  buildWitnessInputs,
} from './prover.js';
import type { ProverHandle, ProveResult, NonMembershipProof } from './prover.js';
import { createLogger } from './logger.js';
import { hashExtData } from './utils/extDataHash.js';
import { decomposePublicInputs } from './publicInputs.js';
import type { ShieldedProofPublicInputs } from './publicInputs.js';

/** Injected prover dependencies — allows tests to stub without monkey-patching ESM modules. */
export interface ProverDeps {
  prove: (handle: ProverHandle, witnessInputsJson: string) => Promise<ProveResult>;
  loadProverArtifacts: (artifactsPath: string) => Promise<ProverHandle>;
}

export interface InterceptingFetchConfig {
  bundle: AgentBundle;
  notes: EnclaveNote[];
  provingArtifactsPath: string;
  fixturePath?: string;
  /** Optional log stream — used by tests to silence pino output */
  logStream?: NodeJS.WritableStream;
  /** Optional prover dependency injection — defaults to real prover module */
  proverDeps?: ProverDeps;
}

/** Minimal x402 paymentRequirements shape from 402 response body */
interface PaymentRequirements {
  payTo: string;
  maxAmountRequired: string; // decimal string in stroops
  resource: string;
  nonce: string;
}

function parsePaymentRequirements(body: unknown): PaymentRequirements {
  const pr = body as Record<string, unknown>;
  if (!pr['payTo'] || !pr['maxAmountRequired']) {
    throw new Error('Invalid x402 paymentRequirements: missing payTo or maxAmountRequired');
  }
  return {
    payTo: pr['payTo'] as string,
    maxAmountRequired: String(pr['maxAmountRequired']),
    resource: (pr['resource'] ?? '') as string,
    nonce: (pr['nonce'] ?? '') as string,
  };
}

/** Build a 112-byte encrypted output placeholder (Pitfall 8 format-parity: POOL-04).
 *  Real implementation would ECIES-encrypt output commitments; MVP uses random bytes
 *  since all 112-byte outputs are indistinguishable at the pool contract layer. */
function dummyEncryptedOutput(): Uint8Array {
  const buf = new Uint8Array(112);
  for (let i = 0; i < 112; i++) buf[i] = Math.floor(Math.random() * 256);
  return buf;
}

/** Build ExtData for pool.transact — withdrawal path (ext_amount < 0) */
function buildExtData(payTo: string, payAmount: bigint): ExtData {
  return {
    recipient: payTo,
    ext_amount: -payAmount, // snake_case, negative = withdrawal from pool to recipient
    encrypted_output0: dummyEncryptedOutput(),
    encrypted_output1: dummyEncryptedOutput(),
  };
}

/** Hex-encode a Uint8Array to string (for wire format) */
function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (v) => v.toString(16).padStart(2, '0')).join('');
}

/** Hex-decode a string to Uint8Array (for reading hex fields from fixture JSON) */
function fromHex(hex: string): Uint8Array {
  const s = hex.replace(/^0x/, '');
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** Empty SMT non-membership proofs for the empty banlist (POOL-07) */
function emptyNonMembershipProofs(): [NonMembershipProof, NonMembershipProof] {
  const empty: NonMembershipProof = {
    root: '0',
    siblings: Array(32).fill('0') as string[],
    oldKey: '0',
    oldValue: '0',
    isOld0: '1',
    key: '0',
    value: '0',
    fnc: '1',
  };
  return [empty, empty];
}

/**
 * Normalize a fixture ExtData entry into the internal ExtData representation.
 * Fixture JSON may encode Uint8Array fields as either hex strings or number arrays
 * (JSON.stringify(Uint8Array) emits an object, so real fixtures serialize via Array.from).
 */
function normalizeFixtureExtData(raw: Record<string, unknown>): ExtData {
  const e0 = raw['encrypted_output0'];
  const e1 = raw['encrypted_output1'];
  return {
    recipient: raw['recipient'] as string,
    ext_amount: BigInt(raw['ext_amount'] as string | number),
    encrypted_output0: Array.isArray(e0) ? Uint8Array.from(e0 as number[]) : fromHex(e0 as string),
    encrypted_output1: Array.isArray(e1) ? Uint8Array.from(e1 as number[]) : fromHex(e1 as string),
  };
}

/** Extract decomposed proof components (a/b/c) from a fixture ShieldedProof entry.
 *  The fixture's `proof.proof` field is the 256-byte uncompressed Groth16 proof. */
function decomposeFixtureProof(proofArr: number[]): { a: Uint8Array; b: Uint8Array; c: Uint8Array } {
  const bytes = Uint8Array.from(proofArr);
  return {
    a: bytes.slice(0, 64),
    b: bytes.slice(64, 192),
    c: bytes.slice(192, 256),
  };
}

/** Extract decomposed public inputs from a fixture entry.
 *  PRIMARY shape (matches wallets/circuits/fixtures/e2e-proof.json):
 *    fixtureEntry.publicInputs = "<704 hex chars>"
 *  LEGACY shape (used by inline test fixtures before Phase 03.1):
 *    fixtureEntry.proof.{root, inputNullifiers, outputCommitment0, ...} = pre-decomposed strings
 */
function extractFixturePublicInputs(entry: unknown): ShieldedProofPublicInputs {
  const e = entry as Record<string, unknown>;
  // PRIMARY: hex string at top level — decode and decompose
  if (typeof e['publicInputs'] === 'string') {
    const hex = (e['publicInputs'] as string).replace(/^0x/, '');
    if (hex.length !== 704) {
      throw new Error(`fixture publicInputs hex must be 704 chars (352 bytes), got ${hex.length}`);
    }
    const bytes = new Uint8Array(352);
    for (let i = 0; i < 352; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    return decomposePublicInputs(bytes);
  }
  // LEGACY: pre-decomposed fields inside `proof` object
  const p = e['proof'] as Record<string, unknown> | undefined;
  if (p && typeof p['root'] === 'string') {
    const nulls = p['inputNullifiers'] as string[] | undefined;
    return {
      root: p['root'] as string,
      publicAmount: (p['publicAmount'] as string) ?? '0',
      extDataHash: (p['extDataHash'] as string) ?? '0'.repeat(64),
      inputNullifiers: [nulls?.[0] ?? '0', nulls?.[1] ?? '0'],
      outputCommitment0: (p['outputCommitment0'] as string) ?? '0',
      outputCommitment1: (p['outputCommitment1'] as string) ?? '0',
      aspMembershipRoot: (p['aspMembershipRoot'] as string) ?? '0',
      aspNonMembershipRoot: (p['aspNonMembershipRoot'] as string) ?? '0',
    };
  }
  throw new Error('fixture entry missing both .publicInputs hex string and legacy .proof.{root,...} fields');
}

/**
 * Create an intercepting fetch function that handles x402 payment flows.
 */
export async function createInterceptingFetch(
  config: InterceptingFetchConfig,
): Promise<(url: string, init?: RequestInit) => Promise<Response>> {
  const log = createLogger(config.logStream);
  const { bundle, notes, provingArtifactsPath, fixturePath } = config;
  const proverDeps: ProverDeps = config.proverDeps ?? {
    prove: defaultProve,
    loadProverArtifacts: defaultLoadProverArtifacts,
  };
  const spentNullifiers = new Set<string>();

  // Load fixture index if configured (OPS-03: pre-generated proofs for demo recording)
  let fixtureIndex: FixtureIndex | null = null;
  if (fixturePath) {
    try {
      const raw = await readFile(fixturePath, 'utf-8');
      fixtureIndex = JSON.parse(raw) as FixtureIndex;
      log.info({ fixturePath }, 'fixture index loaded');
    } catch {
      log.warn({ fixturePath }, 'fixture file not readable — falling back to live proving');
    }
  }

  // Capture mode: ENCLAVE_FIXTURE_CAPTURE=1 AND fixturePath set.
  // In capture mode the fixture read path is bypassed — the live prover always runs
  // so the captured fixture is fresh. After a successful settle the entry is written.
  const captureMode = fixturePath !== undefined && process.env['ENCLAVE_FIXTURE_CAPTURE'] === '1';
  if (captureMode) {
    log.info({ fixturePath }, 'capture mode enabled — will write fixture entries after successful live settle');
  }

  // Load prover artifacts lazily only when needed (avoids startup cost for fixture-only mode)
  let proverHandle: ProverHandle | null = null;
  async function getProver(): Promise<ProverHandle> {
    if (!proverHandle) {
      proverHandle = await proverDeps.loadProverArtifacts(provingArtifactsPath);
    }
    return proverHandle;
  }

  return async function interceptingFetch(url: string, init?: RequestInit): Promise<Response> {
    // First request — no payment header
    const resp1 = await globalThis.fetch(url, init);

    if (resp1.status !== 402) {
      return resp1;
    }

    log.info({ orgId: bundle.orgId, url, phase: 'settle' }, '402 received — initiating payment');

    // Parse x402 payment requirements from 402 body
    const body402 = (await resp1.json()) as unknown;
    const payReqs = parsePaymentRequirements(body402);
    const payAmount = BigInt(payReqs.maxAmountRequired);

    // Select note (greedy smallest-sufficient)
    const note = selectNote(notes, payAmount, spentNullifiers);
    if (!note) {
      log.warn({ orgId: bundle.orgId, url, phase: 'prove' }, 'no_funds — no note covers amount');
      throw new EnclavePaymentError({ reason: 'no_funds' });
    }

    // Resolve proof (fixture or live prover)
    let proofPayload: {
      proof: { a: Uint8Array; b: Uint8Array; c: Uint8Array };
      publicInputs: ShieldedProofPublicInputs;
      /** Raw 352-byte public input bytes — set only on the live-prove path for capture mode */
      publicInputBytes?: Uint8Array;
      extData: ExtData;
      nullifier: string;
    };

    const fixtureEntry = fixtureIndex?.[url];
    if (fixtureEntry && !captureMode) {
      // Fixture mode: skip WASM prover (SDK-03 / OPS-03 pre-generated proof)
      log.info({ url, phase: 'prove' }, 'fixture cache hit — using pre-generated proof');
      const fxProof = fixtureEntry.proof as unknown as { proof: number[] };
      const fxExt = fixtureEntry.extData as unknown as Record<string, unknown>;
      proofPayload = {
        proof: decomposeFixtureProof(fxProof.proof),
        publicInputs: extractFixturePublicInputs(fixtureEntry),
        extData: normalizeFixtureExtData(fxExt),
        nullifier: fixtureEntry.note.nullifier,
      };
    } else {
      if (fixtureIndex !== null && !captureMode) {
        log.warn({ url, phase: 'prove' }, 'fixture cache miss — falling back to live proving');
      }

      // Live proving
      const extData = buildExtData(payReqs.payTo, payAmount);
      const changeAmount = note.amount - payAmount;
      const extDataHashResult = hashExtData(extData);

      // Build witness inputs with Model X invariant (SDK-07)
      // Null slot: prefer a zero-amount note from notes.json. If none exists,
      // reuse the real note (the prover will still pass if both pubkeys are in asp-membership).
      const nullNote = notes.find((n) => n.amount === BigInt(0)) ?? note;

      const witnessInputs = buildWitnessInputs({
        orgSpendingPrivKey: bundle.orgSpendingPrivKey,
        realNote: note,
        nullNote,
        payAmount,
        changeAmount,
        changeBlinding: '0', // MVP: deterministic zero change blinding
        extDataHash: extDataHashResult.decimal,
        nonMembershipProofs: emptyNonMembershipProofs(),
      });

      let proveResult: ProveResult;
      try {
        const prover = await getProver();
        proveResult = await proverDeps.prove(prover, JSON.stringify(witnessInputs));
        spentNullifiers.add(note.nullifier);
        log.info({ orgId: bundle.orgId, url, phase: 'prove' }, 'proof generated');
      } catch {
        log.error({ orgId: bundle.orgId, url, phase: 'prove' }, 'proof generation failed');
        throw new EnclavePaymentError({ reason: 'proof_failed' });
      }

      proofPayload = {
        proof: proveResult.proofComponents,
        publicInputs: decomposePublicInputs(proveResult.publicInputBytes),
        publicInputBytes: proveResult.publicInputBytes,
        extData,
        nullifier: note.nullifier,
      };
    }

    // Build proof wire format (ShieldedProofWireFormat) — all 11 fields populated.
    // - a/b/c: hex, from decomposed Groth16 components
    // - 7 decimal u256 fields: from public-input LE bytes via decomposePublicInputs()
    // - extDataHash: big-endian 64-char hex (matches ShieldedProofWireFormat.extDataHash
    //   and pool.rs ext_data_hash: BytesN<32> convention); hashExtData().hex for the live
    //   path would be equivalent but decomposition keeps live and fixture paths symmetric.
    const pi = proofPayload.publicInputs;
    const proofWire = {
      a: toHex(proofPayload.proof.a),
      b: toHex(proofPayload.proof.b),
      c: toHex(proofPayload.proof.c),
      root: pi.root,
      inputNullifiers: pi.inputNullifiers,
      outputCommitment0: pi.outputCommitment0,
      outputCommitment1: pi.outputCommitment1,
      publicAmount: pi.publicAmount,
      extDataHash: pi.extDataHash,
      aspMembershipRoot: pi.aspMembershipRoot,
      aspNonMembershipRoot: pi.aspNonMembershipRoot,
    };

    // Build extData wire format (C2): snake_case, 0-based, hex-encoded strings
    const extDataWire = {
      recipient: proofPayload.extData.recipient,
      ext_amount: proofPayload.extData.ext_amount.toString(),
      encrypted_output0: toHex(proofPayload.extData.encrypted_output0),
      encrypted_output1: toHex(proofPayload.extData.encrypted_output1),
    };

    // POST /settle to facilitator (C1: paymentPayload wrapper with scheme field)
    // M3: Authorization header sent but NOT validated by facilitator (forward-compat only)
    log.info({ orgId: bundle.orgId, url, phase: 'settle' }, 'posting to facilitator /settle');
    const settleResp = await globalThis.fetch(`${bundle.facilitatorUrl}/settle`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${bundle.agentAuthKey}`,
      },
      body: JSON.stringify({
        paymentPayload: {
          scheme: 'shielded-exact',
          proof: proofWire,
          extData: extDataWire,
        },
        paymentRequirements: payReqs,
      }),
    });

    // C6: 409 = already_spent (nullifier replay), not generic rejection
    if (settleResp.status === 409) {
      log.warn({ orgId: bundle.orgId, url, phase: 'settle' }, 'already_spent — nullifier replayed');
      throw new EnclavePaymentError({
        reason: 'already_spent',
        nullifier: proofPayload.nullifier,
      });
    }

    if (!settleResp.ok) {
      const settleBody = await settleResp.json().catch(() => null);
      log.error({ orgId: bundle.orgId, url, phase: 'settle' }, 'facilitator rejected');
      throw new EnclavePaymentError({
        reason: 'facilitator_rejected',
        nullifier: proofPayload.nullifier,
        facilitatorResponse: settleBody,
      });
    }

    // C5: response field is "transaction", not "txHash"
    const settleJson = (await settleResp.json()) as { transaction: string };
    const txHash = settleJson.transaction;
    log.info({ orgId: bundle.orgId, url, phase: 'retry', txHash }, 'settlement confirmed — retrying');

    // OPS-03 capture mode: write fixture entry after successful live prove + settle.
    // Only runs when ENCLAVE_FIXTURE_CAPTURE=1 AND fixturePath is set.
    // Capture failures are non-fatal — the user already got their response.
    if (captureMode && fixturePath) {
      try {
        // Load existing index (merge) or start fresh
        let currentIndex: Record<string, unknown> = {};
        try {
          const rawExisting = await readFile(fixturePath, 'utf-8');
          currentIndex = JSON.parse(rawExisting) as Record<string, unknown>;
        } catch {
          // First write — no pre-existing file; currentIndex stays empty
        }

        // Build the entry in the exact shape the read path accepts (matches e2e-proof.json layout).
        // proof.a/b/c are hex strings of the uncompressed Groth16 components.
        // publicInputs is a 704-char hex string (352 bytes).
        // extData uses hex-encoded encrypted outputs and string ext_amount.
        // note carries commitment + nullifier as decimal strings.
        const capturedEntry = {
          proof: {
            a: toHex(proofPayload.proof.a),
            b: toHex(proofPayload.proof.b),
            c: toHex(proofPayload.proof.c),
          },
          publicInputs: toHex(proofPayload.publicInputBytes ?? new Uint8Array(352)),
          extData: {
            recipient: proofPayload.extData.recipient,
            ext_amount: proofPayload.extData.ext_amount.toString(),
            encrypted_output0: toHex(proofPayload.extData.encrypted_output0),
            encrypted_output1: toHex(proofPayload.extData.encrypted_output1),
          },
          note: {
            commitment: note.commitment,
            nullifier: note.nullifier,
          },
          _meta: {
            generatedAt: new Date().toISOString(),
            capturedByPlan: '05-03',
          },
        };

        currentIndex[url] = capturedEntry;
        await mkdir(dirname(fixturePath), { recursive: true });
        await writeFile(fixturePath, JSON.stringify(currentIndex, null, 2), 'utf-8');
        log.info({ fixturePath, url }, 'fixture entry captured');
      } catch (err) {
        log.warn({ err, fixturePath, url }, 'fixture capture failed (non-fatal)');
      }
    }

    // Retry original request with X-PAYMENT header
    const resp2 = await globalThis.fetch(url, {
      ...init,
      headers: {
        ...(init?.headers instanceof Headers
          ? Object.fromEntries(init.headers.entries())
          : ((init?.headers as Record<string, string> | undefined) ?? {})),
        'X-PAYMENT': txHash,
      },
    });

    if (resp2.status === 402) {
      throw new EnclavePaymentError({ reason: 'retry_402', nullifier: proofPayload.nullifier });
    }

    return resp2;
  };
}

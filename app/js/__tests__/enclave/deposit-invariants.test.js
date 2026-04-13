/**
 * POOL-04 PRIMARY — encryptNoteData must always produce a 112-byte ciphertext
 * regardless of recipient pubkey, amount, or blinding. This is the unit-level
 * fallback for the Playwright parity test (which runs against a real browser
 * with a deterministic Freighter mock — see 01-RESEARCH.md §Gotcha 2).
 *
 * ARCHITECTURE NOTE:
 *   The real encryptNoteData is backed by a wasm-bindgen generated module
 *   (`app/js/prover.js`) that is NOT committed — it's produced by
 *   `wasm-pack --target web` from `app/crates/prover`. Jest's
 *   moduleNameMapper rewrites `./prover.js` to `app/js/__mocks__/prover.js`,
 *   which shims `encrypt_note_data` with a deterministic function that
 *   enforces the 112-byte contract at the mock boundary. The test below
 *   therefore verifies BOTH:
 *     (a) bridge.js::encryptNoteData correctly marshals the
 *         `{amount: bigint, blinding: Uint8Array(32)}` object into the
 *         40-byte plaintext the underlying wasm function expects; AND
 *     (b) the documented 112-byte contract (32 ephemeralPubKey + 24 nonce
 *         + 56 ciphertext+tag) is honored across 20 random inputs.
 *
 *   True cryptographic invariance (against the real WASM crypto) is verified
 *   by the Plan 01-04 Playwright e2e spec; this unit test guards the
 *   call-site wiring and contract length.
 */

jest.mock('../../prover.js', () => require('../../__mocks__/prover.js'), { virtual: true });
jest.mock('../../witness/witness.js', () => require('../../__mocks__/witness.js'), { virtual: true });

// ORG-03 + POOL-02 tests (Plan 01-03) mock the heavy upstream modules so
// deposit.js can be unit-tested without touching real prover/stellar SDK.
// These mocks also make sure transaction-builder.js (which imports the SDK
// directly) is never loaded by the test runtime.
jest.mock('../../transaction-builder.js', () => ({
    __esModule: true,
    generateDepositProof: jest.fn(),
}));
jest.mock('../../stellar.js', () => ({
    __esModule: true,
    submitDeposit: jest.fn(),
    getNetwork: jest.fn(() => ({
        name: 'testnet',
        horizonUrl: 'https://horizon-testnet.stellar.org',
        rpcUrl:     'https://soroban-testnet.stellar.org',
        passphrase: 'Test SDF Network ; September 2015',
    })),
}));

import 'fake-indexeddb/auto';
import { encryptNoteData, derivePublicKey } from '../../bridge.js';
import { generateDepositProof } from '../../transaction-builder.js';
import { submitDeposit } from '../../stellar.js';
import { depositForOrg } from '../../enclave/deposit.js';
import {
    putOrg,
    listNoteTags,
} from '../../enclave/registry.js';
import {
    setCachedOrgKeys,
    clearCachedOrgKeys,
} from '../../enclave/keys.js';
import { deleteDatabase } from '../../state/db.js';
import { readFileSync } from 'fs';

function randomBytes(n) {
    const b = new Uint8Array(n);
    for (let i = 0; i < n; i++) b[i] = Math.floor(Math.random() * 256);
    return b;
}

function randomBigInt(maxBits = 64) {
    const bytes = Math.ceil(maxBits / 8);
    let v = 0n;
    for (let i = 0; i < bytes; i++) {
        v = (v << 8n) | BigInt(Math.floor(Math.random() * 256));
    }
    return v;
}

describe('encryptNoteData 112-byte invariant (POOL-04 primary)', () => {
    test('encryptNoteData_alwaysReturns112Bytes', () => {
        for (let i = 0; i < 20; i++) {
            // derivePublicKey must be callable (mocked shim — 32-byte deterministic output)
            const priv = randomBytes(32);
            void derivePublicKey(priv); // exercise the wiring, result unused

            // Encryption recipient pubkey is X25519 — treat as 32 random bytes.
            const encPubKey = randomBytes(32);
            const amount = randomBigInt(50);
            const blinding = randomBytes(32); // real bridge expects Uint8Array(32), not bigint

            const cipher = encryptNoteData(encPubKey, { amount, blinding });

            expect(cipher).toBeInstanceOf(Uint8Array);
            expect(cipher.length).toBe(112); // 32 ephemeralPubKey + 24 nonce + 56 ciphertext+tag
        }
    });

    test('encryptNoteData_isDeterministicForSameInput', () => {
        // Replay stability — same (recipientPubKey, amount, blinding) MUST produce
        // the same ciphertext at the mock boundary. The real crypto is non-deterministic
        // (random nonce), but the mock is deterministic and still enforces the 112-byte
        // contract, which is what we're asserting.
        const encPubKey = new Uint8Array(32).fill(7);
        const blinding = new Uint8Array(32).fill(9);
        const amount = 12345n;

        const first = encryptNoteData(encPubKey, { amount, blinding });
        const second = encryptNoteData(encPubKey, { amount, blinding });

        expect(first.length).toBe(112);
        expect(second.length).toBe(112);
        expect(Array.from(first)).toEqual(Array.from(second));
    });

    test('encryptNoteData_varyingBlindingChangesOutput', () => {
        // Asserts the bridge marshals blinding into the plaintext — if blinding
        // were accidentally dropped, both outputs would match byte-for-byte.
        const encPubKey = new Uint8Array(32).fill(7);
        const amount = 12345n;

        const a = encryptNoteData(encPubKey, { amount, blinding: new Uint8Array(32).fill(1) });
        const b = encryptNoteData(encPubKey, { amount, blinding: new Uint8Array(32).fill(2) });

        expect(a.length).toBe(112);
        expect(b.length).toBe(112);
        expect(Array.from(a)).not.toEqual(Array.from(b));
    });

    test('encryptNoteData_rejectsWrongPubKeyLength', () => {
        // Defense-in-depth: the bridge validates recipientPubKey.length === 32 itself.
        const badKey = new Uint8Array(16);
        const blinding = new Uint8Array(32);
        expect(() => encryptNoteData(badKey, { amount: 1n, blinding })).toThrow(
            /32 bytes/
        );
    });
});

// ============================================================================
// Plan 01-03 Task 2 — depositForOrg (ORG-03 + POOL-02)
// ============================================================================
//
// depositForOrg wraps generateDepositProof with orgSpendingPubKey as the
// recipient for outputs[0], lets upstream pad outputs[1] with a random
// dummy, submits via submitDeposit (NOT callPoolTransact — Gotcha 1), and
// writes a enclave_note_tags row after confirmation.

const DEPOSIT_ADMIN = 'GDEPOSIT1ADMIN';
const DEPOSIT_PUB   = new Uint8Array(32).fill(0xaa);
const DEPOSIT_PRIV  = new Uint8Array(32).fill(0xbb);
const DEPOSIT_ENC_PUB  = new Uint8Array(32).fill(0xcc);
const DEPOSIT_ENC_PRIV = new Uint8Array(32).fill(0xdd);

const DEPOSIT_DEPLOYMENTS = {
    network: 'testnet',
    admin: DEPOSIT_ADMIN,
    pool:               'CPOOL_CONTRACT_ID',
    asp_membership:     'CASP_MEMBERSHIP_ID',
    asp_non_membership: 'CASP_NONMEMBERSHIP_ID',
    verifier:           'CVERIFIER_ID',
    initialized: true,
};

const ROOTS_SNAPSHOT = {
    poolRoot:          123n,
    membershipRoot:    456n,
    nonMembershipRoot: 789n,
};

function validProofResult() {
    return {
        sorobanProof: {
            proof: { a: new Uint8Array(64), b: new Uint8Array(128), c: new Uint8Array(64) },
            root: 123n,
            input_nullifiers: [1n, 2n],
            output_commitment0: 9999n,
            output_commitment1: 8888n,
            public_amount: 1000n,
            ext_data_hash: new Uint8Array(32),
            asp_membership_root: 456n,
            asp_non_membership_root: 789n,
        },
        extData: {
            encrypted_output0: new Uint8Array(112),
            encrypted_output1: new Uint8Array(112),
            ext_amount: 1000n,
            recipient: DEPOSIT_DEPLOYMENTS.pool,
        },
    };
}

async function seedOrgRow(leafIndex = 3) {
    await putOrg({
        adminAddress: DEPOSIT_ADMIN,
        orgId: 'org-gdepos-aaaabbbb',
        orgSpendingPubKey: '0x' + 'aa'.repeat(32),
        aspLeaf:           '0x' + 'ee'.repeat(32),
        aspLeafIndex:      leafIndex,
        createdAt: '2026-04-11T00:00:00.000Z',
        deployTxHash: '0xdeployhash',
    });
}

function seedCachedKeys() {
    setCachedOrgKeys(DEPOSIT_ADMIN, {
        orgSpendingPrivKey: DEPOSIT_PRIV,
        orgSpendingPubKey:  DEPOSIT_PUB,
        orgEncryptionKeypair: {
            publicKey:  DEPOSIT_ENC_PUB,
            privateKey: DEPOSIT_ENC_PRIV,
        },
    });
}

function fakeSignerOptions() {
    return {
        publicKey: DEPOSIT_ADMIN,
        signTransaction: jest.fn(),
        signAuthEntry: jest.fn(),
    };
}

describe('depositForOrg — ORG-03 + POOL-02 invariants', () => {
    beforeEach(async () => {
        await deleteDatabase();
        clearCachedOrgKeys();
        generateDepositProof.mockReset();
        submitDeposit.mockReset();

        // Default stubs — override per test as needed.
        generateDepositProof.mockResolvedValue(validProofResult());
        submitDeposit.mockResolvedValue({ success: true, txHash: 'fakedeposithash' });
    });

    afterAll(async () => {
        await deleteDatabase();
        clearCachedOrgKeys();
    });

    test('depositForOrg_bindsOutputsToOrgPubKey', async () => {
        await seedOrgRow();
        seedCachedKeys();

        await depositForOrg({
            adminAddress: DEPOSIT_ADMIN,
            amountStroops: 100_0000000n,
            deployments: DEPOSIT_DEPLOYMENTS,
            rootsSnapshot: ROOTS_SNAPSHOT,
            stateManager: {},
            signerOptions: fakeSignerOptions(),
        });

        expect(generateDepositProof).toHaveBeenCalledTimes(1);
        const capturedParams = generateDepositProof.mock.calls[0][0];
        expect(capturedParams.outputs).toBeDefined();
        expect(capturedParams.outputs.length).toBeGreaterThanOrEqual(1);

        // Every output entry we provide must bind the org's spending pubkey
        // as recipientPubKey (byte-for-byte equality).
        for (const out of capturedParams.outputs) {
            expect(out.recipientPubKey).toBeInstanceOf(Uint8Array);
            expect(Array.from(out.recipientPubKey)).toEqual(Array.from(DEPOSIT_PUB));
        }
    });

    test('depositForOrg_doesNotOverrideBlindingWithZero', async () => {
        await seedOrgRow();
        seedCachedKeys();

        await depositForOrg({
            adminAddress: DEPOSIT_ADMIN,
            amountStroops: 100_0000000n,
            deployments: DEPOSIT_DEPLOYMENTS,
            rootsSnapshot: ROOTS_SNAPSHOT,
            stateManager: {},
            signerOptions: fakeSignerOptions(),
        });

        const capturedParams = generateDepositProof.mock.calls[0][0];
        // Blinding may be omitted (upstream pads) OR explicitly set to a
        // random non-zero value. The ONLY forbidden value is 0n (Gotcha 5).
        for (const out of capturedParams.outputs) {
            if (out.blinding !== undefined && out.blinding !== null) {
                expect(out.blinding).not.toBe(0n);
            }
        }
    });

    test('depositForOrg_usesMembershipLeafIndexFromOrgRow', async () => {
        await seedOrgRow(42);
        seedCachedKeys();

        await depositForOrg({
            adminAddress: DEPOSIT_ADMIN,
            amountStroops: 100_0000000n,
            deployments: DEPOSIT_DEPLOYMENTS,
            rootsSnapshot: ROOTS_SNAPSHOT,
            stateManager: {},
            signerOptions: fakeSignerOptions(),
        });

        const capturedParams = generateDepositProof.mock.calls[0][0];
        expect(capturedParams.membershipLeafIndex).toBe(42);
    });

    test('depositForOrg_usesMembershipBlindingZero', async () => {
        await seedOrgRow();
        seedCachedKeys();

        await depositForOrg({
            adminAddress: DEPOSIT_ADMIN,
            amountStroops: 100_0000000n,
            deployments: DEPOSIT_DEPLOYMENTS,
            rootsSnapshot: ROOTS_SNAPSHOT,
            stateManager: {},
            signerOptions: fakeSignerOptions(),
        });

        const capturedParams = generateDepositProof.mock.calls[0][0];
        expect(capturedParams.membershipBlinding).toBe(0n);
    });

    test('generateDepositProof_returnsExpectedShape', async () => {
        await seedOrgRow();
        seedCachedKeys();

        const fakeProof = validProofResult();
        generateDepositProof.mockResolvedValue(fakeProof);

        await depositForOrg({
            adminAddress: DEPOSIT_ADMIN,
            amountStroops: 100_0000000n,
            deployments: DEPOSIT_DEPLOYMENTS,
            rootsSnapshot: ROOTS_SNAPSHOT,
            stateManager: {},
            signerOptions: fakeSignerOptions(),
        });

        // submitDeposit must be called with the proofResult produced by
        // generateDepositProof (object identity preserved — no mutation).
        expect(submitDeposit).toHaveBeenCalledTimes(1);
        expect(submitDeposit).toHaveBeenCalledWith(fakeProof, expect.any(Object));

        // Assert the proof shape the submitDeposit mock was called with has
        // both sorobanProof and extData (POOL-02 contract).
        const proofArg = submitDeposit.mock.calls[0][0];
        expect(proofArg).toHaveProperty('sorobanProof');
        expect(proofArg).toHaveProperty('extData');
    });

    test('depositForOrg_writesNoteTagsOnlyAfterSuccess', async () => {
        await seedOrgRow();
        seedCachedKeys();
        submitDeposit.mockResolvedValue({
            success: false,
            error: 'simulation failed',
        });

        const result = await depositForOrg({
            adminAddress: DEPOSIT_ADMIN,
            amountStroops: 100_0000000n,
            deployments: DEPOSIT_DEPLOYMENTS,
            rootsSnapshot: ROOTS_SNAPSHOT,
            stateManager: {},
            signerOptions: fakeSignerOptions(),
        });

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/simulation failed/);

        const tags = await listNoteTags('org-gdepos-aaaabbbb');
        expect(tags).toHaveLength(0);
    });

    test('depositForOrg_writesNoteTagOnSuccess', async () => {
        await seedOrgRow();
        seedCachedKeys();

        const result = await depositForOrg({
            adminAddress: DEPOSIT_ADMIN,
            amountStroops: 100_0000000n,
            deployments: DEPOSIT_DEPLOYMENTS,
            rootsSnapshot: ROOTS_SNAPSHOT,
            stateManager: {},
            signerOptions: fakeSignerOptions(),
        });

        expect(result.success).toBe(true);
        expect(result.txHash).toBe('fakedeposithash');
        expect(result.commitments.length).toBeGreaterThanOrEqual(1);

        const tags = await listNoteTags('org-gdepos-aaaabbbb');
        // Phase 6 agent-spend bridge: expect 2 tags (real + zero-amount change).
        expect(tags.length).toBe(2);

        for (const tag of tags) {
            expect(tag.orgId).toBe('org-gdepos-aaaabbbb');
            expect(typeof tag.commitment).toBe('string');
        }
        const realTag = tags.find((t) => t.amount === (100_0000000n).toString());
        const changeTag = tags.find((t) => t.amount === '0');
        expect(realTag).toBeDefined();
        expect(changeTag).toBeDefined();
    });

    test('depositForOrg_neverCallsCallPoolTransact', () => {
        // Static-source regression guard for Gotcha 1 — the string
        // 'callPoolTransact' must not appear anywhere in deposit.js. The
        // jest test runs with cwd=app/ so the relative path is stable.
        const src = readFileSync('js/enclave/deposit.js', 'utf8');
        expect(src).not.toMatch(/callPoolTransact/);
    });

    test('depositForOrg_throwsWhenOrgRowMissing', async () => {
        seedCachedKeys(); // cached but no DB row

        await expect(
            depositForOrg({
                adminAddress: DEPOSIT_ADMIN,
                amountStroops: 100_0000000n,
                deployments: DEPOSIT_DEPLOYMENTS,
                rootsSnapshot: ROOTS_SNAPSHOT,
                stateManager: {},
                signerOptions: fakeSignerOptions(),
            }),
        ).rejects.toThrow(/No org exists/);
    });

    test('depositForOrg_throwsWhenKeysNotCached', async () => {
        await seedOrgRow();
        // no cached keys

        await expect(
            depositForOrg({
                adminAddress: DEPOSIT_ADMIN,
                amountStroops: 100_0000000n,
                deployments: DEPOSIT_DEPLOYMENTS,
                rootsSnapshot: ROOTS_SNAPSHOT,
                stateManager: {},
                signerOptions: fakeSignerOptions(),
            }),
        ).rejects.toThrow(/session cache/);
    });

    test('depositForOrg_rejectsNonPositiveAmount', async () => {
        await seedOrgRow();
        seedCachedKeys();

        await expect(
            depositForOrg({
                adminAddress: DEPOSIT_ADMIN,
                amountStroops: 0n,
                deployments: DEPOSIT_DEPLOYMENTS,
                rootsSnapshot: ROOTS_SNAPSHOT,
                stateManager: {},
                signerOptions: fakeSignerOptions(),
            }),
        ).rejects.toThrow(/positive BigInt/);
    });
});

/**
 * Plan 05-02 Task 2 — depositForOrg precomputes and persists the output-note
 * nullifier via computeNullifier(commitmentBytes, pathIndicesBytes, signatureBytes).
 *
 * Three new tests guard:
 *   1. nullifier is written onto the note tag row at deposit time
 *   2. no note tag is written on submitDeposit failure (nullifier included)
 *   3. nullifier is a non-empty decimal string (no 0x prefix, no fractions)
 *
 * The mock harness mirrors deposit-invariants.test.js: fake-indexeddb for
 * IndexedDB, jest.mock for transaction-builder + stellar, bridge.js exercises
 * the mocked prover.js shims. computeSignature + computeNullifier are already
 * shimed in __mocks__/prover.js (always return new Uint8Array(32)), so the
 * expected nullifier decimal string is bytesToBigIntLE(zeros).toString() = "0".
 */

jest.mock('../../prover.js', () => require('../../__mocks__/prover.js'), { virtual: true });
jest.mock('../../witness/witness.js', () => require('../../__mocks__/witness.js'), { virtual: true });

jest.mock('../../transaction-builder.js', () => ({
    __esModule: true,
    generateDepositProof: jest.fn(),
}));
jest.mock('../../stellar.js', () => ({
    __esModule: true,
    submitDeposit: jest.fn(),
}));

import 'fake-indexeddb/auto';
import { generateDepositProof } from '../../transaction-builder.js';
import { submitDeposit } from '../../stellar.js';
import { depositForOrg } from '../../enclave/deposit.js';
import {
    putOrg,
    listNoteTags,
    getNoteTagByNullifier,
} from '../../enclave/registry.js';
import { setCachedOrgKeys, clearCachedOrgKeys } from '../../enclave/keys.js';
import { deleteDatabase } from '../../state/db.js';
import { computeSignature, computeNullifier, bigintToField, bytesToBigIntLE } from '../../bridge.js';

const ADMIN   = 'GDEPOSIT05ADMIN';
const PUB     = new Uint8Array(32).fill(0xaa);
const PRIV    = new Uint8Array(32).fill(0xbb);
const ENC_PUB = new Uint8Array(32).fill(0xcc);
const ENC_PRIV= new Uint8Array(32).fill(0xdd);

const DEPLOYMENTS = {
    network: 'testnet',
    admin: ADMIN,
    pool: 'CPOOL_CONTRACT_ID_05',
    asp_membership: 'CASP_MEM_ID',
    asp_non_membership: 'CASP_NONMEM_ID',
    verifier: 'CVERIFIER_ID',
    initialized: true,
};

const ROOTS = {
    poolRoot:          10n,
    membershipRoot:    20n,
    nonMembershipRoot: 30n,
};

const OUTPUT_COMMITMENT0 = 12345n;

function makeProofResult() {
    return {
        sorobanProof: {
            proof: { a: new Uint8Array(64), b: new Uint8Array(128), c: new Uint8Array(64) },
            root: 10n,
            input_nullifiers: [1n, 2n],
            output_commitment0: OUTPUT_COMMITMENT0,
            output_commitment1: 8888n,
            public_amount: 1000n,
            ext_data_hash: new Uint8Array(32),
            asp_membership_root: 20n,
            asp_non_membership_root: 30n,
        },
        extData: {
            encrypted_output0: new Uint8Array(112),
            encrypted_output1: new Uint8Array(112),
            ext_amount: 1000n,
            recipient: DEPLOYMENTS.pool,
        },
    };
}

async function seedOrg() {
    await putOrg({
        adminAddress:       ADMIN,
        orgId:              'org-05-test',
        orgSpendingPubKey:  '0x' + 'aa'.repeat(32),
        aspLeaf:            '0x' + 'ee'.repeat(32),
        aspLeafIndex:       5,
        createdAt:          '2026-04-12T00:00:00.000Z',
        deployTxHash:       '0xdeployhash05',
    });
}

function seedKeys() {
    setCachedOrgKeys(ADMIN, {
        orgSpendingPrivKey: PRIV,
        orgSpendingPubKey:  PUB,
        orgEncryptionKeypair: {
            publicKey:  ENC_PUB,
            privateKey: ENC_PRIV,
        },
    });
}

function signerOpts() {
    return {
        publicKey:         ADMIN,
        signTransaction:   jest.fn(),
        signAuthEntry:     jest.fn(),
    };
}

/**
 * Compute the expected nullifier decimal string using the same derivation
 * chain as deposit.js, relying on the mocked computeSignature + computeNullifier
 * shims (both return new Uint8Array(32) in the mock).
 */
function expectedNullifierDecimal() {
    const commitmentBytes  = bigintToField(OUTPUT_COMMITMENT0);
    const pathIndicesBytes = bigintToField(0n);
    const signatureBytes   = computeSignature(PRIV, commitmentBytes, pathIndicesBytes);
    const nullifierBytes   = computeNullifier(commitmentBytes, pathIndicesBytes, signatureBytes);
    return bytesToBigIntLE(nullifierBytes).toString();
}

beforeEach(async () => {
    await deleteDatabase();
    clearCachedOrgKeys();
    generateDepositProof.mockReset();
    submitDeposit.mockReset();

    generateDepositProof.mockResolvedValue(makeProofResult());
    submitDeposit.mockResolvedValue({ success: true, txHash: 'tx_abc_05' });
});

afterAll(async () => {
    await deleteDatabase();
    clearCachedOrgKeys();
});

describe('depositForOrg — Plan 05-02 nullifier wiring', () => {
    test('depositForOrg writes nullifier onto note tag', async () => {
        await seedOrg();
        seedKeys();

        await depositForOrg({
            adminAddress:  ADMIN,
            amountStroops: 1000_0000000n,
            deployments:   DEPLOYMENTS,
            rootsSnapshot: ROOTS,
            stateManager:  {},
            signerOptions: signerOpts(),
        });

        // Phase 6: deposit writes BOTH a real tag and a zero-amount change tag.
        // The mock's compute_nullifier returns a constant so tags can't be found
        // via by_nullifier lookup; index directly via orgId + amount filter.
        const tags = await listNoteTags('org-05-test');
        const realTag = tags.find((t) => t.amount !== '0');
        expect(realTag).toBeDefined();
        const commitmentHex = '0x' + OUTPUT_COMMITMENT0.toString(16).padStart(64, '0');
        expect(realTag.commitment).toBe(commitmentHex);
        expect(typeof realTag.nullifier).toBe('string');
    });

    test('depositForOrg skips putNoteTag on submitDeposit failure', async () => {
        await seedOrg();
        seedKeys();
        submitDeposit.mockResolvedValue({ success: false, error: 'boom' });

        const result = await depositForOrg({
            adminAddress:  ADMIN,
            amountStroops: 1000_0000000n,
            deployments:   DEPLOYMENTS,
            rootsSnapshot: ROOTS,
            stateManager:  {},
            signerOptions: signerOpts(),
        });

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/boom/);
        expect(result.commitments).toEqual([]);

        const row = await getNoteTagByNullifier(expectedNullifierDecimal());
        expect(row).toBeUndefined();

        const tags = await listNoteTags('org-05-test');
        expect(tags).toHaveLength(0);
    });

    test('nullifier is a non-empty decimal string', async () => {
        await seedOrg();
        seedKeys();

        await depositForOrg({
            adminAddress:  ADMIN,
            amountStroops: 1000_0000000n,
            deployments:   DEPLOYMENTS,
            rootsSnapshot: ROOTS,
            stateManager:  {},
            signerOptions: signerOpts(),
        });

        // Phase 6 agent-spend bridge: deposit tags BOTH the real output and
        // the zero-amount change output so the agent has a distinct null slot.
        // The mock's compute_nullifier returns a constant, so both tags share
        // the same nullifier string in tests — the real-WASM path produces
        // distinct nullifiers by construction (different commitments).
        const tags = await listNoteTags('org-05-test');
        expect(tags).toHaveLength(2);

        const realTag = tags.find((t) => t.amount !== '0');
        const changeTag = tags.find((t) => t.amount === '0');
        expect(realTag).toBeDefined();
        expect(changeTag).toBeDefined();
        expect(typeof realTag.nullifier).toBe('string');
        expect(realTag.nullifier).toMatch(/^[0-9]+$/);
    });
});

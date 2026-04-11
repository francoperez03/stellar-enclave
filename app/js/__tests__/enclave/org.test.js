/**
 * ORG-01 + ORG-05 behavior tests for app/js/enclave/org.js::createOrg.
 *
 * Invariants:
 *   1. Create-Org derives org keys from Freighter, computes ASP leaf with
 *      blinding=0, and inserts it on-chain via contract.Client.insert_leaf
 *      (mirroring admin.js::insertMembershipLeaf byte-for-byte).
 *   2. After a successful insert, the enclave_orgs row is persisted with the
 *      asp_leaf_index derived from the tx result (LeafAdded event / returnValue).
 *   3. Idempotency — a second createOrg call for the same admin throws before
 *      any signature prompt.
 *   4. After success, getCachedOrgKeys returns the derived keys so downstream
 *      deposit calls don't re-prompt Freighter.
 *
 * Mocks:
 *   - @stellar/stellar-sdk → fake contract.Client whose insert_leaf resolves
 *     to a deterministic fake tx result with returnValue=7 (the LeafAdded
 *     index) and sendTransactionResponse.hash='fakehash'.
 *   - ../../wallet.js → signWalletMessage returns a fixed 64-byte base64 sig.
 *   - ../../prover.js + witness.js → the existing enclave mock bundle.
 *   - fake-indexeddb/auto → real IndexedDB semantics in memory.
 */

jest.mock('../../prover.js', () => require('../../__mocks__/prover.js'), { virtual: true });
jest.mock('../../witness/witness.js', () => require('../../__mocks__/witness.js'), { virtual: true });

// Mock @stellar/stellar-sdk BEFORE importing org.js so the contract.Client.from
// call in buildMembershipClient resolves to our fake client.
const mockInsertLeaf = jest.fn();
const mockSignAndSend = jest.fn();
const mockClientFrom = jest.fn();

jest.mock('@stellar/stellar-sdk', () => ({
    __esModule: true,
    contract: {
        Client: {
            from: (...args) => mockClientFrom(...args),
        },
    },
}));

jest.mock('../../wallet.js', () => ({
    __esModule: true,
    signWalletMessage: jest.fn(),
}));

// Mock stellar.js::getNetwork so org.js doesn't pull in the real module
// (which eagerly destructures SDK exports that our SDK mock doesn't provide).
jest.mock('../../stellar.js', () => ({
    __esModule: true,
    getNetwork: jest.fn(() => ({
        name: 'testnet',
        horizonUrl: 'https://horizon-testnet.stellar.org',
        rpcUrl:     'https://soroban-testnet.stellar.org',
        passphrase: 'Test SDF Network ; September 2015',
    })),
}));

import 'fake-indexeddb/auto';
import { createOrg } from '../../enclave/org.js';
import {
    getOrgByAdmin,
    getAllOrgs,
    putOrg,
} from '../../enclave/registry.js';
import {
    getCachedOrgKeys,
    clearCachedOrgKeys,
    computeEnclaveAspLeaf,
} from '../../enclave/keys.js';
import { fieldToHex } from '../../bridge.js';
import { deleteDatabase } from '../../state/db.js';
import { signWalletMessage } from '../../wallet.js';

const FAKE_ADMIN = 'GADMIN1TESTADDRESS';

const FAKE_DEPLOYMENTS = {
    network: 'testnet',
    admin: FAKE_ADMIN,
    pool: 'CPOOL_CONTRACT_ID',
    asp_membership: 'CASP_MEMBERSHIP_ID',
    asp_non_membership: 'CASP_NONMEMBERSHIP_ID',
    verifier: 'CVERIFIER_ID',
    initialized: true,
};

function base64Sig(seed) {
    const buf = new Uint8Array(64);
    for (let i = 0; i < 64; i++) buf[i] = (seed + i) & 0xff;
    return Buffer.from(buf).toString('base64');
}

function fakeSignerOptions() {
    return {
        publicKey: FAKE_ADMIN,
        signTransaction: jest.fn(),
        signAuthEntry: jest.fn(),
    };
}

beforeEach(async () => {
    await deleteDatabase();
    clearCachedOrgKeys();
    mockInsertLeaf.mockReset();
    mockSignAndSend.mockReset();
    mockClientFrom.mockReset();

    // Default signatures (both calls produce deterministic outputs).
    signWalletMessage.mockReset();
    signWalletMessage
        .mockResolvedValueOnce({ signedMessage: base64Sig(42), signerAddress: FAKE_ADMIN })
        .mockResolvedValueOnce({ signedMessage: base64Sig(99), signerAddress: FAKE_ADMIN });

    // Default fake SDK client: insert_leaf → signAndSend → returnValue=7.
    mockSignAndSend.mockResolvedValue({
        sendTransactionResponse: { hash: 'fakehash' },
        returnValue: 7,
    });
    mockInsertLeaf.mockResolvedValue({ signAndSend: mockSignAndSend });
    mockClientFrom.mockResolvedValue({ insert_leaf: mockInsertLeaf });
});

afterAll(async () => {
    await deleteDatabase();
    clearCachedOrgKeys();
});

describe('createOrg — ORG-01 + ORG-05 bootstrap', () => {
    test('createOrg_derivesKeysAndComputesAspLeafWithBlindingZero', async () => {
        const result = await createOrg({
            adminAddress: FAKE_ADMIN,
            deployments: FAKE_DEPLOYMENTS,
            signerOptions: fakeSignerOptions(),
        });

        // Keys were derived (two Freighter sign calls).
        expect(signWalletMessage).toHaveBeenCalledTimes(2);

        // The client's insert_leaf was called with a bigint leaf matching
        // computeEnclaveAspLeaf(orgSpendingPubKey) byte-for-byte. We can
        // recompute it from the cached keys.
        const cached = getCachedOrgKeys(FAKE_ADMIN);
        expect(cached).not.toBeNull();
        const expectedLeafBytes = computeEnclaveAspLeaf(cached.orgSpendingPubKey);
        const expectedLeafHex = fieldToHex(expectedLeafBytes);

        expect(mockInsertLeaf).toHaveBeenCalledTimes(1);
        const leafArg = mockInsertLeaf.mock.calls[0][0];
        expect(leafArg).toHaveProperty('leaf');
        expect(typeof leafArg.leaf).toBe('bigint');

        // The persisted row's aspLeaf hex must match the blinding=0 ASP leaf.
        const row = await getOrgByAdmin(FAKE_ADMIN);
        expect(row).toBeDefined();
        expect(row.aspLeaf).toBe(expectedLeafHex);

        // createOrg return shape
        expect(result).toHaveProperty('orgId');
        expect(result).toHaveProperty('aspLeafIndex');
        expect(result.deployTxHash).toBe('fakehash');
    });

    test('createOrg_writesOrgRowAfterInsertLeaf', async () => {
        const result = await createOrg({
            adminAddress: FAKE_ADMIN,
            deployments: FAKE_DEPLOYMENTS,
            signerOptions: fakeSignerOptions(),
        });

        const row = await getOrgByAdmin(FAKE_ADMIN);
        expect(row).toBeDefined();
        expect(row.adminAddress).toBe(FAKE_ADMIN);
        expect(row.orgId).toBe(result.orgId);
        expect(row.aspLeafIndex).toBe(result.aspLeafIndex);
        expect(row.deployTxHash).toBe('fakehash');
        expect(row.orgSpendingPubKey).toMatch(/^0x[0-9a-f]+$/);
        expect(row.aspLeaf).toMatch(/^0x[0-9a-f]+$/);
        expect(typeof row.createdAt).toBe('string');
        expect(() => new Date(row.createdAt).toISOString()).not.toThrow();
    });

    test('createOrg_failsLoudlyIfOrgAlreadyExists', async () => {
        // Pre-populate a row for the admin.
        await putOrg({
            adminAddress: FAKE_ADMIN,
            orgId: 'org-preexisting',
            orgSpendingPubKey: '0x' + 'aa'.repeat(32),
            aspLeaf: '0x' + 'bb'.repeat(32),
            aspLeafIndex: 0,
            createdAt: '2026-04-11T00:00:00.000Z',
            deployTxHash: '0xpre-existing',
        });

        await expect(
            createOrg({
                adminAddress: FAKE_ADMIN,
                deployments: FAKE_DEPLOYMENTS,
                signerOptions: fakeSignerOptions(),
            })
        ).rejects.toThrow(/already owns/);

        // signWalletMessage must NOT have been invoked (fail before Freighter prompt).
        expect(signWalletMessage).not.toHaveBeenCalled();
        // insert_leaf must NOT have been invoked on-chain.
        expect(mockInsertLeaf).not.toHaveBeenCalled();
    });

    test('createOrg_setsCachedKeysForSession', async () => {
        expect(getCachedOrgKeys(FAKE_ADMIN)).toBeNull();

        await createOrg({
            adminAddress: FAKE_ADMIN,
            deployments: FAKE_DEPLOYMENTS,
            signerOptions: fakeSignerOptions(),
        });

        const cached = getCachedOrgKeys(FAKE_ADMIN);
        expect(cached).not.toBeNull();
        expect(cached.orgSpendingPrivKey).toBeInstanceOf(Uint8Array);
        expect(cached.orgSpendingPrivKey.length).toBe(32);
        expect(cached.orgSpendingPubKey).toBeInstanceOf(Uint8Array);
        expect(cached.orgSpendingPubKey.length).toBe(32);
        expect(cached.orgEncryptionKeypair).toBeDefined();
        expect(cached.orgEncryptionKeypair.publicKey).toBeInstanceOf(Uint8Array);
        expect(cached.orgEncryptionKeypair.privateKey).toBeInstanceOf(Uint8Array);
    });

    test('createOrg_rejectsMissingAdminAddress', async () => {
        await expect(
            createOrg({
                adminAddress: '',
                deployments: FAKE_DEPLOYMENTS,
                signerOptions: fakeSignerOptions(),
            })
        ).rejects.toThrow(/adminAddress required/);
    });

    test('createOrg_rejectsMissingAspMembershipDeployment', async () => {
        const bad = { ...FAKE_DEPLOYMENTS };
        delete bad.asp_membership;

        await expect(
            createOrg({
                adminAddress: FAKE_ADMIN,
                deployments: bad,
                signerOptions: fakeSignerOptions(),
            })
        ).rejects.toThrow(/asp_membership missing/);
    });
});

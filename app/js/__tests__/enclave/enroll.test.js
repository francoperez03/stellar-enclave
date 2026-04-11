/**
 * ORG-02 behavior tests for app/js/enclave/enroll.js::enrollAgent.
 *
 * Invariants:
 *   1. Generates a 32-byte random agent auth private key via
 *      crypto.getRandomValues. The spy asserts call-count + byte-length.
 *   2. Writes a enclave_agents row with the correct shape AND uniqueness
 *      is enforced by registry.putAgent (throws on duplicate).
 *   3. Throws before any work when org keys are not in the session cache.
 *   4. Returned bundle includes orgEncryptionKeypair with publicKey + secretKey,
 *      and all four contract IDs from the deployments JSON.
 *   5. ZERO on-chain calls — no contract.Client.from invocation, no tx
 *      sending, no insert_leaf, no submitDeposit.
 *
 * Mocks:
 *   - @stellar/stellar-sdk → tripwire contract.Client.from that fails the
 *     test if invoked. This is the "zero on-chain" assertion at the module
 *     boundary (not just grep of source).
 *   - ../../wallet.js → signWalletMessage as a no-op. enrollAgent MUST NOT
 *     call it (keys come from the session cache, not Freighter).
 *   - ../../stellar.js → submitDeposit / submitPoolTransaction tripwires.
 *   - fake-indexeddb/auto → real IDB semantics in memory.
 */

jest.mock('../../prover.js', () => require('../../__mocks__/prover.js'), { virtual: true });
jest.mock('../../witness/witness.js', () => require('../../__mocks__/witness.js'), { virtual: true });

// NOTE: jest.mock factories are hoisted above imports by babel-jest; only
// variables whose name begins with `mock` (case-insensitive) are allowed in
// the factory closure. These tripwires MUST be named `mock*` for that reason.
const mockSdkFromTripwire = jest.fn(() => {
    throw new Error('contract.Client.from must NOT be called by enrollAgent (ORG-02 zero on-chain)');
});
jest.mock('@stellar/stellar-sdk', () => ({
    __esModule: true,
    contract: {
        Client: {
            from: (...args) => mockSdkFromTripwire(...args),
        },
    },
}));

const mockStellarTripwire = jest.fn(() => {
    throw new Error('stellar.js network helpers must NOT be called by enrollAgent (ORG-02 zero on-chain)');
});
jest.mock('../../stellar.js', () => ({
    __esModule: true,
    submitDeposit: (...args) => mockStellarTripwire('submitDeposit', ...args),
    submitPoolTransaction: (...args) => mockStellarTripwire('submitPoolTransaction', ...args),
    getNetwork: jest.fn(() => ({
        name: 'testnet',
        rpcUrl: 'https://soroban-testnet.stellar.org',
        passphrase: 'Test SDF Network ; September 2015',
    })),
}));

jest.mock('../../wallet.js', () => ({
    __esModule: true,
    signWalletMessage: jest.fn(() => {
        throw new Error('signWalletMessage must NOT be called by enrollAgent (keys come from session cache)');
    }),
}));

import 'fake-indexeddb/auto';
import { enrollAgent } from '../../enclave/enroll.js';
import { putOrg, listAgents } from '../../enclave/registry.js';
import { setCachedOrgKeys, clearCachedOrgKeys } from '../../enclave/keys.js';
import { deleteDatabase } from '../../state/db.js';

const ADMIN = 'GENROLL1ADMIN';
const ORG_ID = 'org-genrol-abcdef01';
const DEPLOYMENTS = {
    network: 'testnet',
    admin: ADMIN,
    pool:               'CPOOL_CONTRACT_ID',
    asp_membership:     'CASP_MEMBERSHIP_ID',
    asp_non_membership: 'CASP_NONMEMBERSHIP_ID',
    verifier:           'CVERIFIER_ID',
    initialized: true,
};

function seedCachedKeys() {
    setCachedOrgKeys(ADMIN, {
        orgSpendingPrivKey: new Uint8Array(32).fill(0xaa),
        orgSpendingPubKey:  new Uint8Array(32).fill(0xbb),
        orgEncryptionKeypair: {
            publicKey:  new Uint8Array(32).fill(0xcc),
            privateKey: new Uint8Array(32).fill(0xdd),
        },
    });
}

async function seedOrgRow() {
    await putOrg({
        adminAddress: ADMIN,
        orgId: ORG_ID,
        orgSpendingPubKey: '0x' + 'bb'.repeat(32),
        aspLeaf:           '0x' + 'ee'.repeat(32),
        aspLeafIndex:      3,
        createdAt: '2026-04-11T00:00:00.000Z',
        deployTxHash: '0xdeploy',
    });
}

beforeEach(async () => {
    await deleteDatabase();
    clearCachedOrgKeys();
    mockSdkFromTripwire.mockClear();
    mockStellarTripwire.mockClear();
});

afterAll(async () => {
    await deleteDatabase();
    clearCachedOrgKeys();
});

describe('enrollAgent — ORG-02 behavior', () => {
    test('enrollAgent_generates32ByteRandomAuthKey', async () => {
        await seedOrgRow();
        seedCachedKeys();

        // Spy on the real crypto.getRandomValues — must be called with a
        // 32-byte Uint8Array at least once.
        const spy = jest.spyOn(globalThis.crypto, 'getRandomValues');

        try {
            const { bundle, agentRow } = await enrollAgent({
                adminAddress: ADMIN,
                orgId: ORG_ID,
                agentName: 'agent-alpha',
                deployments: DEPLOYMENTS,
            });

            expect(spy).toHaveBeenCalled();
            // At least one call must have passed a 32-byte Uint8Array.
            const thirtyTwoCalls = spy.mock.calls.filter(
                ([arg]) => arg instanceof Uint8Array && arg.length === 32,
            );
            expect(thirtyTwoCalls.length).toBeGreaterThanOrEqual(1);

            // Resulting bundle.agentAuthKey is a 0x-prefixed 64-char hex string.
            expect(bundle.agentAuthKey).toMatch(/^0x[0-9a-f]{64}$/);
            expect(agentRow.authPubKey).toMatch(/^0x[0-9a-f]{64}$/);
        } finally {
            spy.mockRestore();
        }
    });

    test('enrollAgent_writesRowToEnclaveAgents', async () => {
        await seedOrgRow();
        seedCachedKeys();

        const { agentRow } = await enrollAgent({
            adminAddress: ADMIN,
            orgId: ORG_ID,
            agentName: 'agent-alpha',
            deployments: DEPLOYMENTS,
        });

        expect(agentRow.id).toBe(`${ORG_ID}/agent-alpha`);
        expect(agentRow.orgId).toBe(ORG_ID);
        expect(agentRow.agentName).toBe('agent-alpha');
        expect(typeof agentRow.enrolledAt).toBe('string');

        const list = await listAgents(ORG_ID);
        expect(list).toHaveLength(1);
        expect(list[0].id).toBe(`${ORG_ID}/agent-alpha`);
        expect(list[0].authPubKey).toMatch(/^0x[0-9a-f]{64}$/);
    });

    test('enrollAgent_throwsOnDuplicateName', async () => {
        await seedOrgRow();
        seedCachedKeys();

        await enrollAgent({
            adminAddress: ADMIN,
            orgId: ORG_ID,
            agentName: 'agent-alpha',
            deployments: DEPLOYMENTS,
        });

        await expect(
            enrollAgent({
                adminAddress: ADMIN,
                orgId: ORG_ID,
                agentName: 'agent-alpha',
                deployments: DEPLOYMENTS,
            }),
        ).rejects.toThrow(/already exists/);
    });

    test('enrollAgent_throwsWhenOrgKeysNotCached', async () => {
        await seedOrgRow();
        // no setCachedOrgKeys call

        await expect(
            enrollAgent({
                adminAddress: ADMIN,
                orgId: ORG_ID,
                agentName: 'agent-alpha',
                deployments: DEPLOYMENTS,
            }),
        ).rejects.toThrow(/session cache/);
    });

    test('enrollAgent_throwsWhenOrgRowMissing', async () => {
        seedCachedKeys();
        // no org row in DB

        await expect(
            enrollAgent({
                adminAddress: ADMIN,
                orgId: ORG_ID,
                agentName: 'agent-alpha',
                deployments: DEPLOYMENTS,
            }),
        ).rejects.toThrow(/no enclave_orgs row/);
    });

    test('enrollAgent_bundleIncludesOrgEncryptionKeypair', async () => {
        await seedOrgRow();
        seedCachedKeys();

        const { bundle } = await enrollAgent({
            adminAddress: ADMIN,
            orgId: ORG_ID,
            agentName: 'agent-alpha',
            deployments: DEPLOYMENTS,
        });

        expect(bundle.orgEncryptionKeypair).toBeDefined();
        expect(bundle.orgEncryptionKeypair.publicKey).toMatch(/^0x[0-9a-f]{64}$/);
        expect(bundle.orgEncryptionKeypair.secretKey).toMatch(/^0x[0-9a-f]{64}$/);
        // Both spending keys must be present in the bundle.
        expect(bundle.orgSpendingPrivKey).toMatch(/^0x[0-9a-f]{64}$/);
        expect(bundle.orgSpendingPubKey).toMatch(/^0x[0-9a-f]{64}$/);
    });

    test('enrollAgent_bundleIncludesAllContractIds', async () => {
        await seedOrgRow();
        seedCachedKeys();

        const { bundle } = await enrollAgent({
            adminAddress: ADMIN,
            orgId: ORG_ID,
            agentName: 'agent-alpha',
            deployments: DEPLOYMENTS,
        });

        expect(bundle.poolContractId).toBe(DEPLOYMENTS.pool);
        expect(bundle.aspMembershipContractId).toBe(DEPLOYMENTS.asp_membership);
        expect(bundle.aspNonMembershipContractId).toBe(DEPLOYMENTS.asp_non_membership);
        expect(bundle.verifierContractId).toBe(DEPLOYMENTS.verifier);

        // ASP leaf + index come from the seeded org row.
        expect(bundle.aspLeaf).toBe('0x' + 'ee'.repeat(32));
        expect(bundle.aspLeafIndex).toBe(3);
    });

    test('enrollAgent_makesZeroOnChainCalls', async () => {
        await seedOrgRow();
        seedCachedKeys();

        await enrollAgent({
            adminAddress: ADMIN,
            orgId: ORG_ID,
            agentName: 'agent-alpha',
            deployments: DEPLOYMENTS,
        });

        // Tripwires: no SDK client factory call, no submitDeposit, no
        // Freighter sign call.
        expect(mockSdkFromTripwire).not.toHaveBeenCalled();
        expect(mockStellarTripwire).not.toHaveBeenCalled();
    });

    test('enrollAgent_rejectsMissingAdminAddress', async () => {
        await seedOrgRow();
        seedCachedKeys();

        await expect(
            enrollAgent({
                adminAddress: '',
                orgId: ORG_ID,
                agentName: 'agent-alpha',
                deployments: DEPLOYMENTS,
            }),
        ).rejects.toThrow(/adminAddress required/);
    });

    test('enrollAgent_rejectsMissingAgentName', async () => {
        await seedOrgRow();
        seedCachedKeys();

        await expect(
            enrollAgent({
                adminAddress: ADMIN,
                orgId: ORG_ID,
                agentName: '   ',
                deployments: DEPLOYMENTS,
            }),
        ).rejects.toThrow(/agentName required/);
    });
});

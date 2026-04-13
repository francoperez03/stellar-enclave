/**
 * Enrollment bundle schema tests (Plan 01-02) + round-trip test (Plan 01-03
 * Task 3 Step 3.3).
 *
 * The Agent SDK in Phase 3 bootstraps from the JSON produced by
 * `buildEnrollmentBundle`, so the contract is pinned here:
 *
 *   - version: 1
 *   - orgId, agentName
 *   - orgSpendingPrivKey, orgSpendingPubKey   (32-byte hex)
 *   - orgEncryptionKeypair                     ({publicKey, secretKey})
 *   - aspLeaf, aspLeafIndex
 *   - agentAuthKey, adminStellarAddress
 *   - poolContractId, aspMembershipContractId,
 *     aspNonMembershipContractId, verifierContractId
 *   - facilitatorUrl (default 'http://localhost:4021')
 *   - network (default 'testnet' or deployments.network)
 *   - createdAt
 *
 * `buildEnrollmentBundle` is a pure function, so no mocks are required for
 * the schema tests. The round-trip test at the bottom drives enrollAgent
 * end-to-end through fake-indexeddb and asserts the emitted bundle has
 * every contract field.
 */

// Virtual mocks required by the enclave/enroll.js import chain (prover.js
// and witness.js are wasm-pack outputs that aren't present in jest).
jest.mock('../../prover.js', () => require('../../__mocks__/prover.js'), { virtual: true });
jest.mock('../../witness/witness.js', () => require('../../__mocks__/witness.js'), { virtual: true });

// Mock stellar.js so the enroll path never pulls in the real module (which
// eagerly destructures SDK exports we don't want to load here).
jest.mock('../../stellar.js', () => ({
    __esModule: true,
    getNetwork: jest.fn(() => ({
        name: 'testnet',
        rpcUrl: 'https://soroban-testnet.stellar.org',
        passphrase: 'Test SDF Network ; September 2015',
    })),
}));

import 'fake-indexeddb/auto';
import { buildEnrollmentBundle, BUNDLE_VERSION } from '../../enclave/bundle.js';
import { enrollAgent } from '../../enclave/enroll.js';
import { putOrg } from '../../enclave/registry.js';
import { setCachedOrgKeys, clearCachedOrgKeys } from '../../enclave/keys.js';
import { deleteDatabase } from '../../state/db.js';

function validParams(overrides = {}) {
    return {
        orgId: 'company1',
        agentName: 'agent-alpha',
        orgSpendingPrivKey: '0x' + 'aa'.repeat(32),
        orgSpendingPubKey: '0x' + 'bb'.repeat(32),
        orgEncryptionKeypair: {
            publicKey: '0x' + 'cc'.repeat(32),
            secretKey: '0x' + 'dd'.repeat(32),
        },
        aspLeaf: '0x' + 'ee'.repeat(32),
        aspLeafIndex: 0,
        agentAuthKey: '0x' + 'ff'.repeat(32),
        adminStellarAddress: 'GADMIN1',
        deployments: {
            pool:               'CPOOL_CONTRACT_ID',
            asp_membership:     'CASP_MEMBERSHIP_ID',
            asp_non_membership: 'CASP_NONMEMBERSHIP_ID',
            verifier:           'CVERIFIER_ID',
            network:            'testnet',
        },
        ...overrides,
    };
}

describe('Enrollment bundle — schema contract', () => {
    test('enrollmentBundle_hasAllRequiredFields', () => {
        const bundle = buildEnrollmentBundle(validParams());

        // Version is pinned — Phase 3 must reject unknown versions.
        expect(bundle.version).toBe(BUNDLE_VERSION);
        expect(bundle.version).toBe(1);

        // Identity
        expect(bundle.orgId).toBe('company1');
        expect(bundle.agentName).toBe('agent-alpha');

        // Keys — contains-check per plan frontmatter artifacts.
        expect(bundle.orgSpendingPrivKey).toBeDefined();
        expect(bundle.orgSpendingPubKey).toBeDefined();
        expect(bundle.orgEncryptionKeypair).toBeDefined();
        expect(bundle.orgEncryptionKeypair.publicKey).toBeDefined();
        expect(bundle.orgEncryptionKeypair.secretKey).toBeDefined();

        // ASP leaf + index
        expect(bundle.aspLeaf).toBeDefined();
        expect(bundle.aspLeafIndex).toBe(0);

        // Agent auth key + admin address
        expect(bundle.agentAuthKey).toBeDefined();
        expect(bundle.adminStellarAddress).toBe('GADMIN1');

        // Contract IDs are hoisted out of deployments.
        expect(bundle.poolContractId).toBe('CPOOL_CONTRACT_ID');
        expect(bundle.aspMembershipContractId).toBe('CASP_MEMBERSHIP_ID');
        expect(bundle.aspNonMembershipContractId).toBe('CASP_NONMEMBERSHIP_ID');
        expect(bundle.verifierContractId).toBe('CVERIFIER_ID');

        // Defaults
        expect(bundle.facilitatorUrl).toBe('http://localhost:4021');
        expect(bundle.network).toBe('testnet');

        // createdAt must be a valid ISO string
        expect(typeof bundle.createdAt).toBe('string');
        expect(() => new Date(bundle.createdAt).toISOString()).not.toThrow();
    });

    test('enrollmentBundle_respectsOverrides', () => {
        const bundle = buildEnrollmentBundle(
            validParams({
                facilitatorUrl: 'https://enclave.example.com',
                network: 'mainnet',
                createdAt: '2026-01-01T00:00:00.000Z',
            })
        );
        expect(bundle.facilitatorUrl).toBe('https://enclave.example.com');
        expect(bundle.network).toBe('mainnet');
        expect(bundle.createdAt).toBe('2026-01-01T00:00:00.000Z');
    });

    test('enrollmentBundle_throwsOnMissingField', () => {
        const params = validParams();
        delete params.agentAuthKey;
        expect(() => buildEnrollmentBundle(params)).toThrow(/missing required field 'agentAuthKey'/);
    });

    test('enrollmentBundle_throwsOnMissingOrgEncryptionKeypair', () => {
        const params = validParams();
        delete params.orgEncryptionKeypair;
        expect(() => buildEnrollmentBundle(params)).toThrow(
            /missing required field 'orgEncryptionKeypair'/
        );
    });

    test('enrollmentBundle_throwsOnMissingDeployment', () => {
        const params = validParams();
        delete params.deployments.verifier;
        expect(() => buildEnrollmentBundle(params)).toThrow(/deployments\.verifier missing/);
    });

    test('enrollmentBundle_throwsOnNullParams', () => {
        expect(() => buildEnrollmentBundle(null)).toThrow(/params object required/);
        expect(() => buildEnrollmentBundle(undefined)).toThrow(/params object required/);
    });

    test('enrollmentBundle_networkDefaultsToDeploymentsNetwork', () => {
        const params = validParams();
        params.deployments.network = 'futurenet';
        const bundle = buildEnrollmentBundle(params);
        expect(bundle.network).toBe('futurenet');
    });
});

// -------- Round-trip: enrollAgent → bundle (Plan 01-03 Task 3 Step 3.3) --------

const ROUND_ADMIN = 'GROUNDTRIPADMIN';
const ROUND_ORG_ID = 'org-ground-cafebabe';
const ROUND_DEPLOYMENTS = {
    network: 'testnet',
    admin: ROUND_ADMIN,
    pool:               'CPOOL_ROUNDTRIP',
    asp_membership:     'CASP_M_ROUNDTRIP',
    asp_non_membership: 'CASP_NM_ROUNDTRIP',
    verifier:           'CVERIFIER_ROUNDTRIP',
    initialized: true,
};

describe('Enrollment bundle — round-trip from enrollAgent', () => {
    beforeEach(async () => {
        await deleteDatabase();
        clearCachedOrgKeys();
    });

    afterAll(async () => {
        await deleteDatabase();
        clearCachedOrgKeys();
    });

    test('enrollmentBundle_roundTripFromEnrollAgent', async () => {
        // Seed the enclave_orgs row the enroll path requires.
        await putOrg({
            adminAddress: ROUND_ADMIN,
            orgId: ROUND_ORG_ID,
            orgSpendingPubKey: '0x' + 'bb'.repeat(32),
            aspLeaf:           '0x' + 'ee'.repeat(32),
            aspLeafIndex:      7,
            createdAt: '2026-04-11T00:00:00.000Z',
            deployTxHash: '0xdeployRT',
        });

        // Seed the session cache with runtime-shaped keys ({publicKey, privateKey}).
        setCachedOrgKeys(ROUND_ADMIN, {
            orgSpendingPrivKey: new Uint8Array(32).fill(0x11),
            orgSpendingPubKey:  new Uint8Array(32).fill(0x22),
            orgEncryptionKeypair: {
                publicKey:  new Uint8Array(32).fill(0x33),
                privateKey: new Uint8Array(32).fill(0x44),
            },
        });

        const { bundle } = await enrollAgent({
            adminAddress: ROUND_ADMIN,
            orgId:        ROUND_ORG_ID,
            agentName:    'agent-round',
            deployments:  ROUND_DEPLOYMENTS,
        });

        // Every CONTEXT.md §Enrollment bundle contract field must be present.
        expect(bundle.version).toBe(BUNDLE_VERSION);
        expect(bundle.orgId).toBe(ROUND_ORG_ID);
        expect(bundle.agentName).toBe('agent-round');

        // Keys: hex 0x-prefixed 64 chars.
        expect(bundle.orgSpendingPrivKey).toMatch(/^0x[0-9a-f]{64}$/);
        expect(bundle.orgSpendingPubKey).toMatch(/^0x[0-9a-f]{64}$/);
        expect(bundle.orgEncryptionKeypair.publicKey).toMatch(/^0x[0-9a-f]{64}$/);
        expect(bundle.orgEncryptionKeypair.secretKey).toMatch(/^0x[0-9a-f]{64}$/);

        // ASP leaf + index come from the seeded org row verbatim.
        expect(bundle.aspLeaf).toBe('0x' + 'ee'.repeat(32));
        expect(bundle.aspLeafIndex).toBe(7);

        // Agent auth key + admin address.
        expect(bundle.agentAuthKey).toMatch(/^0x[0-9a-f]{64}$/);
        expect(bundle.adminStellarAddress).toBe(ROUND_ADMIN);

        // Contract IDs hoisted out of deployments.
        expect(bundle.poolContractId).toBe(ROUND_DEPLOYMENTS.pool);
        expect(bundle.aspMembershipContractId).toBe(ROUND_DEPLOYMENTS.asp_membership);
        expect(bundle.aspNonMembershipContractId).toBe(ROUND_DEPLOYMENTS.asp_non_membership);
        expect(bundle.verifierContractId).toBe(ROUND_DEPLOYMENTS.verifier);

        // Defaults
        expect(bundle.facilitatorUrl).toBe('http://localhost:4021');
        expect(bundle.network).toBe('testnet');

        // createdAt must be a valid ISO string
        expect(typeof bundle.createdAt).toBe('string');
        expect(() => new Date(bundle.createdAt).toISOString()).not.toThrow();

        // Name-mapping sanity: bundle.orgEncryptionKeypair.secretKey must
        // reflect the runtime-cache.privateKey (all 0x44 bytes), not publicKey.
        expect(bundle.orgEncryptionKeypair.secretKey).toBe('0x' + '44'.repeat(32));
        expect(bundle.orgEncryptionKeypair.publicKey).toBe('0x' + '33'.repeat(32));
    });
});

/**
 * Enrollment bundle schema tests (Plan 01-02).
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
 *   - facilitatorUrl (default 'http://localhost:3000')
 *   - network (default 'testnet' or deployments.network)
 *   - createdAt
 *
 * `buildEnrollmentBundle` is a pure function, so no mocks are required.
 */

import { buildEnrollmentBundle, BUNDLE_VERSION } from '../../enclave/bundle.js';

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
        expect(bundle.facilitatorUrl).toBe('http://localhost:3000');
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

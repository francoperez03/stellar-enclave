/**
 * Enclave enrollment bundle builder.
 * Produces the JSON contract Phase 3 Agent SDK bootstraps from.
 *
 * Schema (plan 01-02 — superset of 01-CONTEXT.md §Enrollment bundle contract):
 *   {
 *     version:                     1,
 *     orgId:                       string,
 *     agentName:                   string,
 *     orgSpendingPrivKey:          hex 32 bytes,
 *     orgSpendingPubKey:           hex 32 bytes,
 *     orgEncryptionKeypair:        { publicKey: hex, secretKey: hex },
 *     aspLeaf:                     hex U256,
 *     aspLeafIndex:                number,
 *     agentAuthKey:                hex 32 bytes,
 *     adminStellarAddress:         G... Stellar address,
 *     poolContractId:              C... Soroban contract id,
 *     aspMembershipContractId:     C...,
 *     aspNonMembershipContractId:  C...,
 *     verifierContractId:          C...,
 *     facilitatorUrl:              string  (default 'http://localhost:3000'),
 *     network:                     string  (default 'testnet' or deployments.network),
 *     createdAt:                   ISO timestamp
 *   }
 *
 * CONTEXT.md §Enrollment bundle clarification — the plan 01-02 frontmatter lists
 * `orgEncryptionKeypair` as a required artifact contains-check because Phase 3 agents
 * need BOTH the spending key (to sign deposit/withdraw circuits) AND the encryption
 * keypair (to decrypt incoming notes). Serialized as hex strings; the builder itself
 * is agnostic to whether the caller hex-encodes Uint8Arrays or passes hex strings —
 * the required-field check only rejects undefined/null.
 *
 * @module enclave/bundle
 */

export const BUNDLE_VERSION = 1;

/**
 * @param {Object} p
 * @param {string} p.orgId
 * @param {string} p.agentName
 * @param {string} p.orgSpendingPrivKey           hex-encoded 32 bytes
 * @param {string} p.orgSpendingPubKey            hex-encoded 32 bytes
 * @param {{ publicKey: string, secretKey: string }} p.orgEncryptionKeypair
 * @param {string} p.aspLeaf                       hex U256
 * @param {number} p.aspLeafIndex
 * @param {string} p.agentAuthKey                  hex 32 bytes (the agent's own fresh key)
 * @param {string} p.adminStellarAddress
 * @param {Object} p.deployments                   parsed scripts/deployments.json
 * @param {string} [p.facilitatorUrl='http://localhost:3000']
 * @param {string} [p.network='testnet']
 * @param {string} [p.createdAt]                   ISO; defaults to new Date().toISOString()
 * @returns {Object} bundle JSON
 */
export function buildEnrollmentBundle(p) {
    if (!p || typeof p !== 'object') {
        throw new Error('buildEnrollmentBundle: params object required');
    }

    const required = [
        'orgId', 'agentName',
        'orgSpendingPrivKey', 'orgSpendingPubKey', 'orgEncryptionKeypair',
        'aspLeaf', 'aspLeafIndex',
        'agentAuthKey', 'adminStellarAddress',
        'deployments',
    ];
    for (const k of required) {
        if (p[k] === undefined || p[k] === null) {
            throw new Error(`buildEnrollmentBundle: missing required field '${k}'`);
        }
    }

    const d = p.deployments;
    if (typeof d !== 'object') {
        throw new Error(`buildEnrollmentBundle: deployments must be an object`);
    }
    const needed = ['pool', 'asp_membership', 'asp_non_membership', 'verifier'];
    for (const k of needed) {
        if (!d[k]) {
            throw new Error(`buildEnrollmentBundle: deployments.${k} missing`);
        }
    }

    return {
        version: BUNDLE_VERSION,
        orgId: p.orgId,
        agentName: p.agentName,
        orgSpendingPrivKey:   p.orgSpendingPrivKey,
        orgSpendingPubKey:    p.orgSpendingPubKey,
        orgEncryptionKeypair: p.orgEncryptionKeypair,
        aspLeaf:              p.aspLeaf,
        aspLeafIndex:         p.aspLeafIndex,
        agentAuthKey:         p.agentAuthKey,
        adminStellarAddress:  p.adminStellarAddress,
        poolContractId:             d.pool,
        aspMembershipContractId:    d.asp_membership,
        aspNonMembershipContractId: d.asp_non_membership,
        verifierContractId:         d.verifier,
        facilitatorUrl: p.facilitatorUrl || 'http://localhost:3000',
        network:        p.network || d.network || 'testnet',
        createdAt:      p.createdAt || new Date().toISOString(),
    };
}

/**
 * Browser-only: trigger a download of the bundle as <agentName>.enclave.json.
 * Not used by jest tests — pure buildEnrollmentBundle is what's tested.
 *
 * @param {Object} bundle
 * @param {string} agentName
 */
export function triggerBundleDownload(bundle, agentName) {
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${agentName}.enclave.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

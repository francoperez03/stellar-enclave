/**
 * Enclave agent enrollment (ORG-02).
 *
 * Generates a fresh random authKey, writes a enclave_agents row, then builds
 * an enrollment bundle for out-of-band delivery to Phase 3 agents.
 *
 * Invariants:
 *   - ORG-02 (random authKey): agentAuthPrivKey is 32 bytes from
 *     crypto.getRandomValues — NEVER derived from Freighter, NEVER
 *     deterministic.
 *   - ORG-02 (uniqueness): (orgId, agentName) is unique. registry.putAgent
 *     refuses to overwrite — this module surfaces that rejection verbatim so
 *     the demo UI can show a clear error.
 *   - ORG-02 (zero on-chain): enrollment NEVER touches the Soroban SDK,
 *     stellar.js, or Freighter. The org's spending + encryption keys come
 *     exclusively from the session cache (keys.js::getCachedOrgKeys) which
 *     was populated by createOrg. Any import of network-submit helpers or
 *     the ASP membership leaf-insert entrypoint here is a bug — Plan 01-03
 *     acceptance_criteria asserts ZERO occurrences of those symbols in
 *     this file (the grep list is enforced by the plan, not inlined here).
 *   - Phase 1 authPubKey placeholder: SHA-256(authPrivKey). CONTEXT.md
 *     §Claude's Discretion permits this as a stable 32-byte commitment until
 *     Phase 2/3 land a real signature scheme. (FACIL-02 cut reduces the
 *     criticality of this since the facilitator no longer verifies this key.)
 *
 * Bundle shape: see app/js/enclave/bundle.js (buildEnrollmentBundle). Note
 * that bundle.js serializes the org encryption keypair as {publicKey,
 * secretKey}, whereas the runtime session-cache shape is {publicKey,
 * privateKey}. This module performs the name mapping.
 *
 * @module enclave/enroll
 */

import { putAgent, getOrgByAdmin } from './registry.js';
import { getCachedOrgKeys } from './keys.js';
import { buildEnrollmentBundle } from './bundle.js';

/**
 * Convert a Uint8Array to 0x-prefixed lowercase hex.
 * @param {Uint8Array} bytes
 * @returns {string}
 */
function u8ToHex(bytes) {
    let s = '0x';
    for (let i = 0; i < bytes.length; i++) {
        s += bytes[i].toString(16).padStart(2, '0');
    }
    return s;
}

/**
 * Phase 1 agent auth pubkey: SHA-256(authPrivKey) as a 32-byte commitment.
 * Uses the Web Crypto API available in browsers and Node 19+.
 *
 * @param {Uint8Array} authPrivKey  32 bytes
 * @returns {Promise<Uint8Array>}   32 bytes
 */
async function deriveAgentAuthPubKey(authPrivKey) {
    const digest = await crypto.subtle.digest('SHA-256', authPrivKey);
    return new Uint8Array(digest);
}

/**
 * Enroll a new agent in an existing org.
 *
 * Preconditions:
 *   - enclave_orgs row for adminAddress exists (createOrg ran in this or a
 *     previous session).
 *   - The org's derived keys are in the session cache (setCachedOrgKeys —
 *     happens automatically at the end of createOrg; demos that reload the
 *     page before enrolling must reconnect Freighter to rebuild the cache).
 *
 * @param {Object} params
 * @param {string} params.adminAddress   Stellar G... admin address
 * @param {string} params.orgId          must match the row's orgId
 * @param {string} params.agentName      short label, unique per org
 * @param {Object} params.deployments    parsed scripts/deployments.json
 * @returns {Promise<{ bundle: Object, agentRow: Object }>}
 * @throws {Error} on missing params, missing org row, missing cached keys,
 *                  or duplicate (orgId, agentName)
 */
export async function enrollAgent(params = {}) {
    const { adminAddress, orgId, agentName, deployments, facilitatorUrl } = params;

    if (!adminAddress) {
        throw new Error('enrollAgent: adminAddress required');
    }
    if (!orgId) {
        throw new Error('enrollAgent: orgId required');
    }
    if (!agentName || typeof agentName !== 'string' || !agentName.trim()) {
        throw new Error('enrollAgent: agentName required');
    }
    if (!deployments || !deployments.pool) {
        throw new Error('enrollAgent: deployments.pool missing');
    }

    // Cached-key check happens BEFORE touching IndexedDB so the "not in
    // session cache" path is observable even when no org row exists yet.
    const keys = getCachedOrgKeys(adminAddress);
    if (!keys) {
        throw new Error(
            'Org spending key not in session cache. Run Create Org or reconnect Freighter.',
        );
    }

    const org = await getOrgByAdmin(adminAddress);
    if (!org || org.orgId !== orgId) {
        throw new Error(
            `enrollAgent: no enclave_orgs row for admin ${adminAddress} matching orgId ${orgId}`,
        );
    }

    // 1. Generate a fresh random 32-byte authPrivKey. This is the ONLY source
    //    of randomness in the flow; everything else is deterministic.
    const authPrivKey = new Uint8Array(32);
    crypto.getRandomValues(authPrivKey);
    const authPubKey = await deriveAgentAuthPubKey(authPrivKey);

    // 2. Persist the agent row. registry.putAgent throws on duplicate id
    //    (orgId/agentName) — we surface that error verbatim to honor the
    //    uniqueness invariant.
    const agentRow = {
        id:         `${orgId}/${agentName.trim()}`,
        orgId,
        agentName:  agentName.trim(),
        authPubKey: u8ToHex(authPubKey),
        enrolledAt: new Date().toISOString(),
    };
    await putAgent(agentRow);

    // 3. Build the enrollment bundle. Map the session-cache
    //    {publicKey, privateKey} runtime shape to the bundle's
    //    {publicKey, secretKey} serialized shape.
    const bundle = buildEnrollmentBundle({
        orgId,
        agentName: agentRow.agentName,
        orgSpendingPrivKey: u8ToHex(keys.orgSpendingPrivKey),
        orgSpendingPubKey:  u8ToHex(keys.orgSpendingPubKey),
        orgEncryptionKeypair: {
            publicKey: u8ToHex(keys.orgEncryptionKeypair.publicKey),
            secretKey: u8ToHex(keys.orgEncryptionKeypair.privateKey),
        },
        aspLeaf:             org.aspLeaf,
        aspLeafIndex:        org.aspLeafIndex,
        agentAuthKey:        u8ToHex(authPrivKey),
        adminStellarAddress: adminAddress,
        deployments,
        facilitatorUrl,
    });

    return { bundle, agentRow };
}

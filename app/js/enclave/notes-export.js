/**
 * Enclave-flavored notes export for the agent SDK.
 *
 * The default `state.exportNotes()` dumps `user_notes` rows verbatim, which the
 * agent SDK cannot consume — the agent expects the `EnclaveNote` shape with
 * precomputed pool + ASP merkle proofs. This module joins data from three
 * sources at export time:
 *
 *   user_notes             — private fields (blinding, leafIndex, privateKey, amount, commitment)
 *   enclave_note_tags      — public cross-ref (nullifier + orgId by commitment)
 *   StateManager           — fresh pool + ASP merkle proofs at the moment of export
 *
 * Merkle paths must be FRESH — they change every time a new leaf lands on
 * either tree. We don't persist them; we recompute at export time from the
 * current in-memory trees (which the caller is expected to sync first via
 * `StateManager.startSync({ forceRefresh: true })`).
 *
 * @module enclave/notes-export
 */

import { listNoteTags } from './registry.js';
import { computeEnclaveAspLeaf } from './keys.js';
import { bytesToBigIntLE } from '../bridge.js';

/**
 * Slice a concatenated Uint8Array into `count` 32-byte little-endian field
 * elements, returned as decimal strings — the shape the circuit + agent
 * SDK expect.
 *
 * @param {Uint8Array} bytes
 * @param {number} count
 * @returns {string[]}
 */
function sliceFieldElementsDecimal(bytes, count) {
    const out = [];
    for (let i = 0; i < count; i++) {
        const chunk = bytes.slice(i * 32, (i + 1) * 32);
        out.push(bytesToBigIntLE(chunk).toString());
    }
    return out;
}

function bytesToHex(bytes) {
    let s = '';
    for (const b of bytes) s += b.toString(16).padStart(2, '0');
    return s;
}

function hexToBytes(hex) {
    const s = hex.replace(/^0x/, '');
    const out = new Uint8Array(s.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16);
    return out;
}

/**
 * Export the org's unspent notes in EnclaveNote[] shape, enriched with fresh
 * pool + ASP merkle proofs.
 *
 * @param {Object} params
 * @param {string} params.ownerAddress       Connected Freighter G-address (user_notes owner filter)
 * @param {string} params.orgId              Target org — filters to notes that belong to this org via enclave_note_tags
 * @param {Uint8Array} params.orgSpendingPubKey  Used to compute aspLeaf deterministically
 * @param {number} params.aspLeafIndex       Org's ASP membership leaf index (from enclave_orgs row)
 * @param {Object} params.stateManager       StateManager singleton from app/js/state/index.js
 * @param {number} [params.treeDepth=10]     Tree depth for path-element slicing (TREE_DEPTH)
 * @returns {Promise<Blob>}  JSON-serialized { version, exportedAt, orgId, notes }
 */
export async function exportEnclaveNotes({
    ownerAddress, orgId, orgSpendingPubKey, aspLeafIndex, stateManager,
    treeDepth = 10,
}) {
    if (!ownerAddress) throw new Error('exportEnclaveNotes: ownerAddress required');
    if (!orgId)        throw new Error('exportEnclaveNotes: orgId required');
    if (!orgSpendingPubKey) throw new Error('exportEnclaveNotes: orgSpendingPubKey required');
    if (typeof aspLeafIndex !== 'number') throw new Error('exportEnclaveNotes: aspLeafIndex must be a number');

    // Ensure trees reflect the latest on-chain state before we read proofs.
    try {
        await stateManager.startSync({ forceRefresh: true });
    } catch (e) {
        console.warn('[notes-export] sync failed, proceeding with stale state:', e);
    }

    const userNotes = await stateManager.getUserNotes({ owner: ownerAddress });
    const noteTags  = await listNoteTags(orgId);
    const tagByCommitment = new Map();
    for (const tag of noteTags) {
        // enclave_note_tags stores commitment as hex string (commitmentToHex output).
        tagByCommitment.set(String(tag.commitment).toLowerCase().replace(/^0x/, ''), tag);
    }

    // ASP data is org-scoped — one computation for all notes.
    const aspLeafBytes = computeEnclaveAspLeaf(orgSpendingPubKey);
    const aspLeafDecimal = bytesToBigIntLE(aspLeafBytes).toString();

    const aspProof = await stateManager.getASPMembershipProof(aspLeafIndex);
    if (!aspProof) {
        throw new Error(`ASP membership proof unavailable for leaf index ${aspLeafIndex}`);
    }
    const aspPathElements = sliceFieldElementsDecimal(aspProof.path_elements, treeDepth);
    const aspPathIndex    = bytesToBigIntLE(aspProof.path_indices).toString();

    const out = [];
    for (const note of userNotes) {
        if (note.spent) continue;
        // Match this note to the org via commitment → enclave_note_tags.
        const commitKey = String(note.id || '').toLowerCase().replace(/^0x/, '');
        const tag = tagByCommitment.get(commitKey);
        if (!tag) continue; // note doesn't belong to this org

        const poolProof = await stateManager.getMerkleProof(note.leafIndex);
        if (!poolProof) {
            console.warn(`[notes-export] pool proof missing for leafIndex ${note.leafIndex} — skipping`);
            continue;
        }
        const pathElements = sliceFieldElementsDecimal(poolProof.path_elements, treeDepth);
        const pathIndex    = bytesToBigIntLE(poolProof.path_indices).toString();

        // commitment: stored as hex in user_notes (.id); convert to decimal for the agent.
        const commitmentDecimal = bytesToBigIntLE(hexToBytes(note.id)).toString();

        // blinding: stored hex in user_notes; convert to decimal for the agent.
        const blindingDecimal = bytesToBigIntLE(hexToBytes(note.blinding)).toString();

        out.push({
            commitment:       commitmentDecimal,
            nullifier:        tag.nullifier, // already decimal string from Phase 05-02
            amount:           String(note.amount), // EnclaveNote.amount is bigint; JSON.stringify below handles it via BigInt→string fallback
            blinding:         blindingDecimal,
            pathElements,
            pathIndex,
            aspLeaf:          aspLeafDecimal,
            aspPathElements,
            aspPathIndex:     aspPathIndex,
        });
    }

    const payload = {
        version: 1,
        exportedAt: new Date().toISOString(),
        orgId,
        notes: out,
    };

    const json = JSON.stringify(payload, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 2);
    return new Blob([json], { type: 'application/json' });
}

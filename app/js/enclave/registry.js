/**
 * Enclave registry — typed CRUD over enclave_orgs, enclave_agents, enclave_note_tags.
 *
 * Fail-loudly semantics:
 *   - putOrg throws if adminAddress already owns an org (overwrite prevention).
 *   - putAgent throws if the (orgId, agentName) pair already exists.
 *   - putNoteTag is idempotent (put-upsert) — safe to replay on the same commitment.
 *
 * @module enclave/registry
 */

import { openDatabase } from '../state/db.js';

const ORGS_STORE      = 'enclave_orgs';
const AGENTS_STORE    = 'enclave_agents';
const NOTE_TAGS_STORE = 'enclave_note_tags';

function tx(db, stores, mode) {
    return db.transaction(stores, mode);
}

function promisifyRequest(req) {
    return new Promise((resolve, reject) => {
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

// ---- enclave_orgs ----

/**
 * Insert a new org row. Throws if the adminAddress already owns an org.
 *
 * @param {{
 *   adminAddress: string,
 *   orgId: string,
 *   orgSpendingPubKey: string,
 *   aspLeaf: string,
 *   aspLeafIndex: number,
 *   createdAt: string,
 *   deployTxHash: string
 * }} row
 * @returns {Promise<void>}
 */
export async function putOrg(row) {
    const required = ['adminAddress', 'orgId', 'orgSpendingPubKey', 'aspLeaf', 'aspLeafIndex', 'createdAt', 'deployTxHash'];
    for (const k of required) {
        if (row[k] === undefined || row[k] === null) {
            throw new Error(`putOrg: missing required field '${k}'`);
        }
    }
    const db = await openDatabase();
    const store = tx(db, [ORGS_STORE], 'readwrite').objectStore(ORGS_STORE);
    // keyPath=adminAddress. Fail-loudly: check first, then add().
    const existing = await promisifyRequest(store.get(row.adminAddress));
    if (existing) {
        throw new Error(
            `putOrg: adminAddress ${row.adminAddress} already owns org '${existing.orgId}' (created ${existing.createdAt})`
        );
    }
    await promisifyRequest(store.add(row));
}

/**
 * Fetch the org row owned by the given admin address, or undefined.
 * @param {string} adminAddress
 * @returns {Promise<Object|undefined>}
 */
export async function getOrgByAdmin(adminAddress) {
    const db = await openDatabase();
    const store = tx(db, [ORGS_STORE], 'readonly').objectStore(ORGS_STORE);
    return promisifyRequest(store.get(adminAddress));
}

/**
 * List every org row in the shared DB.
 * @returns {Promise<Array<Object>>}
 */
export async function getAllOrgs() {
    const db = await openDatabase();
    const store = tx(db, [ORGS_STORE], 'readonly').objectStore(ORGS_STORE);
    return promisifyRequest(store.getAll());
}

// ---- enclave_agents ----

/**
 * Insert a new agent row. Throws if (orgId, agentName) already exists.
 *
 * @param {{ id: string, orgId: string, agentName: string, authPubKey: string, enrolledAt: string }} row
 * @returns {Promise<void>}
 */
export async function putAgent(row) {
    const required = ['id', 'orgId', 'agentName', 'authPubKey', 'enrolledAt'];
    for (const k of required) {
        if (!row[k]) {
            throw new Error(`putAgent: missing required field '${k}'`);
        }
    }
    if (row.id !== `${row.orgId}/${row.agentName}`) {
        throw new Error(`putAgent: id must equal '${row.orgId}/${row.agentName}'`);
    }
    const db = await openDatabase();
    const store = tx(db, [AGENTS_STORE], 'readwrite').objectStore(AGENTS_STORE);
    const existing = await promisifyRequest(store.get(row.id));
    if (existing) {
        throw new Error(
            `putAgent: agent '${row.agentName}' already exists in org '${row.orgId}'`
        );
    }
    await promisifyRequest(store.add(row));
}

/**
 * List all agents for an org.
 * @param {string} orgId
 * @returns {Promise<Array<Object>>}
 */
export async function listAgents(orgId) {
    const db = await openDatabase();
    const store = tx(db, [AGENTS_STORE], 'readonly').objectStore(AGENTS_STORE);
    const index = store.index('by_orgId');
    return promisifyRequest(index.getAll(orgId));
}

// ---- enclave_note_tags ----

/**
 * Upsert a note-tag row. Idempotent — replaying the same commitment row is safe.
 *
 * @param {{ commitment: string, orgId: string, ledger: number, amount: string, nullifier?: string }} row
 * @returns {Promise<void>}
 */
export async function putNoteTag(row) {
    const required = ['commitment', 'orgId', 'ledger', 'amount'];
    for (const k of required) {
        if (row[k] === undefined || row[k] === null) {
            throw new Error(`putNoteTag: missing required field '${k}'`);
        }
    }
    const db = await openDatabase();
    const store = tx(db, [NOTE_TAGS_STORE], 'readwrite').objectStore(NOTE_TAGS_STORE);
    await promisifyRequest(store.put(row));
}

/**
 * List all note-tag rows for an org.
 * @param {string} orgId
 * @returns {Promise<Array<Object>>}
 */
export async function listNoteTags(orgId) {
    const db = await openDatabase();
    const store = tx(db, [NOTE_TAGS_STORE], 'readonly').objectStore(NOTE_TAGS_STORE);
    const index = store.index('by_orgId');
    return promisifyRequest(index.getAll(orgId));
}

/**
 * Fetch the note-tag row matching the given nullifier (decimal bigint string).
 * Returns undefined if no row is indexed under that nullifier.
 * @param {string} nullifier
 * @returns {Promise<Object|undefined>}
 */
export async function getNoteTagByNullifier(nullifier) {
    if (nullifier === undefined || nullifier === null) {
        return undefined;
    }
    const db = await openDatabase();
    const store = tx(db, [NOTE_TAGS_STORE], 'readonly').objectStore(NOTE_TAGS_STORE);
    const index = store.index('by_nullifier');
    return promisifyRequest(index.get(nullifier));
}

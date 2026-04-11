/**
 * Registry CRUD tests — enclave_orgs / enclave_agents / enclave_note_tags.
 *
 * These tests exercise the REAL `app/js/state/db.js` against an in-memory
 * IndexedDB provided by `fake-indexeddb/auto`, which registers global
 * `indexedDB` + `IDBKeyRange` before any module load. This validates:
 *
 *   1. `openDatabase` creates the three Plan 01-02 stores additively at
 *      DB_VERSION 6 (SETUP-02 schema bump).
 *   2. `putOrg` / `putAgent` fail-loudly on duplicate primary keys.
 *   3. `putNoteTag` is idempotent (put-upsert).
 *   4. `listAgents` and `listNoteTags` use the `by_orgId` index correctly.
 *   5. `getAllOrgs` returns every registered org regardless of admin.
 *
 * The database is `deleteDatabase()`'d in beforeEach so each test starts
 * from a clean slate — fake-indexeddb persists state within a single jest
 * worker otherwise.
 */

import 'fake-indexeddb/auto';

// Prover mock is needed because registry.js → db.js doesn't touch prover,
// but other enclave tests do, and clearMocks:true in jest config means we
// should be explicit. For registry alone the virtual mock is unused at
// runtime but keeps moduleNameMapper quiet.
jest.mock('../../prover.js', () => require('../../__mocks__/prover.js'), { virtual: true });
jest.mock('../../witness/witness.js', () => require('../../__mocks__/witness.js'), { virtual: true });

import {
    putOrg,
    getOrgByAdmin,
    getAllOrgs,
    putAgent,
    listAgents,
    putNoteTag,
    listNoteTags,
} from '../../enclave/registry.js';
import { deleteDatabase, openDatabase, DB_VERSION } from '../../state/db.js';

// Fresh DB per test — fake-indexeddb is global state within a jest worker.
beforeEach(async () => {
    await deleteDatabase();
});

// Prevent open handles from blocking the worker.
afterAll(async () => {
    await deleteDatabase();
});

describe('Registry — enclave_orgs CRUD', () => {
    test('db_upgradesTo_v6', async () => {
        // Simple sanity check — opening the DB must succeed and report v6.
        const db = await openDatabase();
        expect(db.version).toBe(DB_VERSION);
        expect(db.version).toBe(6);
        // All three new stores must be present.
        expect(db.objectStoreNames.contains('enclave_orgs')).toBe(true);
        expect(db.objectStoreNames.contains('enclave_agents')).toBe(true);
        expect(db.objectStoreNames.contains('enclave_note_tags')).toBe(true);
    });

    test('createOrg_writesOrgRow', async () => {
        const row = {
            adminAddress: 'GADMIN1',
            orgId: 'company1',
            orgSpendingPubKey: '0xaaaa',
            aspLeaf: '0xbbbb',
            aspLeafIndex: 0,
            createdAt: '2026-04-11T00:00:00.000Z',
            deployTxHash: '0xdeadbeef',
        };
        await putOrg(row);

        const round = await getOrgByAdmin('GADMIN1');
        expect(round).toEqual(row);
    });

    test('createOrg_rejectsDuplicateAdmin', async () => {
        const row = {
            adminAddress: 'GADMIN1',
            orgId: 'company1',
            orgSpendingPubKey: '0xaa',
            aspLeaf: '0xbb',
            aspLeafIndex: 0,
            createdAt: '2026-04-11T00:00:00.000Z',
            deployTxHash: '0xcc',
        };
        await putOrg(row);

        await expect(putOrg({ ...row, orgId: 'company1-take-two' })).rejects.toThrow(
            /already owns org/
        );
    });

    test('createOrg_rejectsMissingRequiredField', async () => {
        await expect(
            putOrg({
                adminAddress: 'GADMIN1',
                orgId: 'company1',
                // missing orgSpendingPubKey
                aspLeaf: '0xbb',
                aspLeafIndex: 0,
                createdAt: '2026-04-11T00:00:00.000Z',
                deployTxHash: '0xcc',
            })
        ).rejects.toThrow(/missing required field 'orgSpendingPubKey'/);
    });

    test('getAllOrgs_returnsEverything', async () => {
        await putOrg({
            adminAddress: 'GADMIN1',
            orgId: 'company1',
            orgSpendingPubKey: '0xa1',
            aspLeaf: '0xb1',
            aspLeafIndex: 0,
            createdAt: '2026-04-11T00:00:00.000Z',
            deployTxHash: '0xc1',
        });
        await putOrg({
            adminAddress: 'GADMIN2',
            orgId: 'company2',
            orgSpendingPubKey: '0xa2',
            aspLeaf: '0xb2',
            aspLeafIndex: 1,
            createdAt: '2026-04-11T00:01:00.000Z',
            deployTxHash: '0xc2',
        });

        const all = await getAllOrgs();
        expect(all).toHaveLength(2);
        const orgIds = all.map(o => o.orgId).sort();
        expect(orgIds).toEqual(['company1', 'company2']);
    });

    test('getOrgByAdmin_returnsUndefinedForUnknown', async () => {
        const row = await getOrgByAdmin('GNONEXISTENT');
        expect(row).toBeUndefined();
    });
});

describe('Registry — enclave_agents CRUD', () => {
    const validAgent = {
        id: 'company1/agent-alpha',
        orgId: 'company1',
        agentName: 'agent-alpha',
        authPubKey: '0x1111',
        enrolledAt: '2026-04-11T00:00:00.000Z',
    };

    test('enrollAgent_writesRow', async () => {
        await putAgent(validAgent);
        const agents = await listAgents('company1');
        expect(agents).toHaveLength(1);
        expect(agents[0]).toEqual(validAgent);
    });

    test('enrollAgent_rejectsDuplicateName', async () => {
        await putAgent(validAgent);
        await expect(putAgent({ ...validAgent, authPubKey: '0x2222' })).rejects.toThrow(
            /already exists in org/
        );
    });

    test('enrollAgent_rejectsMismatchedId', async () => {
        await expect(
            putAgent({ ...validAgent, id: 'company2/agent-alpha' })
        ).rejects.toThrow(/id must equal/);
    });

    test('enrollAgent_rejectsMissingField', async () => {
        const { authPubKey, ...missing } = validAgent;
        await expect(putAgent(missing)).rejects.toThrow(/missing required field 'authPubKey'/);
    });

    test('listAgents_isolatesByOrg', async () => {
        await putAgent(validAgent);
        await putAgent({
            id: 'company1/agent-beta',
            orgId: 'company1',
            agentName: 'agent-beta',
            authPubKey: '0x2222',
            enrolledAt: '2026-04-11T00:01:00.000Z',
        });
        await putAgent({
            id: 'company2/agent-alpha',
            orgId: 'company2',
            agentName: 'agent-alpha',
            authPubKey: '0x3333',
            enrolledAt: '2026-04-11T00:02:00.000Z',
        });

        const c1 = await listAgents('company1');
        const c2 = await listAgents('company2');
        expect(c1).toHaveLength(2);
        expect(c2).toHaveLength(1);
        expect(c1.map(a => a.agentName).sort()).toEqual(['agent-alpha', 'agent-beta']);
        expect(c2[0].agentName).toBe('agent-alpha');
    });
});

describe('Registry — enclave_note_tags CRUD', () => {
    test('depositPostCommit_writesNoteTag', async () => {
        const row = {
            commitment: '0xcomm1',
            orgId: 'company1',
            ledger: 1234,
            amount: '1000000',
        };
        await putNoteTag(row);

        const tags = await listNoteTags('company1');
        expect(tags).toHaveLength(1);
        expect(tags[0]).toEqual(row);
    });

    test('putNoteTag_isIdempotent', async () => {
        const row = {
            commitment: '0xcomm1',
            orgId: 'company1',
            ledger: 1234,
            amount: '1000000',
        };
        await putNoteTag(row);
        // Replay the same row — must not throw, and must not duplicate.
        await putNoteTag(row);

        const tags = await listNoteTags('company1');
        expect(tags).toHaveLength(1);
    });

    test('putNoteTag_rejectsMissingField', async () => {
        await expect(
            putNoteTag({
                commitment: '0xcomm1',
                orgId: 'company1',
                // missing ledger
                amount: '1',
            })
        ).rejects.toThrow(/missing required field 'ledger'/);
    });

    test('listNoteTags_isolatesByOrg', async () => {
        await putNoteTag({ commitment: '0xa', orgId: 'company1', ledger: 1, amount: '1' });
        await putNoteTag({ commitment: '0xb', orgId: 'company1', ledger: 2, amount: '2' });
        await putNoteTag({ commitment: '0xc', orgId: 'company2', ledger: 3, amount: '3' });

        const c1 = await listNoteTags('company1');
        const c2 = await listNoteTags('company2');
        expect(c1).toHaveLength(2);
        expect(c2).toHaveLength(1);
        expect(c1.map(r => r.commitment).sort()).toEqual(['0xa', '0xb']);
        expect(c2[0].commitment).toBe('0xc');
    });
});

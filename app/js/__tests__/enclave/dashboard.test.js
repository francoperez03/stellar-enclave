/**
 * Plan 05-06 Task 1 — Dashboard domain module tests.
 *
 * Tests guard:
 *   1. deriveOrgIdFromPrivKey returns the matching orgId for a known admin key
 *   2. deriveOrgIdFromPrivKey returns null for an unknown admin (DASH-02 isolation)
 *   3. deriveOrgIdFromPrivKey accepts a 64-char hex seed
 *   4. loadDashboardData returns empty for null orgId
 *   5. loadDashboardData sums deposits, subtracts spends, filters cross-org settlements
 *   6. loadDashboardData degrades to deposits-only on /settlements failure
 *
 * Uses fake-indexeddb for IndexedDB, mocks @stellar/stellar-sdk Keypair.
 */

import 'fake-indexeddb/auto';

jest.mock('../../prover.js', () => require('../../__mocks__/prover.js'), { virtual: true });
jest.mock('../../witness/witness.js', () => require('../../__mocks__/witness.js'), { virtual: true });

// Mock @stellar/stellar-sdk so we don't need the actual Stellar library in Jest
jest.mock('@stellar/stellar-sdk', () => {
    const keypairs = new Map();

    function MockKeypair(publicKey, seed) {
        this._publicKey = publicKey;
        this._seed = seed;
    }
    MockKeypair.prototype.publicKey = function () { return this._publicKey; };

    MockKeypair.fromSecret = (secret) => {
        // Return a deterministic mock keypair based on secret
        if (keypairs.has(secret)) return keypairs.get(secret);
        // Use a simple hash of the secret as the public key for testing
        const kp = new MockKeypair(`G_FROM_SECRET_${secret.slice(0, 8)}`, secret);
        keypairs.set(secret, kp);
        return kp;
    };
    MockKeypair.fromRawEd25519Seed = (seed) => {
        // seed is a Buffer/Uint8Array; convert to hex for keying
        const hex = Array.from(seed).map(b => b.toString(16).padStart(2, '0')).join('');
        if (keypairs.has(hex)) return keypairs.get(hex);
        const kp = new MockKeypair(`G_FROM_SEED_${hex.slice(0, 8)}`, hex);
        keypairs.set(hex, kp);
        return kp;
    };

    return { Keypair: MockKeypair };
});

import {
    deriveOrgIdFromPrivKey,
    loadDashboardData,
} from '../../enclave/dashboard.js';
import {
    putOrg,
    putNoteTag,
    putAgent,
    getNoteTagByNullifier,
} from '../../enclave/registry.js';
import { deleteDatabase } from '../../state/db.js';
import { Keypair } from '@stellar/stellar-sdk';

const FACILITATOR_URL = 'http://localhost:4021';

beforeEach(async () => {
    await deleteDatabase();
});

afterAll(async () => {
    await deleteDatabase();
});

// ---------------------------------------------------------------------------
// Test 1: deriveOrgIdFromPrivKey returns the matching orgId
// ---------------------------------------------------------------------------
describe('deriveOrgIdFromPrivKey', () => {
    test('returns the matching orgId for a known admin S... secret', async () => {
        const secret = 'SCZANGBA5IIMU5A4ZFJNFXOZQBHKQFPPHC4TL2I12H4H23FP5GNXZSCX';
        // Derive what the mock Keypair will return
        const kp = Keypair.fromSecret(secret);
        const adminAddress = kp.publicKey();

        await putOrg({
            adminAddress,
            orgId: 'org-test01-abc12345',
            orgSpendingPubKey: '0xtest',
            aspLeaf: '0xleaf',
            aspLeafIndex: 0,
            createdAt: '2026-04-12T00:00:00.000Z',
            deployTxHash: '0xhash',
        });

        const result = await deriveOrgIdFromPrivKey(secret);
        expect(result).toBe('org-test01-abc12345');
    });

    // Test 2: returns null for unknown admin (DASH-02 check)
    test('returns null for an unknown admin (DASH-02 isolation)', async () => {
        // DB has no orgs for this secret
        const secret = 'SBRK4QCNLXFEWQ2AM5XFKOCLLZP7OIZQRQJMOMTPQB6ZJDLYSDOKC1BX';
        const result = await deriveOrgIdFromPrivKey(secret);
        expect(result).toBeNull();
    });

    // Test 3: accepts 64-char hex seed
    test('accepts a 64-char hex seed', async () => {
        // Build a 32-byte hex seed (64 chars)
        const seedHex = 'deadbeef'.repeat(8); // 64 hex chars = 32 bytes

        // Derive what mock Keypair.fromRawEd25519Seed returns
        const seedBytes = new Uint8Array(32);
        for (let i = 0; i < 32; i++) {
            seedBytes[i] = parseInt(seedHex.slice(i * 2, i * 2 + 2), 16);
        }
        const kp = Keypair.fromRawEd25519Seed(Buffer.from(seedBytes));
        const adminAddress = kp.publicKey();

        await putOrg({
            adminAddress,
            orgId: 'org-hex-seed-test',
            orgSpendingPubKey: '0xpub',
            aspLeaf: '0xleaf2',
            aspLeafIndex: 1,
            createdAt: '2026-04-12T00:00:00.000Z',
            deployTxHash: '0xhash2',
        });

        const result = await deriveOrgIdFromPrivKey(seedHex);
        expect(result).toBe('org-hex-seed-test');
    });
});

// ---------------------------------------------------------------------------
// Test 4: loadDashboardData returns empty for null orgId
// ---------------------------------------------------------------------------
describe('loadDashboardData', () => {
    test('returns empty data for null orgId', async () => {
        const result = await loadDashboardData({
            orgId: null,
            facilitatorUrl: FACILITATOR_URL,
        });
        expect(result.balanceBaseUnits).toBe(0n);
        expect(result.agents).toEqual([]);
        expect(result.history).toEqual([]);
        expect(result.warnings).toEqual([]);
    });

    // Test 5: sums deposits, subtracts spends, filters cross-org settlements
    test('sums deposits and subtracts spends; filters cross-org settlements', async () => {
        const ORG_A = 'org-a';
        const ORG_B = 'org-b';

        // Seed org-a note tags with nullifiers n1, n2, n3
        await putNoteTag({ commitment: '0xc1', orgId: ORG_A, ledger: 1, amount: '100', nullifier: 'n1' });
        await putNoteTag({ commitment: '0xc2', orgId: ORG_A, ledger: 2, amount: '200', nullifier: 'n2' });
        await putNoteTag({ commitment: '0xc3', orgId: ORG_A, ledger: 3, amount: '300', nullifier: 'n3' });

        // Seed org-b note tag with nullifier n_OTHER_ORG
        await putNoteTag({ commitment: '0xc4', orgId: ORG_B, ledger: 4, amount: '999', nullifier: 'n_OTHER_ORG' });

        // Seed an org-a agent
        await putAgent({
            id: `${ORG_A}/agent-1`,
            orgId: ORG_A,
            agentName: 'agent-1',
            authPubKey: '0xauth1',
            enrolledAt: '2026-04-12T00:00:00.000Z',
        });

        // Mock fetchFn: returns three settlements, third is from org-b
        const mockFetchFn = async (url) => ({
            ok: true,
            status: 200,
            json: async () => [
                { ts: 1, nullifier: 'n1', amount: '-100', recipient: 'GAAAA', txHash: 'tx1' },
                { ts: 2, nullifier: 'n2', amount: '-50',  recipient: 'GBBBB', txHash: 'tx2' },
                { ts: 3, nullifier: 'n_OTHER_ORG', amount: '-999', recipient: 'GCCCC', txHash: 'tx3' },
            ],
        });

        const result = await loadDashboardData({
            orgId: ORG_A,
            facilitatorUrl: FACILITATOR_URL,
            fetchFn: mockFetchFn,
        });

        // totalDeposited = 100 + 200 + 300 = 600
        // totalSpent = 100 + 50 = 150 (n1 and n2 belong to org-a; n_OTHER_ORG belongs to org-b)
        // balance = 600 - 150 = 450
        expect(result.balanceBaseUnits).toBe(450n);
        expect(result.history).toHaveLength(2);
        // Third settlement (org-b) must NOT appear
        const nullifiers = result.history.map(h => h.nullifier);
        expect(nullifiers).not.toContain('n_OTHER_ORG');
        expect(result.warnings).toHaveLength(0);
        // Agents for org-a
        expect(result.agents).toHaveLength(1);
    });

    // Test 6: degrades to deposits-only on /settlements failure
    test('degrades to deposits-only on /settlements failure', async () => {
        const ORG_A = 'org-a';
        await putNoteTag({ commitment: '0xc1', orgId: ORG_A, ledger: 1, amount: '500', nullifier: 'n1' });

        const mockFetchFn = async () => ({
            ok: false,
            status: 503,
            json: async () => [],
        });

        const result = await loadDashboardData({
            orgId: ORG_A,
            facilitatorUrl: FACILITATOR_URL,
            fetchFn: mockFetchFn,
        });

        // Balance degrades to totalDeposited (500) with no spends
        expect(result.balanceBaseUnits).toBe(500n);
        expect(result.history).toEqual([]);
        expect(result.warnings).toHaveLength(1);
        expect(result.warnings[0]).toContain('503');
    });
});

/**
 * POOL-04 PRIMARY — encryptNoteData must always produce a 112-byte ciphertext
 * regardless of recipient pubkey, amount, or blinding. This is the unit-level
 * fallback for the Playwright parity test (which runs against a real browser
 * with a deterministic Freighter mock — see 01-RESEARCH.md §Gotcha 2).
 *
 * ARCHITECTURE NOTE:
 *   The real encryptNoteData is backed by a wasm-bindgen generated module
 *   (`app/js/prover.js`) that is NOT committed — it's produced by
 *   `wasm-pack --target web` from `app/crates/prover`. Jest's
 *   moduleNameMapper rewrites `./prover.js` to `app/js/__mocks__/prover.js`,
 *   which shims `encrypt_note_data` with a deterministic function that
 *   enforces the 112-byte contract at the mock boundary. The test below
 *   therefore verifies BOTH:
 *     (a) bridge.js::encryptNoteData correctly marshals the
 *         `{amount: bigint, blinding: Uint8Array(32)}` object into the
 *         40-byte plaintext the underlying wasm function expects; AND
 *     (b) the documented 112-byte contract (32 ephemeralPubKey + 24 nonce
 *         + 56 ciphertext+tag) is honored across 20 random inputs.
 *
 *   True cryptographic invariance (against the real WASM crypto) is verified
 *   by the Plan 01-04 Playwright e2e spec; this unit test guards the
 *   call-site wiring and contract length.
 */

jest.mock('../../prover.js', () => require('../../__mocks__/prover.js'), { virtual: true });
jest.mock('../../witness/witness.js', () => require('../../__mocks__/witness.js'), { virtual: true });

import { encryptNoteData, derivePublicKey } from '../../bridge.js';

function randomBytes(n) {
    const b = new Uint8Array(n);
    for (let i = 0; i < n; i++) b[i] = Math.floor(Math.random() * 256);
    return b;
}

function randomBigInt(maxBits = 64) {
    const bytes = Math.ceil(maxBits / 8);
    let v = 0n;
    for (let i = 0; i < bytes; i++) {
        v = (v << 8n) | BigInt(Math.floor(Math.random() * 256));
    }
    return v;
}

describe('encryptNoteData 112-byte invariant (POOL-04 primary)', () => {
    test('encryptNoteData_alwaysReturns112Bytes', () => {
        for (let i = 0; i < 20; i++) {
            // derivePublicKey must be callable (mocked shim — 32-byte deterministic output)
            const priv = randomBytes(32);
            void derivePublicKey(priv); // exercise the wiring, result unused

            // Encryption recipient pubkey is X25519 — treat as 32 random bytes.
            const encPubKey = randomBytes(32);
            const amount = randomBigInt(50);
            const blinding = randomBytes(32); // real bridge expects Uint8Array(32), not bigint

            const cipher = encryptNoteData(encPubKey, { amount, blinding });

            expect(cipher).toBeInstanceOf(Uint8Array);
            expect(cipher.length).toBe(112); // 32 ephemeralPubKey + 24 nonce + 56 ciphertext+tag
        }
    });

    test('encryptNoteData_isDeterministicForSameInput', () => {
        // Replay stability — same (recipientPubKey, amount, blinding) MUST produce
        // the same ciphertext at the mock boundary. The real crypto is non-deterministic
        // (random nonce), but the mock is deterministic and still enforces the 112-byte
        // contract, which is what we're asserting.
        const encPubKey = new Uint8Array(32).fill(7);
        const blinding = new Uint8Array(32).fill(9);
        const amount = 12345n;

        const first = encryptNoteData(encPubKey, { amount, blinding });
        const second = encryptNoteData(encPubKey, { amount, blinding });

        expect(first.length).toBe(112);
        expect(second.length).toBe(112);
        expect(Array.from(first)).toEqual(Array.from(second));
    });

    test('encryptNoteData_varyingBlindingChangesOutput', () => {
        // Asserts the bridge marshals blinding into the plaintext — if blinding
        // were accidentally dropped, both outputs would match byte-for-byte.
        const encPubKey = new Uint8Array(32).fill(7);
        const amount = 12345n;

        const a = encryptNoteData(encPubKey, { amount, blinding: new Uint8Array(32).fill(1) });
        const b = encryptNoteData(encPubKey, { amount, blinding: new Uint8Array(32).fill(2) });

        expect(a.length).toBe(112);
        expect(b.length).toBe(112);
        expect(Array.from(a)).not.toEqual(Array.from(b));
    });

    test('encryptNoteData_rejectsWrongPubKeyLength', () => {
        // Defense-in-depth: the bridge validates recipientPubKey.length === 32 itself.
        const badKey = new Uint8Array(16);
        const blinding = new Uint8Array(32);
        expect(() => encryptNoteData(badKey, { amount: 1n, blinding })).toThrow(
            /32 bytes/
        );
    });
});

/**
 * ORG-05 + derivation parity unit tests for app/js/enclave/keys.js.
 *
 * Two invariants:
 *   1. computeEnclaveAspLeaf uses blinding = new Uint8Array(32) verbatim,
 *      and that result is byte-identical to `admin.js::computeMembershipLeaf`
 *      when the admin's blinding input parses to 0n (→ bigintToField(0n) →
 *      hex_to_field_bytes('0x0') → 32 zero bytes in the prover mock).
 *   2. deriveOrgKeysFromFreighter is byte-for-byte parity with
 *      `ui/core.js::deriveKeysFromWallet` on identical Freighter signatures —
 *      verified by running the bridge functions the same way the upstream
 *      helper does and asserting equality of the derived priv/pub/encryption
 *      keys.
 */

jest.mock('../../prover.js', () => require('../../__mocks__/prover.js'), { virtual: true });
jest.mock('../../witness/witness.js', () => require('../../__mocks__/witness.js'), { virtual: true });
jest.mock('../../wallet.js', () => ({
    __esModule: true,
    signWalletMessage: jest.fn(),
}));

import {
    deriveOrgKeysFromFreighter,
    computeEnclaveAspLeaf,
    SPENDING_KEY_MESSAGE,
    ENCRYPTION_KEY_MESSAGE,
} from '../../enclave/keys.js';
import {
    poseidon2Hash2,
    derivePublicKey,
    deriveNotePrivateKeyFromSignature,
    deriveEncryptionKeypairFromSignature,
    bigintToField,
} from '../../bridge.js';
import { signWalletMessage } from '../../wallet.js';

// Helper — build a base64-encoded 64-byte signature from a numeric seed.
function base64Sig(seed) {
    const buf = new Uint8Array(64);
    for (let i = 0; i < 64; i++) buf[i] = (seed + i) & 0xff;
    return Buffer.from(buf).toString('base64');
}

describe('Enclave keys — ORG-05 ASP leaf uses blinding=0', () => {
    test('aspLeaf_blindingIsZero', () => {
        // Fixed non-trivial pubkey
        const pub = new Uint8Array(32);
        for (let i = 0; i < 32; i++) pub[i] = i + 1;

        const direct = poseidon2Hash2(pub, new Uint8Array(32), 1);
        const viaHelper = computeEnclaveAspLeaf(pub);

        expect(Array.from(viaHelper)).toEqual(Array.from(direct));
    });

    test('aspLeaf_matchesAdminJsComputation', () => {
        // admin.js::computeMembershipLeaf with blinding=0n takes this path:
        //   const blindingBytes = bigintToField(0n);            // → 32 zero bytes
        //   const leafBytes = poseidon2Hash2(pub, blindingBytes, 1);
        // which MUST equal computeEnclaveAspLeaf(pub) byte-for-byte.
        const priv = new Uint8Array(32);
        for (let i = 0; i < 32; i++) priv[i] = (7 * (i + 1)) & 0xff;
        const pub = derivePublicKey(priv);

        const adminJsLeaf = poseidon2Hash2(pub, bigintToField(0n), 1);
        const enclaveLeaf = computeEnclaveAspLeaf(pub);

        // bigintToField(0n) → hex_to_field_bytes('0x0') → new Uint8Array(32)
        // in the mock (see __mocks__/prover.js). Real WASM honors the same
        // contract (LE zero representation of the field zero).
        expect(Array.from(enclaveLeaf)).toEqual(Array.from(adminJsLeaf));
    });

    test('computeEnclaveAspLeaf_rejectsWrongLength', () => {
        expect(() => computeEnclaveAspLeaf(new Uint8Array(16))).toThrow(/32-byte/);
    });

    test('computeEnclaveAspLeaf_rejectsNonUint8Array', () => {
        expect(() => computeEnclaveAspLeaf([1, 2, 3])).toThrow(/32-byte/);
    });
});

describe('Enclave keys — sign message constants match upstream', () => {
    test('SPENDING_KEY_MESSAGE_isExactStringFromUpstream', () => {
        expect(SPENDING_KEY_MESSAGE).toBe('Privacy Pool Spending Key [v1]');
    });

    test('ENCRYPTION_KEY_MESSAGE_isExactStringFromUpstream', () => {
        expect(ENCRYPTION_KEY_MESSAGE).toBe('Sign to access Privacy Pool [v1]');
    });
});

describe('Enclave keys — derivation parity with upstream ui/core.js', () => {
    beforeEach(() => {
        signWalletMessage.mockReset();
    });

    test('derivation_parityWithUpstream', async () => {
        const spendingSig = base64Sig(42);
        const encryptionSig = base64Sig(99);

        signWalletMessage
            .mockResolvedValueOnce({ signedMessage: spendingSig, signerAddress: 'GABC' })
            .mockResolvedValueOnce({ signedMessage: encryptionSig, signerAddress: 'GABC' });

        const keys = await deriveOrgKeysFromFreighter({ signDelay: 0 });

        // Shape checks
        expect(keys.orgSpendingPrivKey).toBeInstanceOf(Uint8Array);
        expect(keys.orgSpendingPrivKey.length).toBe(32);
        expect(keys.orgSpendingPubKey).toBeInstanceOf(Uint8Array);
        expect(keys.orgSpendingPubKey.length).toBe(32);
        expect(keys.orgEncryptionKeypair).toBeDefined();
        expect(keys.orgEncryptionKeypair.publicKey).toBeInstanceOf(Uint8Array);
        expect(keys.orgEncryptionKeypair.privateKey).toBeInstanceOf(Uint8Array);

        // Byte-for-byte parity: manually reproduce the upstream path and compare.
        const spendingSigBytes = Uint8Array.from(
            Buffer.from(spendingSig, 'base64')
        );
        const encryptionSigBytes = Uint8Array.from(
            Buffer.from(encryptionSig, 'base64')
        );
        const upstreamPriv = deriveNotePrivateKeyFromSignature(spendingSigBytes);
        const upstreamPub = derivePublicKey(upstreamPriv);
        const upstreamEnc = deriveEncryptionKeypairFromSignature(encryptionSigBytes);

        expect(Array.from(keys.orgSpendingPrivKey)).toEqual(Array.from(upstreamPriv));
        expect(Array.from(keys.orgSpendingPubKey)).toEqual(Array.from(upstreamPub));
        expect(Array.from(keys.orgEncryptionKeypair.publicKey)).toEqual(Array.from(upstreamEnc.publicKey));
        expect(Array.from(keys.orgEncryptionKeypair.privateKey)).toEqual(Array.from(upstreamEnc.privateKey));
    });

    test('derivation_callsBothMessagesInOrder', async () => {
        signWalletMessage
            .mockResolvedValueOnce({ signedMessage: base64Sig(1), signerAddress: 'GABC' })
            .mockResolvedValueOnce({ signedMessage: base64Sig(2), signerAddress: 'GABC' });

        await deriveOrgKeysFromFreighter({ signDelay: 0 });

        expect(signWalletMessage).toHaveBeenCalledTimes(2);
        expect(signWalletMessage).toHaveBeenNthCalledWith(1, SPENDING_KEY_MESSAGE, {});
        expect(signWalletMessage).toHaveBeenNthCalledWith(2, ENCRYPTION_KEY_MESSAGE, {});
    });

    test('derivation_throwsWhenSpendingSignatureRejected', async () => {
        signWalletMessage.mockResolvedValueOnce({ signedMessage: null });
        await expect(deriveOrgKeysFromFreighter({ signDelay: 0 })).rejects.toThrow(
            /spending key signature rejected/i
        );
    });

    test('derivation_throwsWhenEncryptionSignatureRejected', async () => {
        signWalletMessage
            .mockResolvedValueOnce({ signedMessage: base64Sig(1), signerAddress: 'GABC' })
            .mockResolvedValueOnce({ signedMessage: null });
        await expect(deriveOrgKeysFromFreighter({ signDelay: 0 })).rejects.toThrow(
            /encryption key signature rejected/i
        );
    });
});

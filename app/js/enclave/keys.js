/**
 * Enclave key derivation — wraps upstream deriveKeysFromWallet with Enclave semantics.
 * DO NOT reimplement the crypto here; the whole point is byte-for-byte parity with
 * app/js/ui/core.js::deriveKeysFromWallet so Phase 3 Agent SDK and browser UI agree.
 *
 * Key semantics (ORG-05, Plan 01-02):
 *   - orgSpendingPrivKey / orgSpendingPubKey are derived from the 'Privacy Pool Spending Key [v1]'
 *     message signed via Freighter. The sign message is a constant, so each org's key hierarchy
 *     is naturally distinct by virtue of the admin's Freighter account differing — no per-org
 *     domain separator, no forked derivation.
 *   - ASP leaf uses blinding = 32 zero bytes (ORG-05). computeEnclaveAspLeaf is the single
 *     source of truth for this; app/js/admin.js::computeMembershipLeaf with blinding=0 is
 *     byte-identical.
 *
 * @module enclave/keys
 */

import { signWalletMessage } from '../wallet.js';
import {
    deriveNotePrivateKeyFromSignature,
    deriveEncryptionKeypairFromSignature,
    derivePublicKey,
    poseidon2Hash2,
} from '../bridge.js';

export const SPENDING_KEY_MESSAGE = 'Privacy Pool Spending Key [v1]';
export const ENCRYPTION_KEY_MESSAGE = 'Sign to access Privacy Pool [v1]';
export const SIGN_DELAY_MS = 300;

/**
 * Prompts Freighter twice (spending key, encryption key), returns derived org keys.
 * Identical semantics to ui/core.js::deriveKeysFromWallet except the return shape
 * uses Enclave naming (orgSpendingPrivKey, orgSpendingPubKey, orgEncryptionKeypair).
 *
 * @param {Object} [opts]
 * @param {(status: string) => void} [opts.onStatus]
 * @param {Object} [opts.signOptions]
 * @param {number} [opts.signDelay=300]
 * @returns {Promise<{
 *   orgSpendingPrivKey: Uint8Array,
 *   orgSpendingPubKey: Uint8Array,
 *   orgEncryptionKeypair: { publicKey: Uint8Array, privateKey: Uint8Array }
 * }>}
 */
export async function deriveOrgKeysFromFreighter({ onStatus, signOptions = {}, signDelay = SIGN_DELAY_MS } = {}) {
    onStatus?.('Sign message to derive keys (1/2)...');
    const spendingResult = await signWalletMessage(SPENDING_KEY_MESSAGE, signOptions);
    if (!spendingResult?.signedMessage) {
        throw new Error('Spending key signature rejected');
    }

    if (signDelay > 0) {
        await new Promise(r => setTimeout(r, signDelay));
    }

    onStatus?.('Sign message to derive keys (2/2)...');
    const encryptionResult = await signWalletMessage(ENCRYPTION_KEY_MESSAGE, signOptions);
    if (!encryptionResult?.signedMessage) {
        throw new Error('Encryption key signature rejected');
    }

    const spendingSigBytes   = Uint8Array.from(atob(spendingResult.signedMessage),   c => c.charCodeAt(0));
    const encryptionSigBytes = Uint8Array.from(atob(encryptionResult.signedMessage), c => c.charCodeAt(0));

    const orgSpendingPrivKey   = deriveNotePrivateKeyFromSignature(spendingSigBytes);
    const orgSpendingPubKey    = derivePublicKey(orgSpendingPrivKey);
    const orgEncryptionKeypair = deriveEncryptionKeypairFromSignature(encryptionSigBytes);

    return { orgSpendingPrivKey, orgSpendingPubKey, orgEncryptionKeypair };
}

/**
 * Compute the ASP membership leaf for an Enclave org using blinding=0 (ORG-05).
 * Matches app/js/admin.js::computeMembershipLeaf byte-for-byte when that helper
 * is invoked with a zero blinding value.
 *
 * @param {Uint8Array} orgSpendingPubKey 32-byte BN254 public key (Little-Endian)
 * @returns {Uint8Array} 32-byte leaf hash
 */
export function computeEnclaveAspLeaf(orgSpendingPubKey) {
    if (!(orgSpendingPubKey instanceof Uint8Array) || orgSpendingPubKey.length !== 32) {
        throw new Error('orgSpendingPubKey must be a 32-byte Uint8Array');
    }
    const zeroBlinding = new Uint8Array(32); // ORG-05: blinding literally zero
    return poseidon2Hash2(orgSpendingPubKey, zeroBlinding, 1);
}

// ---- Session key cache ----
// Module-scoped, cleared when the connected Freighter account changes. Matches
// the upstream app/js/state/notes-store.js::setAuthenticatedKeys pattern but
// scoped to enclave orgs.

let cachedOrgKeys = null;
let cachedOrgAddress = null;

/**
 * Returns the cached keys for the given Stellar address, or null if the cache
 * is empty or belongs to a different address.
 * @param {string} stellarAddress
 * @returns {{
 *   orgSpendingPrivKey: Uint8Array,
 *   orgSpendingPubKey: Uint8Array,
 *   orgEncryptionKeypair: { publicKey: Uint8Array, privateKey: Uint8Array }
 * } | null}
 */
export function getCachedOrgKeys(stellarAddress) {
    if (cachedOrgAddress !== stellarAddress) return null;
    return cachedOrgKeys;
}

/**
 * Stores the derived keys in the session cache, tagged by the Stellar address.
 * @param {string} stellarAddress
 * @param {Object} keys
 */
export function setCachedOrgKeys(stellarAddress, keys) {
    cachedOrgAddress = stellarAddress;
    cachedOrgKeys = keys;
}

/**
 * Clears the cached keys. Call on page unload or when the Freighter account
 * switches.
 */
export function clearCachedOrgKeys() {
    cachedOrgKeys = null;
    cachedOrgAddress = null;
}

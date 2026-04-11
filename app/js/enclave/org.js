/**
 * Enclave org bootstrap — derive keys, compute ASP leaf (blinding=0),
 * insert the leaf on-chain via asp-membership, capture the leaf index,
 * persist the enclave_orgs row, and cache the derived keys for the session.
 *
 * Mirrors app/js/admin.js::{getMembershipClient, insertMembershipLeaf}
 * byte-for-byte so the on-chain contract client surface is identical to
 * the admin panel path.
 *
 * Invariants (Plan 01-03 Task 1):
 *   - ORG-01: createOrg wires Freighter → keys → ASP leaf → insert_leaf →
 *             row persistence in a single idempotent flow.
 *   - ORG-05: ASP leaf uses blinding = new Uint8Array(32) (via
 *             computeEnclaveAspLeaf in keys.js) — never a random blinding.
 *   - Idempotency: throws before any Freighter prompt if the admin already
 *             owns an org (getOrgByAdmin pre-check).
 *
 * @module enclave/org
 */

import { contract } from '@stellar/stellar-sdk';

import {
    deriveOrgKeysFromFreighter,
    computeEnclaveAspLeaf,
    setCachedOrgKeys,
} from './keys.js';
import { getOrgByAdmin, getAllOrgs, putOrg } from './registry.js';
import { getNetwork } from '../stellar.js';
import { bytesToBigIntLE, fieldToHex } from '../bridge.js';

/**
 * Derive a stable orgId for UX display. Uses the admin's G-address prefix
 * plus the first 8 hex chars of the org spending pubkey so reruns for the
 * same admin produce the same label.
 *
 * @param {string} adminAddress
 * @param {Uint8Array} orgSpendingPubKey
 * @returns {string}
 */
function deriveOrgId(adminAddress, orgSpendingPubKey) {
    const pubHex = fieldToHex(orgSpendingPubKey);
    // fieldToHex returns 0x + 64 hex chars; strip 0x and take first 8 chars.
    const suffix = pubHex.replace(/^0x/, '').slice(0, 8);
    const adminShort = adminAddress.slice(0, 6).toLowerCase();
    return `org-${adminShort}-${suffix}`;
}

/**
 * Build a Soroban contract.Client for asp-membership using the connected
 * Freighter account as the signer. Mirrors app/js/admin.js::getMembershipClient.
 *
 * @param {Object} args
 * @param {string} args.contractId
 * @param {string} args.adminAddress
 * @param {{ signTransaction: Function, signAuthEntry: Function }} args.signerOptions
 * @param {string} args.rpcUrl
 * @param {string} args.networkPassphrase
 */
async function buildMembershipClient({
    contractId,
    adminAddress,
    signerOptions,
    rpcUrl,
    networkPassphrase,
}) {
    return contract.Client.from({
        rpcUrl,
        networkPassphrase,
        publicKey: adminAddress,
        signTransaction: signerOptions.signTransaction,
        signAuthEntry:   signerOptions.signAuthEntry,
        contractId,
    });
}

/**
 * Best-effort parse of the asp-membership LeafAdded event index from a
 * Soroban tx result. Returns -1 if the event/index can't be located so the
 * caller can fall back to a registry-count heuristic.
 *
 * asp-membership's insert_leaf returns the u64 index directly in the
 * contract return value, so the primary path simply coerces returnValue.
 *
 * @param {Object} sent  result of tx.signAndSend()
 * @returns {number}
 */
function extractLeafAddedIndex(sent) {
    try {
        // Path 1: contract return value — many SDK client shapes surface this.
        const rv = sent?.returnValue;
        if (rv !== undefined && rv !== null) {
            if (typeof rv === 'bigint') return Number(rv);
            if (typeof rv === 'number') return rv;
            if (typeof rv?.toString === 'function') {
                const n = Number(rv.toString());
                if (Number.isFinite(n) && n >= 0) return n;
            }
        }

        // Path 2: result metadata events — scan for a LeafAdded topic.
        const meta =
            sent?.sendTransactionResponse?.resultMetaXdr ||
            sent?.resultMetaXdr ||
            sent?.result_meta_xdr;
        if (meta && typeof meta === 'object' && Array.isArray(meta.events)) {
            for (const ev of meta.events) {
                const topics = ev?.topics;
                const isLeafAdded =
                    Array.isArray(topics) &&
                    topics.some((t) => String(t).includes('LeafAdded'));
                if (isLeafAdded) {
                    const data = ev?.data || ev?.body;
                    if (data && typeof data.index !== 'undefined') {
                        return Number(data.index);
                    }
                }
            }
        }
    } catch (e) {
        console.warn(
            '[Enclave/org] extractLeafAddedIndex parse error, falling back to getter',
            e,
        );
    }
    return -1;
}

/**
 * Create a new Enclave org for the currently-connected Freighter admin.
 *
 * Flow:
 *   1. Fail-loudly if the admin already owns an org (idempotency guard).
 *   2. Derive spending + encryption keys from Freighter (two sig prompts).
 *   3. Compute the ASP leaf with blinding=0 (ORG-05 literal).
 *   4. Call asp_membership.insert_leaf(leaf) via a fresh contract.Client.
 *   5. Parse the LeafAdded index from the tx result (or fall back to the
 *      local registry count).
 *   6. Persist the enclave_orgs row and cache the derived keys.
 *
 * @param {Object} params
 * @param {string} params.adminAddress
 * @param {Object} params.deployments  parsed scripts/deployments.json
 * @param {{ signTransaction: Function, signAuthEntry: Function, publicKey?: string }} params.signerOptions
 * @param {(status: string) => void} [params.onStatus]
 * @returns {Promise<{orgId: string, aspLeafIndex: number, deployTxHash: string}>}
 * @throws {Error} if the admin already owns an org, deployments is missing
 *                 asp_membership, or the on-chain insert fails.
 */
export async function createOrg({
    adminAddress,
    deployments,
    signerOptions,
    onStatus,
} = {}) {
    if (!adminAddress) {
        throw new Error('createOrg: adminAddress required');
    }
    if (!deployments || !deployments.asp_membership) {
        throw new Error('createOrg: deployments.asp_membership missing');
    }
    if (!signerOptions || typeof signerOptions !== 'object') {
        throw new Error('createOrg: signerOptions required');
    }

    // 1. Idempotency guard — fail before any Freighter prompt.
    const existing = await getOrgByAdmin(adminAddress);
    if (existing) {
        throw new Error(
            `This account already owns ${existing.orgId} (created ${existing.createdAt}). ` +
            `Switch to a different Freighter account in the extension to create a new org.`,
        );
    }

    // 2. Derive spending + encryption keys from Freighter (two sig prompts).
    onStatus?.('Deriving org keys from Freighter...');
    const keys = await deriveOrgKeysFromFreighter({ onStatus });

    // 3. Compute the ASP leaf with blinding=0 (ORG-05).
    const aspLeafBytes = computeEnclaveAspLeaf(keys.orgSpendingPubKey);
    const aspLeafHex   = fieldToHex(aspLeafBytes);
    const aspLeafBig   = bytesToBigIntLE(aspLeafBytes);

    // 4. Build contract.Client and invoke insert_leaf.
    onStatus?.('Inserting ASP membership leaf on-chain...');

    // getNetwork() → { name, horizonUrl, rpcUrl, passphrase }.
    // Note: stellar.js exposes `passphrase`, not `networkPassphrase`.
    const network = getNetwork();
    const rpcUrl            = network?.rpcUrl            || 'https://soroban-testnet.stellar.org';
    const networkPassphrase = network?.passphrase        || 'Test SDF Network ; September 2015';

    const membershipClient = await buildMembershipClient({
        contractId:   deployments.asp_membership,
        adminAddress,
        signerOptions,
        rpcUrl,
        networkPassphrase,
    });

    const tx = await membershipClient.insert_leaf({ leaf: aspLeafBig });
    const sent = await tx.signAndSend();
    const deployTxHash =
        sent?.sendTransactionResponse?.hash ||
        sent?.hash ||
        'unknown';

    // 5. Read back the leaf index from the LeafAdded event (or fallback).
    let aspLeafIndex = extractLeafAddedIndex(sent);
    if (aspLeafIndex < 0) {
        // Fallback: the next leaf is the count of prior org rows. This is a
        // best-effort approximation for the hackathon window; if it proves
        // wrong at runtime, the deposit path will fail loudly on membership
        // proof mismatch and we'll iterate. Documented in 01-RESEARCH.md.
        onStatus?.('Reading ASP leaf index from local registry fallback...');
        const orgs = await getAllOrgs();
        aspLeafIndex = orgs.length;
    }

    // 6. Persist enclave_orgs row and cache keys for the session.
    const orgId = deriveOrgId(adminAddress, keys.orgSpendingPubKey);
    await putOrg({
        adminAddress,
        orgId,
        orgSpendingPubKey: fieldToHex(keys.orgSpendingPubKey),
        aspLeaf:           aspLeafHex,
        aspLeafIndex,
        createdAt:         new Date().toISOString(),
        deployTxHash,
    });

    setCachedOrgKeys(adminAddress, keys);

    onStatus?.(`Org ${orgId} created (ASP leaf ${aspLeafIndex})`);
    return { orgId, aspLeafIndex, deployTxHash };
}

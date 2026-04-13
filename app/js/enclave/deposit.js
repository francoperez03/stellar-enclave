/**
 * Enclave deposit flow — wrap generateDepositProof with the cached org
 * spending pubkey, submit via stellar.js::submitDeposit, then write a
 * enclave_note_tags row after confirmation.
 *
 * Invariants (Plan 01-03 Task 2):
 *   - ORG-03: outputs[0].recipientPubKey = cached orgSpendingPubKey
 *     (upstream pads outputs[1] with an auto-generated dummy bound to the
 *      same pubkey via `pubKeyBytes` defaulting from `privKeyBytes`).
 *   - ORG-05 proof side: membershipBlinding = 0n matches the ASP leaf
 *     inserted by createOrg (keys.js::computeEnclaveAspLeaf uses blinding=0).
 *   - POOL-02: generateDepositProof returns { sorobanProof, extData }; both
 *     are passed to submitDeposit without mutation.
 *   - Gotcha 1: submitDeposit is the canonical entry point in stellar.js.
 *     The legacy "callPool*" shim the 01-RESEARCH.md gotcha refers to was
 *     never implemented upstream and is not available as an import.
 *   - Gotcha 5: output-note blinding must NEVER be 0n. This module generates
 *     an explicit random blinding via bridge.js::generateBlinding() for
 *     outputs[0] (upstream's createOutput crashes on `undefined` because
 *     bigintToField(undefined) is a TypeError). Upstream then pads
 *     outputs[1] with its own random dummy blinding.
 *   - Note-tag write happens only after submitDeposit returns success=true.
 *
 * @module enclave/deposit
 */

import { generateDepositProof } from '../transaction-builder.js';
import { submitDeposit } from '../stellar.js';
import { getCachedOrgKeys } from './keys.js';
import { getOrgByAdmin, putNoteTag } from './registry.js';
import { computeNullifier, computeSignature, bigintToField, bytesToBigIntLE, generateBlinding } from '../bridge.js';

/**
 * Convert a bigint (output commitment) into a 0x-prefixed lowercase hex
 * string, zero-padded to 64 hex chars (32 bytes). Mirrors the on-chain
 * big-endian representation stellar-sdk uses for U256 display.
 *
 * @param {bigint} value
 * @returns {string}
 */
function bigintToHex32(value) {
    const hex = value.toString(16);
    return '0x' + hex.padStart(64, '0');
}

/**
 * Normalize a commitment produced by generateDepositProof into a stable
 * 0x-hex string for enclave_note_tags storage. Accepts both bigint
 * (upstream sorobanProof shape) and Uint8Array (defensive — in case the
 * upstream shape ever changes).
 *
 * @param {bigint|Uint8Array} commitment
 * @returns {string}
 */
function commitmentToHex(commitment) {
    if (typeof commitment === 'bigint') {
        return bigintToHex32(commitment);
    }
    if (commitment instanceof Uint8Array) {
        let s = '0x';
        for (let i = 0; i < commitment.length; i++) {
            s += commitment[i].toString(16).padStart(2, '0');
        }
        return s;
    }
    // Fallback — string-coerce and prefix.
    return '0x' + String(commitment);
}

/**
 * Deposit `amountStroops` USDC into the pool on behalf of the caller's org.
 *
 * Requires:
 *   - The org row for `adminAddress` exists in enclave_orgs (createOrg ran).
 *   - The org's derived keys are in the session cache (setCachedOrgKeys).
 *
 * @param {Object} params
 * @param {string} params.adminAddress                 Stellar G... admin address
 * @param {bigint} params.amountStroops                USDC amount in stroops (7 decimals)
 * @param {Object} params.deployments                  parsed scripts/deployments.json
 * @param {{ poolRoot: bigint, membershipRoot: bigint, nonMembershipRoot: bigint }} params.rootsSnapshot
 * @param {Object} params.stateManager                 upstream StateManager instance
 * @param {{ publicKey: string, signTransaction: Function, signAuthEntry: Function }} params.signerOptions
 * @param {(status: string) => void} [params.onStatus]
 * @returns {Promise<{ success: boolean, txHash?: string, commitments: string[], error?: string }>}
 */
export async function depositForOrg(params = {}) {
    const {
        adminAddress,
        amountStroops,
        deployments,
        rootsSnapshot,
        stateManager,
        signerOptions,
        onStatus,
    } = params;

    if (!adminAddress) {
        throw new Error('depositForOrg: adminAddress required');
    }
    if (typeof amountStroops !== 'bigint' || amountStroops <= 0n) {
        throw new Error('depositForOrg: amountStroops must be a positive BigInt');
    }
    if (!deployments || !deployments.pool) {
        throw new Error('depositForOrg: deployments.pool missing');
    }
    if (!rootsSnapshot) {
        throw new Error('depositForOrg: rootsSnapshot required');
    }
    if (!signerOptions || !signerOptions.publicKey) {
        throw new Error('depositForOrg: signerOptions.publicKey required');
    }

    const org = await getOrgByAdmin(adminAddress);
    if (!org) {
        throw new Error(`No org exists for ${adminAddress}. Create an org first.`);
    }

    const keys = getCachedOrgKeys(adminAddress);
    if (!keys) {
        throw new Error(
            'Org spending key not in session cache. Run Create Org or reconnect Freighter.',
        );
    }

    onStatus?.('Generating deposit proof in browser...');

    // Explicit random blinding for outputs[0]. We cannot leave this undefined:
    // upstream createOutput calls bigintToField(undefined) at line 345 of
    // transaction-builder.js, which crashes because undefined.toString(16) is
    // a TypeError. generateBlinding() returns 32 bytes from the WASM RNG;
    // bytesToBigIntLE coerces to the bigint the createOutput/circuit path
    // expects. Upstream will pad outputs[1] with its own random dummy
    // blinding at lines 626-629 (createOutput(0n, pubKeyBytes, dummyBlinding)).
    // NEVER pass 0n here — Gotcha 5.
    const output0Blinding = bytesToBigIntLE(generateBlinding());

    const outputs = [
        {
            amount:                 amountStroops,
            recipientPubKey:        keys.orgSpendingPubKey,
            recipientEncryptionKey: keys.orgEncryptionKeypair.publicKey,
            blinding:               output0Blinding,
        },
    ];

    const proofParams = {
        privKeyBytes:        keys.orgSpendingPrivKey,
        encryptionPubKey:    keys.orgEncryptionKeypair.publicKey,
        poolRoot:            rootsSnapshot.poolRoot,
        membershipRoot:      rootsSnapshot.membershipRoot,
        nonMembershipRoot:   rootsSnapshot.nonMembershipRoot,
        poolAddress:         deployments.pool,
        amount:              amountStroops,
        outputs,
        stateManager,
        membershipLeafIndex: org.aspLeafIndex,
        membershipBlinding:  0n, // ORG-05 — ASP leaf was inserted with blinding=0
    };

    const proofResult = await generateDepositProof(proofParams, {});

    // Capture the pool leaf index BEFORE the tx lands — output_commitment0
    // (the real, spendable note) will deterministically occupy this slot.
    // Used below to persist the note into user_notes for agent SDK consumption.
    const myLeafIndexBeforeSubmit =
        typeof stateManager?.getPoolNextIndex === 'function'
            ? stateManager.getPoolNextIndex()
            : null;

    onStatus?.('Submitting deposit to pool contract...');
    const result = await submitDeposit(proofResult, signerOptions);

    if (!result || !result.success) {
        return {
            success: false,
            error:   result?.error || 'submitDeposit returned success=false',
            commitments: [],
        };
    }

    // Post-confirmation: synchronously write the note tag so the UI can
    // surface pending balances without waiting for the async indexer path
    // (CONTEXT.md §Deposit flow line 91).
    const commitment0Hex = commitmentToHex(proofResult.sorobanProof.output_commitment0);

    // Phase 5 / D1 — precompute the output-note nullifier at deposit time so
    // the dashboard can cross-reference facilitator /settlements entries back
    // to this org without a second derivation site.
    //
    // Same computeNullifier WASM binding used by the agent SDK at spend time;
    // identical inputs here → identical decimal-string nullifier there.
    // pathIndices=0 because the leaf's tree index is not known until the
    // deposit lands on-chain; this matches packages/agent/src/types.ts
    // EnclaveNote.pathIndex default behavior in the Phase 3 fixture.
    const commitmentBytes  = bigintToField(proofResult.sorobanProof.output_commitment0);
    const pathIndicesBytes = bigintToField(0n);
    const signatureBytes   = computeSignature(
        keys.orgSpendingPrivKey,
        commitmentBytes,
        pathIndicesBytes,
    );
    const nullifierBytes   = computeNullifier(
        commitmentBytes,
        pathIndicesBytes,
        signatureBytes,
    );
    const nullifierDecimal = bytesToBigIntLE(nullifierBytes).toString();

    await putNoteTag({
        commitment: commitment0Hex,
        orgId:      org.orgId,
        ledger:     0, // Phase 1 placeholder — demo UI doesn't need real ledger
        amount:     amountStroops.toString(),
        nullifier:  nullifierDecimal,   // Plan 05-02 — decimal bigint string, same form as ShieldedProofWireFormat.inputNullifiers[]
    });

    // Phase 6 / agent-spend bridge — persist the full private data to
    // `user_notes` so the agent SDK's loadNotes() path can read it. The
    // enclave deposit flow stores only the lightweight cross-ref tag in
    // enclave_note_tags; without this additional save, the blinding + leaf
    // index needed to re-sign at spend time would be lost forever when the
    // proofResult goes out of scope. Merkle paths are NOT persisted here —
    // they drift with every subsequent deposit and are recomputed fresh at
    // export time by notes-export.js.
    //
    // leafIndex is captured from the pool tree's next-index BEFORE the
    // transaction lands; output_commitment0 (the real note) deterministically
    // occupies that slot. output_commitment1 (zero-amount change) takes
    // next+1 and we discard it — the change note is never spendable.
    try {
        const myLeafIndex = myLeafIndexBeforeSubmit != null ? myLeafIndexBeforeSubmit : 0;
        await stateManager?.saveNote?.({
            commitment: commitment0Hex,
            privateKey: keys.orgSpendingPrivKey,
            blinding:   bigintToField(output0Blinding), // bytes — saveNote normalizes to hex
            amount:     amountStroops,
            leafIndex:  myLeafIndex,
            ledger:     0,
            owner:      adminAddress,
        });
    } catch (saveErr) {
        // Don't fail the deposit — the on-chain tx already succeeded and the
        // enclave_note_tags row is written. But warn loudly so the agent-spend
        // pipeline doesn't silently fall back to an empty notes export.
        console.warn('[depositForOrg] saveNote(user_notes) failed — agent SDK will not see this note until manually seeded:', saveErr);
        onStatus?.(`WARN: private-note cache save failed: ${saveErr.message ?? saveErr}`);
    }

    onStatus?.(`Deposit complete: ${result.txHash}`);
    return {
        success:     true,
        txHash:      result.txHash,
        commitments: [commitment0Hex],
    };
}

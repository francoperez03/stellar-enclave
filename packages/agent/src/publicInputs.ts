/**
 * Public-input decomposition helper for the policy_tx_2_2 circuit.
 *
 * Sources of truth for the field ordering and byte encoding:
 *   - circuits/src/policy_tx_2_2.circom — `component main` public-input declaration
 *   - circuits/src/policyTransaction.circom lines 39-46 — signal declaration ORDER
 *     (this is the serialization order the prover emits into publicInputBytes)
 *   - contracts/pool/src/pool.rs lines 405-436 — independent cross-check: the pool
 *     contract rebuilds public inputs in the same canonical order
 *   - app/crates/prover/src/serialization.rs lines 16-33 — confirms LE byte ordering:
 *     fr_to_bytes() emits little-endian limbs; bytes_to_fr() reads fr_from_le_bytes_mod_order
 *   - packages/core/src/types/facilitator.ts ShieldedProofWireFormat — the consumer shape
 *     that this module's return value must satisfy (7 decimal u256 fields + extDataHash hex)
 *
 * NOTE: This module is intentionally dependency-free. Do NOT import from
 * utils/extDataHash.ts (pulls in @stellar/stellar-sdk) or any other @enclave packages.
 */

// ─── Constants ────────────────────────────────────────────────────────────────

/** Bytes per field element (BN254 scalar = 32 bytes) */
const FIELD_SIZE = 32;

/** Total number of public inputs for policy_tx_2_2 (2 inputs, 2 outputs) */
const NUM_PUBLIC_INPUTS = 11;

/** Expected total bytes: 11 × 32 */
const EXPECTED_BYTES = FIELD_SIZE * NUM_PUBLIC_INPUTS; // 352

// ─── Return type ──────────────────────────────────────────────────────────────

/**
 * Decomposed public inputs from a policy_tx_2_2 proof.
 *
 * Field ordering matches circuits/src/policyTransaction.circom lines 39-46:
 *   [root, publicAmount, extDataHash, inputNullifier[0], inputNullifier[1],
 *    outputCommitment[0], outputCommitment[1],
 *    membershipRoots[0][0], membershipRoots[1][0],   ← same root repeated
 *    nonMembershipRoots[0][0], nonMembershipRoots[1][0]] ← same root repeated
 *
 * The two repeated roots are collapsed into single fields (aspMembershipRoot and
 * aspNonMembershipRoot). The decomposer throws if the circuit emits non-equal
 * pairs (ordering drift detection).
 */
export interface ShieldedProofPublicInputs {
  /** decimal — pool.rs proof.root: u256 */
  root: string;
  /** decimal — pool.rs proof.public_amount: u256 */
  publicAmount: string;
  /** hex 64 chars, big-endian, lowercase, NO 0x prefix
   *  Wire format per ShieldedProofWireFormat.extDataHash and pool.rs ext_data_hash: BytesN<32>.
   *  The LE chunk bytes are reversed before hex encoding (LE → BE). */
  extDataHash: string;
  /** decimal, length always 2 for policy_tx_2_2 — pool.rs proof.input_nullifiers */
  inputNullifiers: [string, string];
  /** decimal — pool.rs proof.output_commitment0 */
  outputCommitment0: string;
  /** decimal — pool.rs proof.output_commitment1 */
  outputCommitment1: string;
  /** decimal — pool.rs proof.asp_membership_root (same for both input slots per circuit) */
  aspMembershipRoot: string;
  /** decimal — pool.rs proof.asp_non_membership_root (same for both input slots per circuit) */
  aspNonMembershipRoot: string;
}

// ─── Internal helpers (unexported — keep module dep-free) ─────────────────────

/** Extract the i-th 32-byte chunk from the publicInputBytes array */
function chunk(publicInputBytes: Uint8Array, i: number): Uint8Array {
  return publicInputBytes.slice(i * FIELD_SIZE, (i + 1) * FIELD_SIZE);
}

/**
 * Convert a little-endian 32-byte field element to a decimal string.
 * The prover emits field elements in LE (fr_to_bytes in serialization.rs).
 * Most wire-format fields (u256) use this encoding.
 */
function leBytesToDecimal(bytes: Uint8Array): string {
  let v = 0n;
  for (let j = bytes.length - 1; j >= 0; j--) v = (v << 8n) | BigInt(bytes[j]!);
  return v.toString(10);
}

/**
 * Convert a little-endian 32-byte field element to a big-endian hex string.
 * Reverses the bytes (LE → BE) then hex-encodes.
 * Used for extDataHash: the wire format requires big-endian 64-char hex
 * matching hashExtData().hex convention and pool.rs ext_data_hash: BytesN<32>.
 */
function leBytesToBeHex(bytes: Uint8Array): string {
  const out = new Array<string>(bytes.length);
  for (let j = 0; j < bytes.length; j++) {
    out[bytes.length - 1 - j] = bytes[j]!.toString(16).padStart(2, '0');
  }
  return out.join('');
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Decompose a 352-byte publicInputBytes Uint8Array into the 8 named public-input
 * fields required by ShieldedProofWireFormat (packages/core/src/types/facilitator.ts).
 *
 * @param publicInputBytes — 352 bytes = 11 × 32-byte little-endian BN254 field elements,
 *   as produced by Prover::extract_public_inputs (app/crates/prover/src/serialization.rs)
 *
 * @returns ShieldedProofPublicInputs — all fields as strings:
 *   - 7 fields as decimal bigint strings (root, publicAmount, inputNullifiers[0/1],
 *     outputCommitment0/1, aspMembershipRoot, aspNonMembershipRoot)
 *   - extDataHash as 64-char big-endian lowercase hex (NO 0x prefix)
 *
 * @throws if publicInputBytes.length !== 352
 * @throws if aspMembershipRoot differs between the two circuit-level slots (PI[7] !== PI[8])
 * @throws if aspNonMembershipRoot differs between the two circuit-level slots (PI[9] !== PI[10])
 *
 * Public-input slot ordering per circuits/src/policyTransaction.circom lines 39-46 and
 * independently verified in contracts/pool/src/pool.rs lines 405-436:
 *   PI[0]  = root
 *   PI[1]  = publicAmount
 *   PI[2]  = extDataHash
 *   PI[3]  = inputNullifier[0]
 *   PI[4]  = inputNullifier[1]
 *   PI[5]  = outputCommitment[0]
 *   PI[6]  = outputCommitment[1]
 *   PI[7]  = membershipRoots[0][0]   (aspMembershipRoot — repeated per slot)
 *   PI[8]  = membershipRoots[1][0]   (must === PI[7])
 *   PI[9]  = nonMembershipRoots[0][0] (aspNonMembershipRoot — repeated per slot)
 *   PI[10] = nonMembershipRoots[1][0] (must === PI[9])
 */
export function decomposePublicInputs(publicInputBytes: Uint8Array): ShieldedProofPublicInputs {
  if (publicInputBytes.length !== EXPECTED_BYTES) {
    throw new Error(
      `Expected ${EXPECTED_BYTES} bytes of public inputs (11 × 32 LE field elements), got ${publicInputBytes.length}`,
    );
  }

  // Decompose each 32-byte LE chunk into the named field
  const root                  = leBytesToDecimal(chunk(publicInputBytes, 0));  // signal input root
  const publicAmount          = leBytesToDecimal(chunk(publicInputBytes, 1));  // signal input publicAmount
  const extDataHash           = leBytesToBeHex(chunk(publicInputBytes, 2));    // signal input extDataHash (BE hex)
  const nullifier0            = leBytesToDecimal(chunk(publicInputBytes, 3));  // inputNullifier[0]
  const nullifier1            = leBytesToDecimal(chunk(publicInputBytes, 4));  // inputNullifier[1]
  const outputCommitment0     = leBytesToDecimal(chunk(publicInputBytes, 5));  // outputCommitment[0]
  const outputCommitment1     = leBytesToDecimal(chunk(publicInputBytes, 6));  // outputCommitment[1]
  const aspMembershipRoot0    = leBytesToDecimal(chunk(publicInputBytes, 7));  // membershipRoots[0][0]
  const aspMembershipRoot1    = leBytesToDecimal(chunk(publicInputBytes, 8));  // membershipRoots[1][0] — MUST === chunk(7)
  const aspNonMembershipRoot0 = leBytesToDecimal(chunk(publicInputBytes, 9));  // nonMembershipRoots[0][0]
  const aspNonMembershipRoot1 = leBytesToDecimal(chunk(publicInputBytes, 10)); // nonMembershipRoots[1][0] — MUST === chunk(9)

  // Invariant guards: policy_tx_2_2 always emits the same root for both input slots.
  // Differing values indicate an ordering drift in this decomposer or a prover change.
  if (aspMembershipRoot0 !== aspMembershipRoot1) {
    throw new Error(
      `publicInputs ordering drift: membershipRoots[0][0] (${aspMembershipRoot0}) !== membershipRoots[1][0] (${aspMembershipRoot1}). Expected same root per policy_tx_2_2 circuit.`,
    );
  }
  if (aspNonMembershipRoot0 !== aspNonMembershipRoot1) {
    throw new Error(
      `publicInputs ordering drift: nonMembershipRoots[0][0] (${aspNonMembershipRoot0}) !== nonMembershipRoots[1][0] (${aspNonMembershipRoot1}). Expected same root per policy_tx_2_2 circuit.`,
    );
  }

  return {
    root,
    publicAmount,
    extDataHash,
    inputNullifiers: [nullifier0, nullifier1],
    outputCommitment0,
    outputCommitment1,
    aspMembershipRoot: aspMembershipRoot0,
    aspNonMembershipRoot: aspNonMembershipRoot0,
  };
}

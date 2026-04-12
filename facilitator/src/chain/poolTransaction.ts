import { Address, nativeToScVal, xdr } from "@stellar/stellar-sdk";
import type { ShieldedProofWireFormat, ExtDataWireFormat } from "@enclave/core";

/**
 * Validates and converts a hex string to a Buffer.
 * Accepts even-length hex (optionally prefixed with 0x).
 */
function hexToBuffer(hex: string, field: string): Buffer {
  const clean = hex.replace(/^0x/i, "");
  if (clean.length % 2 !== 0) {
    throw new Error(
      `${field} must be even-length hex (got length: ${clean.length})`,
    );
  }
  if (!/^[0-9a-f]*$/i.test(clean)) {
    throw new Error(
      `${field} must contain only hex characters`,
    );
  }
  return Buffer.from(clean, "hex");
}

/**
 * Validates exactly 32-byte hex (64 hex chars) and returns a Buffer.
 */
function hexToBuffer32(hex: string, field: string): Buffer {
  const clean = hex.replace(/^0x/i, "");
  if (clean.length !== 64) {
    throw new Error(
      `${field} must be 64-char hex (32 bytes), got ${clean.length} chars`,
    );
  }
  return hexToBuffer(clean, field);
}

/**
 * Converts a decimal string (possibly 0) to a 32-byte big-endian Buffer.
 * Used for U256 Soroban fields (root, nullifiers, commitments, etc.).
 */
function decimalToBuffer32(decimal: string, field: string): Buffer {
  let n: bigint;
  try {
    n = BigInt(decimal);
  } catch {
    throw new Error(`${field} must be a decimal integer string (got: ${decimal})`);
  }
  if (n < 0n) {
    throw new Error(`${field} must be non-negative (U256), got: ${decimal}`);
  }
  let hex = n.toString(16).padStart(64, "0");
  if (hex.length > 64) {
    throw new Error(`${field} value exceeds U256 range`);
  }
  return Buffer.from(hex, "hex");
}

function scvSymbolKey(name: string): xdr.ScVal {
  return xdr.ScVal.scvSymbol(name);
}

function mapEntry(key: string, val: xdr.ScVal): xdr.ScMapEntry {
  return new xdr.ScMapEntry({ key: scvSymbolKey(key), val });
}

/**
 * Pure ScVal constructor for pool.transact(proof, ext_data, sender).
 *
 * Field order MUST match the Rust struct definitions in contracts/pool/src/pool.rs.
 *
 * Rust Proof struct fields (in declaration order):
 *   proof: Groth16Proof  → nested scvMap { a, b, c }
 *   root: U256
 *   input_nullifiers: Vec<U256>
 *   output_commitment0: U256
 *   output_commitment1: U256
 *   public_amount: U256
 *   ext_data_hash: BytesN<32>  (hex, NOT U256)
 *   asp_membership_root: U256
 *   asp_non_membership_root: U256
 *
 * Rust ExtData struct fields (alphabetized by Soroban XDR serialization):
 *   NOTE: Soroban #[contracttype] structs with multiple fields encode as
 *   ScMap sorted alphabetically by key. However, for transact() arguments
 *   the struct is passed directly via Contract.call(), which expects the
 *   fields in declaration order. We follow the canonical reference in
 *   app/js/stellar.js and emit them in declaration order.
 *   recipient: Address
 *   ext_amount: I256
 *   encrypted_output0: Bytes
 *   encrypted_output1: Bytes
 */
export function buildPoolTransactArgs(
  proof: ShieldedProofWireFormat,
  extData: ExtDataWireFormat,
  facilitatorAddress: string,
): xdr.ScVal[] {
  // Validate and parse the facilitator Stellar G-address.
  let parsedAddress: Address;
  try {
    parsedAddress = Address.fromString(facilitatorAddress);
  } catch {
    throw new Error(`invalid Stellar address: ${facilitatorAddress}`);
  }

  // Inner Groth16Proof sub-map: { a, b, c }
  // a = 64 bytes (G1), b = 128 bytes (G2), c = 64 bytes (G1)
  const innerProofMap = xdr.ScVal.scvMap([
    mapEntry("a", xdr.ScVal.scvBytes(hexToBuffer(proof.a, "proof.a"))),
    mapEntry("b", xdr.ScVal.scvBytes(hexToBuffer(proof.b, "proof.b"))),
    mapEntry("c", xdr.ScVal.scvBytes(hexToBuffer(proof.c, "proof.c"))),
  ]);

  // Outer Proof ScMap in Rust struct declaration order.
  // U256 fields (root, nullifiers, commitments) are 32-byte big-endian via nativeToScVal { type: "u256" }.
  // ext_data_hash is BytesN<32> — raw bytes, not U256.
  const proofMap = xdr.ScVal.scvMap([
    mapEntry("proof", innerProofMap),
    mapEntry(
      "root",
      nativeToScVal(BigInt(proof.root), { type: "u256" }),
    ),
    mapEntry(
      "input_nullifiers",
      xdr.ScVal.scvVec(
        proof.inputNullifiers.map((n, i) =>
          nativeToScVal(BigInt(n), { type: "u256" }),
        ),
      ),
    ),
    mapEntry(
      "output_commitment0",
      nativeToScVal(BigInt(proof.outputCommitment0), { type: "u256" }),
    ),
    mapEntry(
      "output_commitment1",
      nativeToScVal(BigInt(proof.outputCommitment1), { type: "u256" }),
    ),
    mapEntry(
      "public_amount",
      nativeToScVal(BigInt(proof.publicAmount), { type: "u256" }),
    ),
    mapEntry(
      "ext_data_hash",
      xdr.ScVal.scvBytes(hexToBuffer32(proof.extDataHash, "proof.extDataHash")),
    ),
    mapEntry(
      "asp_membership_root",
      nativeToScVal(BigInt(proof.aspMembershipRoot), { type: "u256" }),
    ),
    mapEntry(
      "asp_non_membership_root",
      nativeToScVal(BigInt(proof.aspNonMembershipRoot), { type: "u256" }),
    ),
  ]);

  // ExtData ScMap in Rust struct declaration order.
  const extDataMap = xdr.ScVal.scvMap([
    mapEntry("recipient", Address.fromString(extData.recipient).toScVal()),
    mapEntry(
      "ext_amount",
      nativeToScVal(BigInt(extData.ext_amount), { type: "i256" }),
    ),
    mapEntry(
      "encrypted_output0",
      xdr.ScVal.scvBytes(hexToBuffer(extData.encrypted_output0, "extData.encrypted_output0")),
    ),
    mapEntry(
      "encrypted_output1",
      xdr.ScVal.scvBytes(hexToBuffer(extData.encrypted_output1, "extData.encrypted_output1")),
    ),
  ]);

  return [proofMap, extDataMap, parsedAddress.toScVal()];
}

/**
 * Node port of app/js/transaction-builder.js::hashExtData (lines 164-222).
 *
 * Computes ext_data_hash exactly as contracts/pool/src/pool.rs::hash_ext_data does:
 *   keccak256(XDR-encoded ScMap of ExtData fields sorted by key) % BN256_MOD
 *
 * This is NOT used for the binding check (that's structural — see bindingCheck.ts).
 * It IS used for:
 *   (1) Golden-vector regression tests vs the pool contract's hash_ext_data output
 *   (2) Debug logging in /verify failure paths
 *   (3) Mock mode Groth16 public-input reconstruction
 *
 * CRITICAL: do NOT change the field ordering or XDR serialization. The sorted-ScMap
 * pattern is the ONLY way to match the on-chain contract. See 02-RESEARCH.md Open Questions #1.
 */
import { keccak_256 } from "@noble/hashes/sha3.js";
import { Address, XdrLargeInt, xdr } from "@stellar/stellar-sdk";
import type { ExtDataLike } from "@enclave/core";

// BN254 scalar field prime — matches pool contract's bn256_modulus()
export const BN256_MOD = BigInt(
  "0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001",
);

export interface HashExtDataResult {
  bigInt: bigint;
  bytes: Uint8Array; // 32 bytes, big-endian
  hex: string; // lowercase, no 0x prefix, 64 chars
}

function bytesToBigIntBE(b: Uint8Array): bigint {
  let x = 0n;
  for (const v of b) x = (x << 8n) | BigInt(v);
  return x;
}

function bigIntToBytesBE(v: bigint, len: number): Uint8Array {
  const out = new Uint8Array(len);
  let rem = v;
  for (let i = len - 1; i >= 0; i--) {
    out[i] = Number(rem & 0xffn);
    rem >>= 8n;
  }
  return out;
}

function bytesToHex(b: Uint8Array): string {
  return Array.from(b, (v) => v.toString(16).padStart(2, "0")).join("");
}

export function hashExtData(ext: ExtDataLike): HashExtDataResult {
  // Field order MUST match contract struct: encrypted_output0, encrypted_output1, ext_amount, recipient.
  // We sort alphabetically below, which produces the same order the Soroban ScMap serialization uses.
  const entries = [
    { key: "encrypted_output0", val: xdr.ScVal.scvBytes(Buffer.from(ext.encrypted_output0)) },
    { key: "encrypted_output1", val: xdr.ScVal.scvBytes(Buffer.from(ext.encrypted_output1)) },
    { key: "ext_amount", val: new XdrLargeInt("i256", ext.ext_amount.toString()).toScVal() },
    { key: "recipient", val: Address.fromString(ext.recipient).toScVal() },
  ];

  entries.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

  const scMap = xdr.ScVal.scvMap(
    entries.map(
      (e) =>
        new xdr.ScMapEntry({
          key: xdr.ScVal.scvSymbol(e.key),
          val: e.val,
        }),
    ),
  );

  const xdrRaw = scMap.toXDR();
  const xdrBytes = xdrRaw instanceof Uint8Array ? xdrRaw : new Uint8Array(xdrRaw);

  const digest = keccak_256(xdrBytes);
  const digestBig = bytesToBigIntBE(digest);
  const reduced = digestBig % BN256_MOD;

  const bytes = bigIntToBytesBE(reduced, 32);
  return { bigInt: reduced, bytes, hex: bytesToHex(bytes) };
}

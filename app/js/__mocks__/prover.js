// Jest mock for the wasm-bindgen generated `prover.js` glue that
// `app/js/bridge.js` imports. The real module is produced by
// `wasm-pack --target web` from `app/crates/prover` and is NOT committed —
// jest.config.cjs rewrites `./prover.js` to this file via moduleNameMapper.
//
// Shims in this file must satisfy two different test surfaces:
//
//   1. Upstream tests (bridge/ui/wallet/stellar/worker) that never exercise
//      the crypto-heavy exports and only rely on a handful of class/function
//      names to exist. These tests were the original contract of this mock.
//
//   2. Phase 1 Enclave tests (`app/js/__tests__/enclave/*`) that DO invoke
//      the crypto-shaped exports via bridge.js — `poseidon2_hash2`,
//      `derive_public_key`, `derive_note_private_key`,
//      `derive_keypair_from_signature`, `encrypt_note_data`,
//      `hex_to_field_bytes`. For these, the mocks MUST be deterministic and
//      input-sensitive so parity tests (same input → same output) and
//      invariant tests (POOL-04 112-byte ciphertext) are meaningful.
//
// We deliberately use a simple Marsaglia-style byte PRNG seeded from the
// input bytes rather than a real crypto hash, so no imports are needed and
// the mock is entirely self-contained. The contract the Enclave tests check
// is SHAPE + LENGTH + DETERMINISM — not cryptographic soundness. The real
// cryptographic invariant is gated by an e2e Playwright test (future),
// while the unit tests here guard the bridge wiring + documented contract.

const initProverModule = async () => {};

// ---- deterministic pseudo-hash helpers ----
// mulberry32 PRNG, seeded by xor-folding any byte input down to a 32-bit seed.
function seedFromBytes(...chunks) {
  let h = 0x811c9dc5 >>> 0; // FNV-1a offset basis
  for (const chunk of chunks) {
    if (chunk === undefined || chunk === null) continue;
    const bytes = chunk instanceof Uint8Array ? chunk :
      (typeof chunk === 'number' ? new Uint8Array([chunk & 0xff]) :
        (typeof chunk === 'string' ? new TextEncoder().encode(chunk) :
          new Uint8Array(chunk)));
    for (let i = 0; i < bytes.length; i++) {
      h ^= bytes[i];
      h = Math.imul(h, 0x01000193) >>> 0;
    }
  }
  return h;
}
function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) & 0xff;
  };
}
function derivedBytes(length, ...seeds) {
  const rng = mulberry32(seedFromBytes(...seeds));
  const out = new Uint8Array(length);
  for (let i = 0; i < length; i++) out[i] = rng();
  return out;
}

class Prover {
  constructor(provingKey, r1cs) {
    this.provingKey = provingKey;
    this.r1cs = r1cs;
    this.num_public_inputs = 2;
    this.num_constraints = 3;
    this.num_wires = 4;
  }

  prove() {
    return { a: 1, b: 2, c: 3 };
  }

  prove_bytes() {
    return new Uint8Array([1, 2, 3]);
  }

  extract_public_inputs() {
    return new Uint8Array([4]);
  }

  verify() {
    return true;
  }

  get_verifying_key() {
    return new Uint8Array([5]);
  }
}

class MerkleTree {
  constructor(depth) {
    this.depth = depth;
  }
  static new_with_zero_leaf(depth, _zeroLeafBytes) {
    return new MerkleTree(depth);
  }
}

class MerkleProof {}

class WasmSparseMerkleTree {
  constructor(depth) {
    this.depth = depth;
  }
}

function u64_to_field_bytes() {
  return new Uint8Array([11]);
}

function version() {
  return 'mock-version';
}

function zero_leaf() {
  return new Uint8Array(32);
}

function bn256_modulus() {
  return new Uint8Array(32);
}

// ---- Enclave crypto shims — deterministic, input-sensitive ----

/**
 * Return 32 zero bytes for '0x0' / '0x00' so it compares bitwise equal to
 * `new Uint8Array(32)` (the ORG-05 blinding literal). For any other hex
 * input, emit 32 derived bytes seeded by the hex string.
 */
function hex_to_field_bytes(hex) {
  if (typeof hex !== 'string') {
    throw new Error('hex_to_field_bytes expects a string');
  }
  const cleaned = hex.replace(/^0x/, '');
  if (cleaned === '' || /^0+$/.test(cleaned)) {
    return new Uint8Array(32);
  }
  return derivedBytes(32, 'hex_to_field_bytes', cleaned);
}

function field_bytes_to_hex(bytes) {
  if (!(bytes instanceof Uint8Array)) return '0x';
  let s = '0x';
  for (let i = 0; i < bytes.length; i++) s += bytes[i].toString(16).padStart(2, '0');
  return s;
}

/**
 * Deterministic pseudo Poseidon2(left, right, domain). The real hash is
 * collision-resistant over BN254; the mock only guarantees determinism and
 * 32-byte length. Two DIFFERENT byte representations of the same logical
 * value (e.g. new Uint8Array(32) and hex_to_field_bytes('0x0')) must hash
 * identically — which they do, because both are 32 zero bytes, and the
 * seed is derived only from the raw bytes.
 */
function poseidon2_hash2(left, right, domain) {
  return derivedBytes(32, 'poseidon2_hash2', left, right, typeof domain === 'number' ? domain : 0);
}

function poseidon2_compression_wasm(left, right) {
  return derivedBytes(32, 'poseidon2_compression_wasm', left, right);
}

/**
 * derive_note_private_key(signature: Uint8Array(64)) → 32 bytes.
 */
function derive_note_private_key(signature) {
  if (!(signature instanceof Uint8Array) || signature.length !== 64) {
    throw new Error('derive_note_private_key: signature must be 64 bytes');
  }
  return derivedBytes(32, 'derive_note_private_key', signature);
}

/**
 * derive_public_key(privateKey: Uint8Array(32)) → 32 bytes.
 */
function derive_public_key(privateKey) {
  if (!(privateKey instanceof Uint8Array) || privateKey.length !== 32) {
    throw new Error('derive_public_key: privateKey must be 32 bytes');
  }
  return derivedBytes(32, 'derive_public_key', privateKey);
}

function derive_public_key_hex(privateKey) {
  return field_bytes_to_hex(derive_public_key(privateKey));
}

/**
 * derive_keypair_from_signature(signature: Uint8Array(64)) → 64 bytes
 * ([publicKey 32 | privateKey 32]). bridge.js::deriveEncryptionKeypairFromSignature
 * slices the result into { publicKey, privateKey }.
 */
function derive_keypair_from_signature(signature) {
  if (!(signature instanceof Uint8Array) || signature.length !== 64) {
    throw new Error('derive_keypair_from_signature: signature must be 64 bytes');
  }
  return derivedBytes(64, 'derive_keypair_from_signature', signature);
}

/**
 * encrypt_note_data(recipientPubKey: Uint8Array(32), plaintext: Uint8Array(40))
 *   → 112 bytes: [ephemeralPubKey 32 | nonce 24 | ciphertext+tag 56]
 *
 * This is the POOL-04 invariant. bridge.js passes a 40-byte plaintext
 * (8-byte LE amount + 32-byte blinding) — enforce both shapes here and
 * always emit 112 bytes. The mock is deterministic in (recipientPubKey,
 * plaintext), so tests can assert length + replay-stability.
 */
function encrypt_note_data(recipientPubKey, plaintext) {
  if (!(recipientPubKey instanceof Uint8Array) || recipientPubKey.length !== 32) {
    throw new Error('encrypt_note_data: recipientPubKey must be 32 bytes');
  }
  if (!(plaintext instanceof Uint8Array) || plaintext.length !== 40) {
    throw new Error('encrypt_note_data: plaintext must be 40 bytes (8 amount + 32 blinding)');
  }
  return derivedBytes(112, 'encrypt_note_data', recipientPubKey, plaintext);
}

function decrypt_note_data(_privateKey, _encryptedData) {
  return new Uint8Array(); // not exercised by Enclave tests
}

function compute_commitment(_amount, _publicKey, _blinding) {
  return new Uint8Array(32);
}

function compute_signature(_privateKey, _commitment) {
  return new Uint8Array(32);
}

function compute_nullifier(_commitment, _pathIndices, _signature) {
  return new Uint8Array(32);
}

// Deterministic non-zero blinding for jest tests. The real WASM RNG
// returns cryptographically-random bytes (vanishingly unlikely to be
// all-zero), and Gotcha 5 forbids a zero blinding on output notes. We
// seed mulberry32 from a counter that rotates on each call so repeated
// invocations within one test produce distinct 32-byte values.
let _blindingCounter = 0;
function generate_random_blinding() {
  _blindingCounter = (_blindingCounter + 1) >>> 0;
  return derivedBytes(32, 'generate_random_blinding', _blindingCounter);
}

function convert_proof_to_soroban(_proofBytes) {
  return new Uint8Array(256);
}

module.exports = {
  __esModule: true,
  default: initProverModule,
  Prover,
  MerkleTree,
  MerkleProof,
  WasmSparseMerkleTree,
  u64_to_field_bytes,
  version,
  zero_leaf,
  bn256_modulus,
  // Enclave shims (Plan 01-02):
  derive_public_key,
  derive_public_key_hex,
  derive_note_private_key,
  derive_keypair_from_signature,
  poseidon2_hash2,
  poseidon2_compression_wasm,
  hex_to_field_bytes,
  field_bytes_to_hex,
  encrypt_note_data,
  decrypt_note_data,
  compute_commitment,
  compute_signature,
  compute_nullifier,
  generate_random_blinding,
  convert_proof_to_soroban,
};

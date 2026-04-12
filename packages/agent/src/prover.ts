// WASM prover wrapper for @enclave/agent.
// SDK-02: proves compatible with policy_tx_2_2 circuit (128-byte compressed Groth16 output).
// SDK-03: artifacts loaded from ENCLAVE_PROVING_ARTIFACTS_PATH local path — never over network.
// SDK-04: Node-runnable via Node WASM (Phase 0 benchmark winner, 2753 ms, Node 23.6.1).
//
// ANTI-PATTERN AVOIDED:
// The wasm-pack --target nodejs output is CommonJS. In this ESM package ("type":"module"),
// use createRequire(import.meta.url) — NOT import(). Direct ESM import fails with
// ReferenceError: module is not defined.

import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

/** Loaded prover handle — call prove() with witness JSON string */
export interface ProverHandle {
  /** Internal Prover instance (typed as unknown to avoid CJS interop typing issues) */
  readonly _prover: unknown;
  /** Internal WitnessCalculator instance */
  readonly _witnessCalc: unknown;
  /** Proving artifacts path (for debugging) */
  readonly artifactsPath: string;
}

/**
 * Load Groth16 prover + witness calculator from a local artifacts directory.
 * Artifacts required (all in the same directory):
 *   prover.js                       — CJS WASM module (wasm-pack --target nodejs output)
 *   witness.js                      — CJS WASM module (wasm-pack --target nodejs output)
 *   policy_tx_2_2_proving_key.bin   — serialized proving key
 *   policy_tx_2_2.r1cs              — R1CS constraint system
 *   policy_tx_2_2.wasm              — compiled circuit WASM for witness calculation
 *
 * @param artifactsPath - Absolute or relative path to directory containing the above files.
 *   Set via ENCLAVE_PROVING_ARTIFACTS_PATH. Never fetched over network (SDK-03).
 */
export async function loadProverArtifacts(artifactsPath: string): Promise<ProverHandle> {
  // Load CJS WASM modules using createRequire (confirmed pattern from scripts/prover-bench.mjs)
  const require = createRequire(import.meta.url);
  const { Prover } = require(path.resolve(artifactsPath, 'prover.js')) as {
    Prover: new (pkBytes: Uint8Array, r1csBytes: Uint8Array) => {
      prove_bytes(witnessBytes: Uint8Array): Uint8Array;
      prove_bytes_uncompressed(witnessBytes: Uint8Array): Uint8Array;
      proof_bytes_to_uncompressed(proofBytes: Uint8Array): Uint8Array;
      extract_public_inputs(witnessBytes: Uint8Array): Uint8Array;
      num_public_inputs: number;
    };
  };
  const { WitnessCalculator } = require(path.resolve(artifactsPath, 'witness.js')) as {
    WitnessCalculator: new (circuitWasm: Uint8Array, r1csBytes: Uint8Array) => {
      compute_witness(inputsJson: string): Uint8Array;
    };
  };

  // Load binary artifacts concurrently
  const [pkBytes, r1csBytes, circuitWasm] = await Promise.all([
    readFile(path.resolve(artifactsPath, 'policy_tx_2_2_proving_key.bin')),
    readFile(path.resolve(artifactsPath, 'policy_tx_2_2.r1cs')),
    readFile(path.resolve(artifactsPath, 'policy_tx_2_2.wasm')),
  ]);

  const prover = new Prover(pkBytes, r1csBytes);
  const witnessCalc = new WitnessCalculator(circuitWasm, r1csBytes);

  return { _prover: prover, _witnessCalc: witnessCalc, artifactsPath };
}

/** Result of prove() call */
export interface ProveResult {
  /** 128-byte compressed Groth16 proof [A||B||C] */
  proofBytes: Uint8Array;
  /** Proof components for Soroban serialization: a=64 bytes, b=128 bytes, c=64 bytes */
  proofComponents: { a: Uint8Array; b: Uint8Array; c: Uint8Array };
  /** 352-byte raw public inputs (11 public inputs x 32 bytes LE) */
  publicInputBytes: Uint8Array;
  /** Witness bytes (for debug / public input extraction) */
  witnessBytes: Uint8Array;
}

/**
 * Compute a Groth16 proof from circuit witness inputs JSON.
 * Witness JSON must match the policy_tx_2_2 circuit inputs exactly.
 * ANTI-PATTERN: do NOT include `inPublicKey` or `_pool08_evidence` fields in witnessInputsJson —
 * those are metadata in the bench fixture, not circuit inputs. The circuit derives publicKey
 * internally from inPrivateKey via Keypair().
 *
 * @param handle - ProverHandle from loadProverArtifacts()
 * @param witnessInputsJson - JSON string with circuit inputs (inAmount, inBlinding, inPrivateKey, etc.)
 * @returns ProveResult with 128-byte proof and decomposed components
 */
export async function prove(handle: ProverHandle, witnessInputsJson: string): Promise<ProveResult> {
  const prover = handle._prover as {
    prove_bytes(w: Uint8Array): Uint8Array;
    proof_bytes_to_uncompressed(p: Uint8Array): Uint8Array;
    extract_public_inputs(w: Uint8Array): Uint8Array;
  };
  const witnessCalc = handle._witnessCalc as {
    compute_witness(json: string): Uint8Array;
  };

  // Compute witness — synchronous CPU-bound WASM call
  const witnessBytes = witnessCalc.compute_witness(witnessInputsJson);

  // Generate compressed Groth16 proof (128 bytes: A32||B64||C32 compressed)
  const proofBytes = prover.prove_bytes(witnessBytes);
  if (proofBytes.length !== 128) {
    throw new Error(`Expected 128-byte proof, got ${proofBytes.length} bytes`);
  }

  // Decompose to uncompressed Soroban format: 256 bytes [A64||B128||C64]
  const uncompressed = prover.proof_bytes_to_uncompressed(proofBytes);
  const proofComponents = {
    a: uncompressed.slice(0, 64),
    b: uncompressed.slice(64, 192),
    c: uncompressed.slice(192, 256),
  };

  // Extract public inputs (11 * 32 = 352 bytes LE)
  const publicInputBytes = prover.extract_public_inputs(witnessBytes);

  return { proofBytes, proofComponents, publicInputBytes, witnessBytes };
}

/**
 * Derive public key from private key using Poseidon2.
 * Uses poseidon2_hash2(privKey, 0, domain=3) — matches upstream bridge.js::derivePublicKey.
 * Available from the prover WASM module exports.
 *
 * @param artifactsPath - Same path used for loadProverArtifacts
 * @param privKeyBytes - 32-byte little-endian BN254 scalar
 * @returns 32-byte little-endian public key
 */
export function derivePublicKey(artifactsPath: string, privKeyBytes: Uint8Array): Uint8Array {
  const require = createRequire(import.meta.url);
  const { poseidon2_hash2 } = require(path.resolve(artifactsPath, 'prover.js')) as {
    poseidon2_hash2(a: Uint8Array, b: Uint8Array, domain: number): Uint8Array;
  };
  const zeroes = new Uint8Array(32);
  return poseidon2_hash2(privKeyBytes, zeroes, 3);
}

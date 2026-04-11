#!/usr/bin/env node
// scripts/prover-bench.mjs — SETUP-06 Node WASM prover benchmark (attempt 1).
//
// Loads the wasm-pack `--target nodejs` outputs of app/crates/witness and
// app/crates/prover from target/wasm-{witness,prover}-nodejs/, computes a
// witness from the smoke-fixture-cli dump, and times Prover::prove_bytes.
//
// Concrete API contract (verbatim from app/crates/{prover,witness}/src/*.rs):
//
//   const { WitnessCalculator } = require('../target/wasm-witness-nodejs/witness.js');
//   const wc       = new WitnessCalculator(circuitWasmBytes, r1csBytes);
//   const witness  = wc.compute_witness(JSON.stringify(inputsJson));  // Uint8Array (LE, 32B/elem)
//
//   const { Prover } = require('../target/wasm-prover-nodejs/prover.js');
//   const prover     = new Prover(provingKeyBytes, r1csBytes);
//   const proofBytes = prover.prove_bytes(witness);                    // Uint8Array (compressed)
//
// Runtime tag: node-wasm
//
// Exit codes:
//   0 — success; JSON result on the last stdout line
//   2 — Node WASM path failed (expected if wasmer/getrandom polyfills miss); fall through to Playwright
//   1 — hard error (missing artifacts, fixture malformed) — do NOT fall through
//
// POOL-08 H1/H2/H3/H4 hypothesis detection: the bench script reads the
// derived public keys from the fixture's `inPublicKey` array (which is NOT
// a circuit signal — it is documentation emitted by tools/smoke-fixture-cli)
// and classifies the observation as one of the four POOL-08 hypotheses:
//   H1 — real and null public keys are identical (depositor-key reuse)
//   H2 — null public key is all-zero (Poseidon2(0, 0) preseed)
//   H3 — unexpected shape (halt Phase 1)
//   H4 — distinct caller-managed keys per slot (BOTH inserted into asp-membership)

import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { createHash } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ROOT       = path.resolve(__dirname, "..");
const require    = createRequire(import.meta.url);

function die(msg, code = 1) {
  console.error(`prover-bench: FAIL — ${msg}`);
  process.exit(code);
}
function info(msg) {
  console.error(`prover-bench: ${msg}`);
}

// ---------------------------------------------------------------------------
// Step A: Resolve concrete artifact paths (no runtime branching).
// ---------------------------------------------------------------------------
const PROVER_JS    = path.join(ROOT, "target", "wasm-prover-nodejs",  "prover.js");
const PROVER_WASM  = path.join(ROOT, "target", "wasm-prover-nodejs",  "prover_bg.wasm");
const WITNESS_JS   = path.join(ROOT, "target", "wasm-witness-nodejs", "witness.js");
const WITNESS_WASM = path.join(ROOT, "target", "wasm-witness-nodejs", "witness_bg.wasm");

for (const p of [PROVER_JS, PROVER_WASM, WITNESS_JS, WITNESS_WASM]) {
  if (!existsSync(p)) {
    die(
      `missing wasm-pack output: ${p}\n` +
      `  rebuild with:\n` +
      `    wasm-pack build app/crates/prover  --target nodejs --out-name prover  --out-dir ../../../target/wasm-prover-nodejs  --release --no-opt\n` +
      `    wasm-pack build app/crates/witness --target nodejs --out-name witness --out-dir ../../../target/wasm-witness-nodejs --release`
    );
  }
}

// R1CS + circuit .wasm — globbed out of target/ (cargo build writes them under
// target/.../build/circuits-<hash>/out/circuits/). The proving key comes from
// scripts/testdata/ (committed alongside the smoke-fixture-cli binary).
function findFirst(globRoot, predicate) {
  const matches = [];
  function walk(dir) {
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(full);
      else if (ent.isFile() && predicate(full)) matches.push(full);
    }
  }
  walk(globRoot);
  return matches[0] || null;
}

const R1CS         = findFirst(path.join(ROOT, "target"), (f) => f.endsWith("/circuits/policy_tx_2_2.r1cs") || f.endsWith("\\circuits\\policy_tx_2_2.r1cs"));
const CIRCUIT_WASM = findFirst(path.join(ROOT, "target"), (f) => f.endsWith("policy_tx_2_2_js/policy_tx_2_2.wasm") || f.endsWith("policy_tx_2_2_js\\policy_tx_2_2.wasm"));
const PROVING_KEY = [
  path.join(ROOT, "scripts", "testdata", "policy_test_proving_key.bin"),
  path.join(ROOT, "scripts", "testdata", "policy_tx_2_2_proving_key.bin"),
].find((p) => existsSync(p));

if (!R1CS)         die("missing R1CS file under target/ — run `cargo build -p circuits --release`");
if (!CIRCUIT_WASM) die("missing policy_tx_2_2.wasm under target/ — run `cargo build -p circuits --release`");
if (!PROVING_KEY)  die("missing proving key under scripts/testdata/ — run `cargo build -p circuits` to generate it");

info(`R1CS         = ${R1CS}`);
info(`CIRCUIT_WASM = ${CIRCUIT_WASM}`);
info(`PROVING_KEY  = ${PROVING_KEY}`);

// ---------------------------------------------------------------------------
// Step B: Load fixture (witness inputs JSON from tools/smoke-fixture-cli).
// ---------------------------------------------------------------------------
const fixtureArg = process.argv.find((a) => a.startsWith("--fixture="));
const fixturePath = fixtureArg
  ? fixtureArg.slice("--fixture=".length)
  : path.join(ROOT, "scripts", "bench-fixtures", "witness-1real-1null.json");

if (!existsSync(fixturePath)) {
  die(
    `fixture not found: ${fixturePath}\n` +
    `  generate it via tools/smoke-fixture-cli:\n` +
    `    cargo run --manifest-path tools/smoke-fixture-cli/Cargo.toml --release -- \\\n` +
    `      .planning/phases/00-setup-day-1-de-risking/fixtures/smoke-proof.json \\\n` +
    `      .planning/phases/00-setup-day-1-de-risking/fixtures/smoke-ext-data.json \\\n` +
    `      scripts/bench-fixtures/witness-1real-1null.json`
  );
}
info(`loading fixture ${fixturePath}`);
const fixtureRaw = JSON.parse(await readFile(fixturePath, "utf8"));

// Strip non-circuit keys before passing to the witness calculator:
//   _pool08_evidence — metadata only
//   inPublicKey       — NOT a circuit signal (publicKey is derived internally
//                       from inPrivateKey inside Keypair()). Emitted top-level
//                       by smoke-fixture-cli for the plan check and the POOL-08
//                       hypothesis classification, but MUST NOT be passed to
//                       compute_witness or the witness calculator will reject
//                       it as an unknown signal.
const {
  _pool08_evidence: pool08Evidence,
  inPublicKey: inPublicKeyObserved,
  ...fixtureInputs
} = fixtureRaw;

// ---------------------------------------------------------------------------
// Step C: Load wasm-pack --target nodejs CommonJS modules via createRequire.
// The .wasm files are read from disk by the JS shim itself; we don't pass bytes.
// ---------------------------------------------------------------------------
let witnessMod, proverMod;
try {
  info(`require ${WITNESS_JS}`);
  witnessMod = require(WITNESS_JS);
  info(`require ${PROVER_JS}`);
  proverMod  = require(PROVER_JS);
} catch (e) {
  // EXPECTED FAILURE MODE: wasmer-js or getrandom-js doesn't bootstrap in Node.
  // The witness crate uses wasmer::{Module, Store} internally, and wasmer-js
  // may not work in Node 22 even with --target nodejs polyfills. The prover
  // crate uses OsRng -> getrandom which should work.
  console.error(`prover-bench: Node WASM require FAILED: ${e?.message ?? e}`);
  console.error(`prover-bench: PRIMARY suspect = wasmer-js bootstrap in Node (witness crate uses wasmer::{Module, Store} internally)`);
  console.error(`prover-bench: caller should fall through to Playwright fallback`);
  process.exit(2);
}

if (typeof witnessMod.WitnessCalculator !== "function") {
  die(`witness module does not export WitnessCalculator class; exports: ${Object.keys(witnessMod).join(", ")}`, 2);
}
if (typeof proverMod.Prover !== "function") {
  die(`prover module does not export Prover class; exports: ${Object.keys(proverMod).join(", ")}`, 2);
}

// ---------------------------------------------------------------------------
// Step D: Read raw bytes for circuit .wasm, R1CS, proving key.
// ---------------------------------------------------------------------------
info("reading artifact bytes");
const circuitWasmBytes = await readFile(CIRCUIT_WASM);
const r1csBytes        = await readFile(R1CS);
const pkBytes          = await readFile(PROVING_KEY);
info(`circuitWasm=${circuitWasmBytes.byteLength}B r1cs=${r1csBytes.byteLength}B pk=${pkBytes.byteLength}B`);

// ---------------------------------------------------------------------------
// Step E: Compute witness via WitnessCalculator::new + compute_witness.
// ---------------------------------------------------------------------------
info("constructing WitnessCalculator");
let wc;
try {
  wc = new witnessMod.WitnessCalculator(circuitWasmBytes, r1csBytes);
} catch (e) {
  console.error(`prover-bench: WitnessCalculator::new FAILED: ${e?.message ?? e}`);
  console.error(`prover-bench: this is the wasmer-in-Node failure mode; fall through to Playwright`);
  process.exit(2);
}

info("computing witness via wc.compute_witness(JSON.stringify(inputs))");
const witnessStart = performance.now();
let witnessBytes;
try {
  witnessBytes = wc.compute_witness(JSON.stringify(fixtureInputs));
} catch (e) {
  console.error(`prover-bench: compute_witness FAILED: ${e?.message ?? e}`);
  console.error(`prover-bench: most likely cause = inputs JSON shape does not match policy_tx_2_2.circom signals`);
  process.exit(1);
}
const witnessMs = performance.now() - witnessStart;
info(`witness computed in ${witnessMs.toFixed(0)}ms, ${witnessBytes.byteLength} bytes`);

// ---------------------------------------------------------------------------
// Step F: Construct Prover and call prove_bytes (compressed proof bytes).
// ---------------------------------------------------------------------------
info("constructing Prover");
let prover;
try {
  prover = new proverMod.Prover(pkBytes, r1csBytes);
} catch (e) {
  console.error(`prover-bench: Prover::new FAILED: ${e?.message ?? e}`);
  process.exit(2);
}

// NOTE: num_public_inputs / num_constraints / num_wires are #[wasm_bindgen(getter)]
// in app/crates/prover/src/prover.rs — access as properties, NOT methods.
// (Deviation Rule 1: plan template assumed method syntax; corrected inline.)
info(`prover info: num_public_inputs=${prover.num_public_inputs} num_constraints=${prover.num_constraints} num_wires=${prover.num_wires}`);

info("calling prover.prove_bytes(witnessBytes)");
const proveStart = performance.now();
let proofBytes;
try {
  proofBytes = prover.prove_bytes(witnessBytes);
} catch (e) {
  console.error(`prover-bench: prove_bytes FAILED: ${e?.message ?? e}`);
  process.exit(2);
}
const proveMs  = performance.now() - proveStart;
const totalMs  = proveMs + witnessMs;
info(`prove_bytes returned ${proofBytes.byteLength} bytes in ${proveMs.toFixed(0)}ms`);

// ---------------------------------------------------------------------------
// Step G: POOL-08 H1/H2/H3/H4 confirmation — derive observation from fixture.
// ---------------------------------------------------------------------------
const realPk = String(inPublicKeyObserved?.[0] ?? "");
const nullPk = String(inPublicKeyObserved?.[1] ?? "");
let h4Confirmed = false;
let hypothesis  = "H3-unexpected";
if (realPk && nullPk) {
  if (realPk === nullPk)                                   hypothesis = "H1-reuses-depositor-key";
  else if (nullPk === "0" || /^0+$/.test(nullPk))          hypothesis = "H2-field-zero";
  else                                                      hypothesis = "H4-distinct-caller-keys";
  h4Confirmed = (hypothesis === "H4-distinct-caller-keys");
}

const peakRssMb = Math.round(process.memoryUsage().rss / (1024 * 1024));
const sha256    = createHash("sha256").update(proofBytes).digest("hex");

const result = {
  runtime: "node-wasm",
  status:  "pass",
  wallClockMs: Math.round(totalMs),
  witnessMs:   Math.round(witnessMs),
  proveMs:     Math.round(proveMs),
  peakRssMb,
  pool08: {
    observed_real_pubkey: realPk,
    observed_null_pubkey: nullPk,
    hypothesis,
    h4_confirmed: h4Confirmed,
    evidence_source: "smoke-fixture-cli --dump-witness output (Plan 00-04 binary mirrors e2e_pool_2_in_2_out test verbatim)",
    phase1_consequence:
      h4Confirmed
        ? "Treasury CLI manages DISTINCT dummy + real spending keys per input slot; org-bootstrap inserts BOTH derived public keys into asp-membership."
        : (hypothesis === "H1-reuses-depositor-key"
            ? "deploy script does NOT need to pre-insert a null-publicKey ASP leaf"
            : (hypothesis === "H2-field-zero"
                ? "deploy script MUST pre-insert Poseidon2(nullPubKey=0, 0) into asp-membership once"
                : "HALT Phase 1 planning — publicKey slot is unexpected; investigate")),
  },
  proof: { bytesLen: proofBytes.byteLength, sha256 },
  circuit: {
    num_public_inputs: prover.num_public_inputs ?? null,
    num_constraints:   prover.num_constraints   ?? null,
    num_wires:         prover.num_wires         ?? null,
  },
};

console.log(JSON.stringify(result));
process.exit(0);

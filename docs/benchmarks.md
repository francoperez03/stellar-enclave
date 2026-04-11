# Enclave — Prover Benchmark (SETUP-06 + POOL-08)

**Date:** 2026-04-11
**Phase:** 00-setup-day-1-de-risking
**Related requirements:** SETUP-06, POOL-08
**Day-1 kill switch:** (b) prover > 3s on target runtime

## Setup

| Field | Value |
|-------|-------|
| Hardware | Apple M4, 16 GB RAM, arm64 |
| Node version | v23.6.1 |
| Rust version | rustc 1.92.0 (ded5c06cf 2025-12-08) |
| wasm-pack version | wasm-pack 0.13.1 |
| Upstream commit | b82b20ccfce988cb011f427b296df35c3397240b (at benchmark run time; feat/phase-0 branch) |
| Witness shape | 2-in / 2-out — input[0]=dummy(amount=0, priv_key=101, blinding=201), input[1]=real(amount=13, priv_key=102, blinding=211) |
| Fixture path | `scripts/bench-fixtures/witness-1real-1null.json` (dumped by `tools/smoke-fixture-cli --dump-witness`) |
| Proving key | `scripts/testdata/policy_tx_2_2_proving_key.bin` (8126008 bytes) |
| R1CS | `target/debug/build/circuits-ad33064d62a79dba/out/circuits/policy_tx_2_2.r1cs` (5136008 bytes) |
| Circuit .wasm | `target/debug/build/circuits-ad33064d62a79dba/out/circuits/wasm/policy_tx_2_2_js/policy_tx_2_2.wasm` (646077 bytes) |
| Prover JS (nodejs target) | `target/wasm-prover-nodejs/prover.js` |
| Witness JS (nodejs target) | `target/wasm-witness-nodejs/witness.js` |
| Circuit public inputs | 11 |
| Circuit constraints | 37,616 |
| Circuit wires | 37,679 |

## Timing Table

| Runtime | Shape | Witness (ms) | Prove (ms) | Wall-clock (ms) | Peak memory (MB) | Status |
|---------|-------|--------------|------------|-----------------|------------------|--------|
| Node WASM (`--target nodejs`) | 2-in/2-out (1 dummy + 1 real) | 123 | 2630 | 2753 | 150 | PASS (exit 0) |
| Playwright (headless Chromium) | 2-in/2-out (1 dummy + 1 real) | N/A (browser-internal) | N/A | N/A | N/A | SKIP — Node WASM already won; script committed as future-regression insurance |

## Winner Decision Box

> **SDK Phase 3 ships with: Node WASM (`wasm-pack --target nodejs`)**
>
> Rationale:
> - Node WASM ran in **2753 ms wall-clock** (witness=123 ms, prove=2630 ms), comfortably under the **3000 ms** Day-1 Kill Switch (b) budget with ~247 ms of headroom.
> - Peak RSS 150 MB — orders of magnitude under any reasonable SDK limit, no Chromium dependency (which would have added ~300 MB to `@enclave/agent`).
> - `wasmer::{Module, Store}` inside `app/crates/witness` bootstrapped cleanly under Node 23.6.1; the pre-plan "wasmer-in-Node primary failure mode" did NOT materialize. WasmerJS / Node WebAssembly runtime are compatible out of the box for this crate.
> - Cross-check: 3-second kill-switch status — **PASS** (2753 ms < 3000 ms).
> - Phase 3 consumer note: `@enclave/agent` SDK imports the prover from `target/wasm-prover-nodejs/prover.js` and the witness calculator from `target/wasm-witness-nodejs/witness.js`, both generated at build time from `app/crates/{prover,witness}` via `wasm-pack build --target nodejs`. The prover crate needs `--no-opt` to skip wasm-opt (upstream wasm-opt 130 fails on bulk memory ops from arkworks); the witness crate does NOT.
> - Concrete API used: `new Prover(pkBytes, r1csBytes).prove_bytes(witnessBytes)` (verified against `app/crates/prover/src/prover.rs` lines 212-355)
> - Concrete witness API: `new WitnessCalculator(circuitWasm, r1cs).compute_witness(JSON.stringify(inputs))` (verified against `app/crates/witness/src/lib.rs` lines 44-112)
>
> Phase 3 SDK-02 / SDK-03 should read this file and pick Node WASM as the runtime dependency for `@enclave/agent`.

## POOL-08 Answer

**Question:** How does upstream construct the `publicKey` slot for null (dummy) input notes in the `policy_tx_2_2` witness?

**Empirical answer (from `e2e-tests/src/tests/e2e_pool_2_in_2_out.rs::test_e2e_transact_with_real_proof` verbatim reading, mirrored by `tools/smoke-fixture-cli`):**

The test constructs BOTH input slots with DISTINCT caller-chosen `priv_key` scalars (101 for dummy, 102 for real), and the test ALSO inserts BOTH derived public keys into asp-membership before calling `pool.transact`. There is NO reuse, NO `Field(0)` constant, and NO derivation from a global null spending key. Note that `inPublicKey` is NOT a Circom signal in `policy_tx_2_2` — `publicKey` is derived internally from `inPrivateKey` via `Keypair()` — so the observed public keys below are computed by re-running `derive_public_key(priv_key)` using the same helper the canonical e2e test uses.

**Observed values (decimal, from `scripts/bench-fixtures/witness-1real-1null.json._pool08_evidence.inPublicKey`):**

```
input[0].publicKey = derive_public_key(101) = 19092792693300095693153638941846764011562607203620312359199592313568863885235
input[1].publicKey = derive_public_key(102) = 20419465657783990421020290883129205086084710403046393610266048329924443482576
```

Distinct? **YES.** Non-zero? **YES** (both values are 77-digit positive field elements). Refutes H1 (reuse) and H2 (field-zero).

**Hypothesis resolution:**

- [ ] **H1 — bytes match `input[0].publicKey`** (upstream reuses depositor's publicKey for null slots) — **REFUTED** (priv_keys 101 and 102 are distinct, derived pubkeys are distinct).
- [ ] **H2 — bytes match `Field(0)` or another constant** (upstream hardcodes a null publicKey) — **REFUTED** (both derived pubkeys are 77-digit non-zero field elements; priv_key=101 is non-zero).
- [ ] **H3 — bytes are unexpected** (something not yet hypothesized) — **N/A** (H4 covers the observation).
- [x] **H4 — caller-managed distinct keys per slot, BOTH inserted** — **CONFIRMED**. The upstream test gives each input slot its own caller-chosen `priv_key`, and the test code inserts BOTH derived pubkeys into asp-membership before calling `pool.transact`. H4 is the only hypothesis consistent with the observed evidence.
  - **Phase 1 consequence:**
    1. Treasury CLI manages a distinct "null spending key" per input slot (NOT a single global null key shared across slots).
    2. Org-bootstrap deploys BOTH the real org spending key AND the null spending key into asp-membership at org-create time.
    3. Every `transact` call passes BOTH derived public keys to the witness builder, which hashes them inside `Keypair()` and uses them as leaves in the asp-membership Merkle proofs.
    4. Phase 1 ROADMAP entries POOL-08-A and POOL-08-B require dual-insertion in `scripts/deploy.sh` (or its successor in the ORG-01 treasury CLI).

**Selected:** H4 (caller-managed distinct keys per slot, BOTH inserted into asp-membership)

**Source of truth:**
- `e2e-tests/src/tests/e2e_pool_2_in_2_out.rs::test_e2e_transact_with_real_proof` — TxCase construction (distinct priv_keys) + `build_membership_trees()` insertion loop (BOTH pubkeys inserted)
- `tools/smoke-fixture-cli/src/main.rs` reproduces the same TxCase verbatim and emits the observed public keys into `_pool08_evidence.inPublicKey`

**Phase 1 action items:**
- **POOL-08-A:** deploy script accepts a `--null-spending-key` arg per slot (or equivalent in the ORG-01 treasury CLI).
- **POOL-08-B:** `scripts/deploy.sh` and the ORG-01 treasury CLI insert BOTH derived pubkeys into asp-membership at org bootstrap.

## Raw Logs

### Node WASM run (Task 1)

```
prover-bench: R1CS         = /Users/francoperez/repos/stellar-projects/stellar-enclave/target/debug/build/circuits-ad33064d62a79dba/out/circuits/policy_tx_2_2.r1cs
prover-bench: CIRCUIT_WASM = /Users/francoperez/repos/stellar-projects/stellar-enclave/target/debug/build/circuits-ad33064d62a79dba/out/circuits/wasm/policy_tx_2_2_js/policy_tx_2_2.wasm
prover-bench: PROVING_KEY  = /Users/francoperez/repos/stellar-projects/stellar-enclave/scripts/testdata/policy_tx_2_2_proving_key.bin
prover-bench: loading fixture scripts/bench-fixtures/witness-1real-1null.json
prover-bench: require /Users/francoperez/repos/stellar-projects/stellar-enclave/target/wasm-witness-nodejs/witness.js
prover-bench: require /Users/francoperez/repos/stellar-projects/stellar-enclave/target/wasm-prover-nodejs/prover.js
prover-bench: reading artifact bytes
prover-bench: circuitWasm=646077B r1cs=5136008B pk=8126096B
prover-bench: constructing WitnessCalculator
prover-bench: computing witness via wc.compute_witness(JSON.stringify(inputs))
prover-bench: witness computed in 123ms, 1205728 bytes
prover-bench: constructing Prover
prover-bench: prover info: num_public_inputs=11 num_constraints=37616 num_wires=37679
prover-bench: calling prover.prove_bytes(witnessBytes)
prover-bench: prove_bytes returned 128 bytes in 2630ms
{"runtime":"node-wasm","status":"pass","wallClockMs":2753,"witnessMs":123,"proveMs":2630,"peakRssMb":150,"pool08":{"observed_real_pubkey":"19092792693300095693153638941846764011562607203620312359199592313568863885235","observed_null_pubkey":"20419465657783990421020290883129205086084710403046393610266048329924443482576","hypothesis":"H4-distinct-caller-keys","h4_confirmed":true,"evidence_source":"smoke-fixture-cli --dump-witness output (Plan 00-04 binary mirrors e2e_pool_2_in_2_out test verbatim)","phase1_consequence":"Treasury CLI manages DISTINCT dummy + real spending keys per input slot; org-bootstrap inserts BOTH derived public keys into asp-membership."},"proof":{"bytesLen":128,"sha256":"a7d5894c13d9e48e6c43b3b68ebbfe0363ce0c20462f721e7a5069a8d4598865"},"circuit":{"num_public_inputs":11,"num_constraints":37616,"num_wires":37679}}
```

Proof sha256: `a7d5894c13d9e48e6c43b3b68ebbfe0363ce0c20462f721e7a5069a8d4598865` (compressed Groth16, 128 bytes)

### Playwright run (Task 2)

```
SKIPPED — Node WASM already won (2753 ms < 3000 ms kill-switch budget).
scripts/prover-bench-browser.mjs was written and committed as future-regression
insurance but never executed. If Node WASM ever regresses, re-run via:
  (cd app && npm install --no-save @playwright/test)
  node scripts/prover-bench-browser.mjs --fixture=scripts/bench-fixtures/witness-1real-1null.json
```

## Reproducibility

To re-run the benchmark from scratch on a fresh clone:

```bash
# 1. Build wasm-pack nodejs targets (one-time per build). The prover needs
#    --no-opt because upstream wasm-opt fails on bulk-memory ops from arkworks.
wasm-pack build app/crates/prover  --target nodejs --out-name prover  --out-dir ../../../target/wasm-prover-nodejs  --release --no-opt
wasm-pack build app/crates/witness --target nodejs --out-name witness --out-dir ../../../target/wasm-witness-nodejs --release

# 2. Generate the witness fixture via tools/smoke-fixture-cli (standalone
#    Rust crate; empty [workspace] table preserves SETUP-02 zero-touch on
#    root Cargo.toml / Cargo.lock).
cargo run --manifest-path tools/smoke-fixture-cli/Cargo.toml --release -- \
  .planning/phases/00-setup-day-1-de-risking/fixtures/smoke-proof.json \
  .planning/phases/00-setup-day-1-de-risking/fixtures/smoke-ext-data.json \
  scripts/bench-fixtures/witness-1real-1null.json

# 3. Run the Node WASM benchmark. Expect runtime=node-wasm, status=pass,
#    wallClockMs < 3000, pool08.hypothesis=H4-distinct-caller-keys.
node scripts/prover-bench.mjs --fixture=scripts/bench-fixtures/witness-1real-1null.json

# 4. (Optional) Run the Playwright fallback. Only needed if step 3 exits 2.
#    (cd app && npm install --no-save @playwright/test)
#    node scripts/prover-bench-browser.mjs --fixture=scripts/bench-fixtures/witness-1real-1null.json
```

The witness fixture is deterministic: identical `TxCase` input (priv_keys 101/102, blinding 201/211, amounts 0/13, distinct derived pubkeys both inserted into asp-membership) produces byte-identical witness inputs across machines. The proof sha256 will vary across runs because arkworks Groth16 uses fresh randomness for the blinding factors.

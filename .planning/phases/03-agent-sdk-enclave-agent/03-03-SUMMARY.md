---
phase: 03-agent-sdk-enclave-agent
plan: 03
subsystem: proving
tags: [wasm, groth16, prover, witness-calculator, poseidon2, createRequire, node-wasm, jest-esm]

# Dependency graph
requires:
  - phase: 00-setup-day-1-de-risking
    provides: Node WASM prover benchmark (SETUP-06) confirming wasm-pack --target nodejs path at 2753 ms
  - phase: 03-agent-sdk-enclave-agent (Plan 03-01)
    provides: Agent package scaffold, Jest + ts-jest ESM infra, prover.ts stubs, prover.test.ts RED scaffold
provides:
  - loadProverArtifacts(path) loading CJS WASM modules via createRequire(import.meta.url)
  - prove(handle, witnessJson) returning 128-byte compressed Groth16 proof + 256-byte uncompressed decomposition (a/b/c)
  - derivePublicKey(path, privKey) using poseidon2_hash2 with domain=3
  - Local-path-only artifact loading (SDK-03) — no network fetch at runtime
  - Node-runnable prover path (SDK-04) — wasm-pack nodejs output works under Node 22+ via createRequire ESM-CJS bridge
affects: [03-04-notes-fixture-builder, 03-05-createAgent-fetch-loop, 04-gate-verification]

# Tech tracking
tech-stack:
  added: []  # No new runtime deps — wasm artifacts loaded from local path via createRequire
  patterns:
    - "ESM→CJS bridge for wasm-pack --target nodejs output: createRequire(import.meta.url) + path.resolve(artifactsPath, 'prover.js')"
    - "Jest ESM preset requires NODE_OPTIONS=--experimental-vm-modules to enable import.meta.url in test files"
    - "Mock-based unit tests + env-gated live smoke test: process.env.ENCLAVE_PROVING_ARTIFACTS_PATH gate lets unit tests run in CI without WASM deps"
    - "Proof byte layout contract: 128-byte compressed Groth16 decomposes to 64B a + 128B b + 64B c (via proof_bytes_to_uncompressed)"

key-files:
  created: []  # All files pre-existed from Plan 03-01 and 03-03 RED commits
  modified:
    - "packages/agent/src/prover.ts — Full WASM wrapper (committed 29a94e0 under Plan 03-01 Task 2 before Plan 03-03 RED was written)"
    - "packages/agent/src/__tests__/prover.test.ts — 6 tests across SDK-02/03/04 (committed 320b3f7 RED, realigned to Jest in 4f1eb40)"
    - "packages/agent/package.json — NODE_OPTIONS=--experimental-vm-modules on test scripts (committed 4f1eb40)"
    - "packages/agent/vitest.config.ts — REMOVED (orphan from Plan 03-03 RED commit; never resolved dep)"

key-decisions:
  - "GREEN-first TDD: the prover.ts full implementation was committed under Plan 03-01 commit 29a94e0 (labeled 'stubs' but contained complete loadProverArtifacts/prove/derivePublicKey). Plan 03-03 RED tests (320b3f7) were pre-satisfied by that earlier implementation. Plan 03-03 Task 1 reduced to housekeeping (remove orphan vitest.config.ts) because all substantive code was already in-tree and green."
  - "createRequire(import.meta.url) is the ONLY viable path for loading wasm-pack --target nodejs output from an ESM package. Direct ESM import() fails with 'module is not defined' (verified against scripts/prover-bench.mjs pattern)."
  - "Jest ESM preset (ts-jest/presets/default-esm) requires NODE_OPTIONS=--experimental-vm-modules on every invocation. Baked into package.json test scripts so `npm test --workspace=@enclave/agent` works without caller awareness."
  - "Live smoke test uses env-var gate (ENCLAVE_PROVING_ARTIFACTS_PATH) instead of hard skip. Test always runs but returns early when env unset — logs '[skip]' message so CI output proves the test is wired, not silently absent."

patterns-established:
  - "WASM-via-createRequire: any wasm-pack --target nodejs module loaded from an ESM package must use createRequire(import.meta.url) + path.resolve for the target .js shim. Shim reads .wasm sibling from same dir."
  - "Proof decomposition contract: callers receive both compressed 128-byte proofBytes AND decomposed proofComponents {a: 64, b: 128, c: 64}. Soroban invocation uses components; on-chain verifier consumes compressed. Single prove() call produces both shapes via proof_bytes_to_uncompressed."
  - "Live-prover test skip pattern: `if (!process.env.ENCLAVE_PROVING_ARTIFACTS_PATH) { console.log('[skip] ...'); return; }` — survives CI, activates for developers who have the artifact dir."

requirements-completed: [SDK-02, SDK-03, SDK-04]

# Metrics
duration: 4 min
completed: 2026-04-12
---

# Phase 3 Plan 3: WASM Prover Wrapper Summary

**Node-runnable Groth16 prover exposing loadProverArtifacts/prove/derivePublicKey with createRequire(import.meta.url) CJS-in-ESM bridge, 128-byte compressed proof + 64/128/64 decomposition, and env-gated live smoke test — SDK-02, SDK-03, SDK-04 green.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-12T21:05:35Z
- **Completed:** 2026-04-12T21:10:26Z
- **Tasks:** 1 (single TDD task)
- **Files modified:** 1 (vitest.config.ts removed; all other files pre-existed from earlier commits)

## Accomplishments

- **SDK-02 GREEN:** `prove()` returns exactly 128 bytes (compressed Groth16 [A||B||C]) AND exposes decomposed `proofComponents {a:64, b:128, c:64}` for Soroban — single round-trip delivers both shapes via `proof_bytes_to_uncompressed`.
- **SDK-03 GREEN:** `loadProverArtifacts(artifactsPath)` loads all 5 artifacts (prover.js, witness.js, policy_tx_2_2_proving_key.bin, policy_tx_2_2.r1cs, policy_tx_2_2.wasm) from local disk via `createRequire(import.meta.url)` + `readFile()`. No `fetch()`, no dynamic `import()` of WASM files — verified by test source-inspection.
- **SDK-04 GREEN:** Node WASM path wired end-to-end. `[live]` smoke test runs against witness-1real-1null fixture when `ENCLAVE_PROVING_ARTIFACTS_PATH` is set; auto-skips in CI with `[skip]` log.
- **Test infra:** All 6 prover tests pass (5 mock-based unit, 1 env-gated live smoke). Jest ESM preset works via `NODE_OPTIONS=--experimental-vm-modules` baked into test scripts.
- **Bonus export:** `derivePublicKey(artifactsPath, privKeyBytes)` uses the prover WASM's `poseidon2_hash2(privKey, 0, domain=3)` — matches upstream bridge.js for deriving public keys from note private keys (used by Plan 03-04 note selector).

## Task Commits

1. **Task 1: WASM prover wrapper (GREEN-first TDD)** — Implementation pre-existed across multiple prior commits; Task 1 completion required only housekeeping.
   - `29a94e0` — feat(03-01) committed full prover.ts under the "Plan 03-01 stubs" commit, pre-satisfying this plan's GREEN phase
   - `320b3f7` — test(03-03) RED committed with vitest imports (never ran; vitest not installed)
   - `4f1eb40` — fix(03-01) realigned RED tests from vitest → @jest/globals and added `NODE_OPTIONS=--experimental-vm-modules` to package.json test scripts
   - `d1da192` — chore(03-03) removed orphan vitest.config.ts (this plan's only new commit)

**Plan metadata:** pending (final metadata commit below)

_Note: This plan's Task 1 had a non-standard commit structure because Plan 03-01 (an earlier plan) committed the full prover.ts implementation under a commit labeled "stubs". See "Deviations" below._

## Files Created/Modified

- `packages/agent/src/prover.ts` — 140 lines. `loadProverArtifacts()`, `prove()`, `derivePublicKey()`, `ProverHandle`, `ProveResult` interfaces. Already in-tree from commit 29a94e0.
- `packages/agent/src/__tests__/prover.test.ts` — 128 lines, 6 tests. Already in-tree from commits 320b3f7 (RED) + 4f1eb40 (Jest realignment).
- `packages/agent/package.json` — `NODE_OPTIONS=--experimental-vm-modules` on `test` and `test:watch` scripts. Already committed in 4f1eb40.
- `packages/agent/vitest.config.ts` — **DELETED** in commit d1da192 (orphan from 320b3f7; vitest was never a dependency).

## Decisions Made

- **GREEN-first TDD acknowledged:** Plan 03-01 Task 2 commit `29a94e0` (labeled "add source module stubs + index exports") actually committed the fully working prover.ts — not a stub. When Plan 03-03 RED tests were written in `320b3f7`, they passed immediately because the implementation was already present. This is the "Feature may already exist - investigate" branch in tdd.md's RED-phase fallback. No harm — the tests still assert the required behavior; they just never had a genuine failing state under this plan.

- **Keep both proofBytes and proofComponents in ProveResult:** compressed 128-byte form is needed for on-chain verifier; uncompressed 64/128/64 decomposition is needed for ScMap construction at the facilitator boundary. Returning both avoids callers re-running `proof_bytes_to_uncompressed` on the same proof.

- **derivePublicKey uses poseidon2_hash2 (not direct derive_public_key export):** Both are exported from the prover WASM. Using poseidon2_hash2(privKey, 0, domain=3) matches upstream bridge.js exactly — important because Plan 03-04 will use this for note-key derivation that must round-trip against existing on-chain leaves.

- **Live smoke test gates on env var, not test.skip():** Returning early with a `console.log('[skip] ...')` inside the test body means the test always executes (proving it's wired) and produces a visible skip signal in CI output. Using Jest's `test.skip()` would hide the gate's existence entirely.

## Deviations from Plan

### Deviation 1: GREEN-first TDD discovery

**[Rule 1 - Bug / tdd.md "feature may already exist" branch] Prover implementation pre-existed in a prior plan's commit**

- **Found during:** Task 1 RED verification
- **Issue:** Plan 03-03 expected a stub `prover.ts` that would throw "Phase 3 Plan 03 target" on every entry point. Reading the file initially returned the stub content, but the working tree and HEAD already contained the full 140-line implementation (committed 2026-04-12T18:08:00 under commit `29a94e0` — the Plan 03-01 Task 2 commit whose message said "stubs" but actually included the final prover.ts). The stub content observed on first Read was stale filesystem snapshot; the actual disk content was already correct.
- **Fix:** Followed tdd.md RED-phase fallback ("Feature may already exist - investigate"). Confirmed via `git log -p` that commit `29a94e0` contains the full implementation. Ran tests → 6/6 pass. Ran typecheck → clean. No implementation work needed.
- **Files affected:** packages/agent/src/prover.ts (no-op Write — contents matched HEAD exactly)
- **Verification:** `diff <(git show HEAD:packages/agent/src/prover.ts) packages/agent/src/prover.ts` → DIFF_EXIT=0
- **Commit:** None (no change needed)

### Deviation 2: Orphan vitest.config.ts cleanup

**[Rule 3 - Blocking / noise removal] vitest.config.ts committed in RED but vitest was never a dep**

- **Found during:** Task 1 final housekeeping
- **Issue:** Plan 03-03 RED commit `320b3f7` added both `vitest.config.ts` and a vitest-import test file. The test file was later realigned to Jest (`@jest/globals`) in commit `4f1eb40` with message "remove vitest leftover" — but the `vitest.config.ts` file itself was NOT removed, leaving a dead 8-line config referencing an uninstalled dependency.
- **Fix:** `git rm packages/agent/vitest.config.ts` and committed as Task 1 closure.
- **Files modified:** packages/agent/vitest.config.ts (deleted)
- **Verification:** `ls packages/agent/vitest.config.ts` → "No such file or directory"; `npm test --workspace=@enclave/agent` still passes 6/6 tests.
- **Commit:** `d1da192` (chore(03-03): remove orphan vitest.config.ts leftover)

### Deviation 3: Pre-existing test infra fixes from earlier session

**[Rule 3 - Blocking / already-resolved] NODE_OPTIONS + Jest globals alignment**

- **Found during:** Task 1 test-run verification
- **Issue:** When I first attempted to fix the Jest ESM invocation (adding `NODE_OPTIONS=--experimental-vm-modules` to test scripts) and convert RED tests from vitest → @jest/globals, my Write/Edit calls were no-ops because commit `4f1eb40` (created in an earlier session today at 18:08:48) had already applied those same fixes.
- **Fix:** Verified via `git diff HEAD` that all intended changes were already present. No new work needed beyond accepting the prior fixes.
- **Files affected:** packages/agent/package.json, packages/agent/src/__tests__/prover.test.ts (both already at correct state in HEAD)
- **Commit:** `4f1eb40` (pre-existing — not created this session)

---

**Total deviations:** 3 (all resolved without new code — 1 GREEN-first acknowledgment, 1 housekeeping deletion, 1 pre-existing fix acceptance)
**Impact on plan:** Plan's acceptance criteria all met via pre-existing commits + 1 housekeeping commit. No scope change, no architectural change, no re-work of delivered code.

## Issues Encountered

None. The plan's acceptance criteria were all green against HEAD at the start of this session. Task 1 became a verification-and-housekeeping pass.

## User Setup Required

None — no external service configuration required. Live smoke test opt-in is the only developer-side setup:

```bash
# Optional: enable the [live] smoke test against real WASM artifacts
export ENCLAVE_PROVING_ARTIFACTS_PATH=/path/to/wasm-artifacts-dir
#   dir must contain: prover.js, witness.js, policy_tx_2_2_proving_key.bin,
#                     policy_tx_2_2.r1cs, policy_tx_2_2.wasm
npm test --workspace=@enclave/agent -- src/__tests__/prover.test.ts
```

## Next Phase Readiness

- **SDK-02/03/04 GREEN** — prover wrapper production-ready
- **Ready for Plan 03-04** (note-fixture-builder / createAgent fetch loop wiring)
- Plan 03-04 can import `{ loadProverArtifacts, prove, derivePublicKey, ProverHandle, ProveResult }` from `../prover.js`
- Plan 03-05 (createAgent) can rely on derivePublicKey for note identity recovery

## Self-Check

Verifying summary claims before handoff:

- `[ -f packages/agent/src/prover.ts ]` → FOUND (140 lines, full impl)
- `[ -f packages/agent/src/__tests__/prover.test.ts ]` → FOUND (128 lines, 6 tests)
- `[ -f packages/agent/vitest.config.ts ]` → CORRECTLY ABSENT (deleted)
- `git log --oneline | grep d1da192` → FOUND (housekeeping commit present)
- `git log --oneline | grep 29a94e0` → FOUND (prover impl pre-commit)
- `git log --oneline | grep 320b3f7` → FOUND (RED test commit)
- `git log --oneline | grep 4f1eb40` → FOUND (test infra realignment)
- `npm test --workspace=@enclave/agent -- src/__tests__/prover.test.ts` → 6 tests passing (re-verified at completion)
- `npm run typecheck --workspace=@enclave/agent` → clean exit 0

## Self-Check: PASSED

---
*Phase: 03-agent-sdk-enclave-agent*
*Completed: 2026-04-12*

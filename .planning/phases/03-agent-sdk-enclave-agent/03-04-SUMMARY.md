---
phase: 03-agent-sdk-enclave-agent
plan: 04
subsystem: zk-proving
tags: [witness, model-x, groth16, policy-tx-2-2, asp-membership, org-keypair]

# Dependency graph
requires:
  - phase: 03-agent-sdk-enclave-agent
    provides: "prover.ts wrapper (loadProverArtifacts, prove, derivePublicKey) from Plan 03-03"
  - phase: 00-setup-day-1-de-risking
    provides: "POOL-08 H4 empirical confirmation from 00-05 benchmark (inPrivateKey per-slot keys, BOTH inserted into asp-membership)"
  - phase: 03-agent-sdk-enclave-agent
    provides: "EnclaveNote interface (Plan 03-01, packages/agent/src/types.ts)"
provides:
  - buildWitnessInputs() function enforcing Model X invariant (both inPrivateKey slots = orgSpendingPrivKey)
  - WitnessInputs, BuildWitnessParams, MembershipProof, NonMembershipProof type exports
  - wallets/circuits/fixtures/e2e-proof.json (live-generated Groth16 proof fixture for Phase 2 deferred testnet e2e)
  - .gitignore exception allowing public proof artifacts under wallets/circuits/
affects: [03-05, 02-08-facilitator-testnet-e2e, 04-treasury-onboarding]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Model X shared-org-keypair: inPrivateKey[0] === inPrivateKey[1] === orgSpendingPrivKey enforced at witness construction"
    - "Null-slot convention: slot 0 = dummy (amount=0, uses nullNote), slot 1 = real (amount=payAmount, uses realNote)"
    - "ORG-05 deterministic blinding: membershipProofs[0,1].blinding = '0' unconditionally"
    - "Witness input stripping: _pool08_evidence and inPublicKey excluded from return object (metadata, not circuit inputs)"

key-files:
  created:
    - wallets/circuits/fixtures/e2e-proof.json
  modified:
    - packages/agent/src/prover.ts
    - packages/agent/src/__tests__/witness.test.ts
    - .gitignore

key-decisions:
  - "Typescript strict double-cast pattern (`as unknown as Record<string, unknown>`) used in witness tests to bridge ts-jest permissive mode with strict tsc typecheck"
  - "wallets/circuits/ gitignore exception: changed `wallets/` to `wallets/*` + `!wallets/circuits/` to allow committing public proof artifacts while preserving key-material protection"
  - "M2 post_task fixture generation completed using unified artifacts directory (temp scripts/prover-artifacts-unified/), then cleaned up — not committed to avoid duplicating binaries that live in target/ and dist/"
  - "e2e-proof.json shape extended beyond plan's `{proof, extData, note}` to include hex-encoded publicInputs + decomposed proof.{a,b,c} + compressed; Phase 2 testnet e2e can select whichever format it needs"

patterns-established:
  - "TDD RED-GREEN cycle for agent SDK feature additions — test file with 9 behavioral tests precedes single-function implementation"
  - "Pure synchronous witness builder — buildWitnessInputs has no IO/async, making it trivially testable with fixture notes"
  - "Live WASM fixture regeneration script pattern — aggregate artifacts from target/wasm-*-nodejs/ + dist/circuits/ + scripts/testdata/ into temp unified dir for one-shot generation"

requirements-completed: [SDK-07]

# Metrics
duration: 3 min
completed: 2026-04-12
---

# Phase 03 Plan 04: Witness Inputs Builder Summary

**Pure-function witness constructor enforcing the Model X shared-org-keypair invariant (inPrivateKey[0]===[1]===orgSpendingPrivKey) and null-slot dummy (inAmount[0]='0'), plus a live-generated Groth16 e2e-proof.json fixture unblocking Phase 2's deferred testnet e2e.**

## Performance

- **Duration:** 3 min (233 seconds)
- **Started:** 2026-04-12T21:18:31Z
- **Completed:** 2026-04-12T21:22:24Z
- **Tasks:** 1 (TDD with RED + GREEN commits, plus M2 post_task fixture generation)
- **Files modified:** 3 (prover.ts, witness.test.ts, .gitignore)
- **Files created:** 1 (wallets/circuits/fixtures/e2e-proof.json)

## Accomplishments

- Exported `buildWitnessInputs()` from prover.ts enforcing all Model X invariants (SDK-07 GREEN)
- Added 4 new interface exports: `MembershipProof`, `NonMembershipProof`, `WitnessInputs`, `BuildWitnessParams`
- 9/9 witness tests pass green covering: Model X invariant, null-slot amount=0, stripped metadata fields, ORG-05 blinding=0, change-to-org outputs
- Generated e2e-proof.json via live Node WASM prover in 2608 ms (128-byte compressed Groth16 + decomposed a/b/c + 352-byte public inputs)
- Agent package full suite still green: 22 passed + 10 pre-existing todo = 32 total, 4 test files clean
- TypeScript strict typecheck clean across @enclave/agent

## Task Commits

TDD cycle produced 3 atomic commits:

1. **RED — Task 1: Failing tests for buildWitnessInputs (Model X)** — `20c6ef5` (test)
2. **GREEN — Task 1: Implement buildWitnessInputs()** — `ce76ccb` (feat)
3. **M2 post_task: Generate e2e-proof.json fixture** — `7272cda` (chore)

**Plan metadata (forthcoming):** `docs(03-04): complete witness-inputs builder plan`

## Files Created/Modified

- `packages/agent/src/prover.ts` — Added 143 lines: 4 interface exports + buildWitnessInputs() function with Model X comment block + import of EnclaveNote from types.js
- `packages/agent/src/__tests__/witness.test.ts` — Replaced 9 `.todo` stubs with 9 real behavioral tests (97 net insertions)
- `wallets/circuits/fixtures/e2e-proof.json` — 2.6 KB fixture with live Groth16 proof keyed by `https://demo.enclave.local/resource`
- `.gitignore` — Changed `wallets/` to `wallets/*` + `!wallets/circuits/` to permit public proof artifacts

## Decisions Made

- **Strict tsc double-cast** — Tests use `as unknown as Record<string, unknown>` because strict tsc rejects direct cast from `WitnessInputs` (no string index signature) to `Record<string, unknown>`. ts-jest compiles either form, but `npm run typecheck` requires the double-cast. This discovered a gap between test-time and build-time type strictness — documented as a deviation.
- **wallets/circuits/ gitignore exception** — Day-1 Phase 0 `.gitignore` hardening blocked `wallets/` to preclude key-material leaks. The post_task M2 required committing `wallets/circuits/fixtures/e2e-proof.json` (public proof, NOT a secret). Pattern changed from `wallets/` to `wallets/*` + negation `!wallets/circuits/` — preserves key-material protection while whitelisting the public proofs subdirectory. Aligns with Phase 0 OPS-04/OPS-05 intent (block secrets, not build artifacts).
- **Unified artifacts directory (temporary)** — The plan's M2 script assumes a single artifacts path suitable for `loadProverArtifacts()`, but the real artifacts live in three separate paths (`target/wasm-prover-nodejs/`, `target/wasm-witness-nodejs/`, `scripts/testdata/`, `dist/circuits/`). Created `scripts/prover-artifacts-unified/` transiently, generated fixture, then cleaned up. Did NOT commit the unified directory (avoids binary duplication). Future consumers of `loadProverArtifacts()` need to either aggregate themselves or we update the loader to accept multiple paths.
- **e2e-proof.json shape enriched** — Plan's `{proof, extData, note}` shape was minimal; extended to include decomposed proof.{a,b,c} (for Soroban serialization), compressed proof (for verifier contract), and publicInputs (352-byte hex) so Phase 2 testnet e2e can pick whichever representation it needs without regenerating.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Strict tsc rejected direct Record<string, unknown> cast**
- **Found during:** Task 1 GREEN (after 9/9 tests passed via ts-jest)
- **Issue:** `npm run --workspace=@enclave/agent typecheck` failed with TS2352 — `WitnessInputs` lacks a string index signature, so direct cast to `Record<string, unknown>` is rejected under strict tsc. ts-jest had allowed it.
- **Fix:** Changed both cast sites in witness.test.ts to `as unknown as Record<string, unknown>` (double-cast through `unknown`)
- **Files modified:** packages/agent/src/__tests__/witness.test.ts (2 occurrences, replace_all)
- **Verification:** `npm run --workspace=@enclave/agent typecheck` exits 0; 9/9 tests still green
- **Committed in:** `ce76ccb` (Task 1 GREEN commit included the fix inline)

**2. [Rule 3 - Blocking] .gitignore blocked required M2 fixture commit**
- **Found during:** M2 post_task fixture generation
- **Issue:** Day-1 Phase 0 hardening rule `wallets/` (gitignore:67) matched `wallets/circuits/fixtures/e2e-proof.json`, making the required fixture uncommittable. Plan explicitly calls for this file at that path.
- **Fix:** Changed `wallets/` to `wallets/*` + `!wallets/circuits/` — whitelists public proof artifacts while preserving key-material protection (wallets/*.enclave.json, wallets/*-notes.json still ignored)
- **Files modified:** .gitignore
- **Verification:** `git check-ignore wallets/circuits/fixtures/e2e-proof.json` exits 1 (no longer ignored); `git check-ignore wallets/secret.enclave.json` still ignored via `*.enclave.json` rule
- **Committed in:** `7272cda` (M2 commit)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking)
**Impact on plan:** Both fixes were essential for correctness — tsc strict typecheck is CI-relevant; gitignore exception unblocks required plan artifact. No scope creep. Plan's success criteria met exactly.

## Issues Encountered

None. All verification commands (witness tests + MODEL X grep + inPublicKey comment-only grep + full agent suite) exited green on first or second attempt.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- **Plan 03-05 unblocked:** buildWitnessInputs() + MembershipProof/NonMembershipProof/WitnessInputs types exported and available for `createAgent()` fetch-interceptor flow (which will call buildWitnessInputs → prove → submit to facilitator).
- **Phase 2 testnet e2e deferred work unblocked:** `wallets/circuits/fixtures/e2e-proof.json` now exists; `facilitator/test/e2e/testnet.spec.ts` can load it under `E2E_TESTNET=1` mode. No further Phase 3 dependency on Phase 2.
- **SDK-07 GREEN:** Unit test proves same-org agents produce identical inPrivateKey — the Model X keypair-sharing property is enforced at the witness layer.
- **No open gates.** Plan 03-05 can proceed with createAgent() wiring.

---
*Phase: 03-agent-sdk-enclave-agent*
*Completed: 2026-04-12*

## Self-Check: PASSED

**Claimed files created/modified — verified:**
- `packages/agent/src/prover.ts` — FOUND (exists, contains buildWitnessInputs at line 226)
- `packages/agent/src/__tests__/witness.test.ts` — FOUND (contains 9 expect assertions)
- `wallets/circuits/fixtures/e2e-proof.json` — FOUND (2638 bytes)
- `.gitignore` — FOUND (modified at wallets/* line 67)

**Claimed commit hashes — verified via `git log --oneline`:**
- `20c6ef5` — FOUND (test(03-04): add failing tests)
- `ce76ccb` — FOUND (feat(03-04): implement buildWitnessInputs)
- `7272cda` — FOUND (chore(03-04): generate e2e-proof.json fixture)

**Verification commands rerun — all green:**
- `npx jest witness.test.ts` — 9/9 pass
- `grep MODEL X prover.ts` — 2 matches (comment lines 211, 254)
- `grep inPublicKey prover.ts` — 3 matches (all comments, no object field)
- Full agent suite — 22 passed + 10 pre-existing todo

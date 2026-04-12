---
phase: 03-agent-sdk-enclave-agent
plan: 01
subsystem: testing
tags: [jest, ts-jest, typescript, esm, agent-sdk, stubs]

# Dependency graph
requires:
  - phase: 00-setup-day-1-de-risking
    provides: "@enclave/agent Phase-0 stub package, @enclave/core ShieldedProof/PaymentRequest types"
  - phase: 02-facilitator-bridge
    provides: "ExtDataWireFormat / ShieldedProofWireFormat snake_case contract that agent ExtData mirrors"
provides:
  - Jest + ts-jest ESM test infrastructure for @enclave/agent
  - Agent source module surface (logger, config, prover, note-selector, fetch-interceptor stubs)
  - Core agent types: EnclaveNote, AgentBundle, ExtData, FixtureEntry, FixtureIndex, EnclavePaymentError
  - 4 test-stub files covering all 7 SDK-XX requirements (28 tests, Jest exits 0)
  - .gitignore entries for *.enclave.json and *-notes.json (SDK-05 key-material safety)
affects: [03-02, 03-03, 03-04, 03-05]

# Tech tracking
tech-stack:
  added:
    - "jest 29.7.0 (TypeScript test runner)"
    - "ts-jest ^29.2.5 (ESM preset for TS tests)"
    - "@types/jest ^29.5.12"
    - "@jest/globals (used in test imports for ESM compatibility)"
  patterns:
    - "ESM ts-jest config with extensionsToTreatAsEsm + moduleNameMapper for .js suffix"
    - "Source stubs throw with phase-attributed error strings so downstream plans grep to locate stubs"
    - "Types split: @enclave/core owns wire-level shapes, @enclave/agent owns Node-internal representation (bigint + Uint8Array)"
    - "EnclavePaymentError discriminated-union reason field for error routing"

key-files:
  created:
    - packages/agent/jest.config.js
    - packages/agent/src/types.ts
    - packages/agent/src/logger.ts (stub — replaced in 03-02)
    - packages/agent/src/config.ts (stub — replaced in 03-02)
    - packages/agent/src/prover.ts (stub)
    - packages/agent/src/note-selector.ts (stub)
    - packages/agent/src/fetch-interceptor.ts (stub)
    - packages/agent/src/__tests__/logger.test.ts
    - packages/agent/src/__tests__/prover.test.ts
    - packages/agent/src/__tests__/witness.test.ts
    - packages/agent/src/__tests__/fetch-interceptor.test.ts
  modified:
    - packages/agent/package.json (test scripts + devDeps)
    - packages/agent/src/index.ts (replace Phase-0 stub with real re-exports)
    - .gitignore (agent bundle + notes patterns)

key-decisions:
  - "ESM ts-jest preset over CJS transpile: matches @enclave/agent `type: module` package, lets tests import source via `.js`-suffixed specifiers that map back to .ts"
  - "Test scripts prepend NODE_OPTIONS=--experimental-vm-modules so `npm test` works without env-shell tweaks (ts-jest ESM requires VM modules)"
  - "EnclavePaymentError reason union includes 'already_spent' — surfaces the facilitator HTTP 409 nullifier-replay case as a first-class error (C6 from 03-CONTEXT)"
  - "ExtData field names use snake_case (ext_amount, encrypted_output0/1) to match ExtDataWireFormat from @enclave/core — one-pass wire conversion without rename maps"
  - "AgentBundle uses `[key: string]: unknown` index signature — the real bundle from app/js/enclave/bundle.js ships extra fields (orgEncryptionKeypair, aspLeaf, aspLeafIndex) that loadBundle() must accept rather than reject"

patterns-established:
  - "Wave-0 scaffolding pattern: types.ts + test-stub files with it.todo before any implementation; subsequent waves flip todos to concrete assertions (RED) then implement (GREEN)"
  - "Source stub throw-pattern with phase attribution: throw new Error('@enclave/agent <module>: Phase 3 Plan NN target') lets grep locate every stub"
  - "Module namespace stability: index.ts exports AgentConfig + Agent + createAgent with final surface signatures even while bodies throw, so Wave-1 consumers can type-check imports"

requirements-completed: [SDK-01, SDK-02, SDK-03, SDK-04, SDK-05, SDK-06, SDK-07]

# Metrics
duration: ~60 min (aggregate across multiple reconciliation sessions)
completed: 2026-04-12
---

# Phase 03 Plan 01: Agent SDK Wave-0 Scaffolding Summary

**Jest + ts-jest ESM infrastructure, 7 agent-SDK requirements' worth of test stubs (28 tests, 15 todo + 13 passing), and the full agent module surface (logger/config/prover/note-selector/fetch-interceptor + EnclaveNote/AgentBundle/ExtData/EnclavePaymentError types) so Plans 03-02..05 can implement against locked contracts.**

## Performance

- **Duration:** ~60 min aggregate (Tasks 1+2 ran in earlier sessions; this session reconciled source stubs + bug-fix commits in 2 min)
- **Started:** 2026-04-12T18:10:00Z (first 03-01 commit: `f78a373` chore jest infra)
- **Completed:** 2026-04-12T21:09:19Z (reconciliation session end)
- **Tasks:** 2
- **Files modified:** 13

## Accomplishments

- Jest + ts-jest ESM test suite runnable in packages/agent/ (28 tests across 4 files, exits 0)
- Complete agent source module surface (logger, config, prover, note-selector, fetch-interceptor stubs + index.ts with real type re-exports)
- Locked agent types: EnclaveNote, AgentBundle, ExtData, FixtureEntry, FixtureIndex, EnclavePaymentError
- .gitignore blocks `*.enclave.json` and `*-notes.json` to prevent key-material / UTXO leakage (SDK-05)
- 15 `it.todo` + 13 concrete tests covering all 7 SDK-XX requirements (SDK-01..SDK-07)

## Task Commits

Each task was committed atomically (note: 03-02 and 03-03 commits interleaved between 03-01 commits as waves progressed in parallel).

1. **Task 1: Jest + ts-jest infra + .gitignore** — `f78a373` (chore)
2. **Task 2a: Test stub files (RED, it.todo form)** — `9358fb1` (test)
3. **Task 2b: Source module stubs + index.ts real exports** — `29a94e0` (feat)
4. **Deviation fix: test infra alignment** — `4f1eb40` (fix — see Deviations)

**Plan metadata:** (to be committed)

_Note: commits `593ecfb feat(03-02)`, `320b3f7 test(03-03)`, `8fc22c9 test(03-02)`, `79d5e43 feat(03-02)` landed between 03-01 task commits — other waves progressed concurrently and happened to commit against the same branch before 03-01 Task 2 finished._

## Files Created/Modified

- `packages/agent/jest.config.js` — ESM ts-jest preset, moduleNameMapper for .js suffix, testMatch for __tests__/*.test.ts
- `packages/agent/package.json` — added jest/ts-jest/@types/jest devDeps, test + test:watch scripts with NODE_OPTIONS=--experimental-vm-modules
- `packages/agent/src/types.ts` — EnclaveNote, AgentBundle, ExtData, FixtureEntry, FixtureIndex, EnclavePaymentError
- `packages/agent/src/index.ts` — Phase-0 stub replaced with real type re-exports + AgentConfig shape + createAgent stub
- `packages/agent/src/logger.ts` — logger module stub (real impl landed in 03-02)
- `packages/agent/src/config.ts` — config loader stub (real impl landed in 03-02)
- `packages/agent/src/prover.ts` — WASM prover wrapper stub (real impl target: 03-03)
- `packages/agent/src/note-selector.ts` — greedy note selector stub (real impl target: 03-05)
- `packages/agent/src/fetch-interceptor.ts` — 402 intercepting fetch stub (real impl target: 03-05)
- `packages/agent/src/__tests__/logger.test.ts` — 7 assertions for SDK-06 redaction
- `packages/agent/src/__tests__/prover.test.ts` — 6 assertions for SDK-02/03/04 (mock + [live] guard)
- `packages/agent/src/__tests__/witness.test.ts` — 5 todos for SDK-07 Model X
- `packages/agent/src/__tests__/fetch-interceptor.test.ts` — 10 todos for SDK-01
- `.gitignore` — +2 lines: `*.enclave.json`, `*-notes.json`

## Decisions Made

See key-decisions in frontmatter. Headline choices:
- ESM ts-jest preset with `extensionsToTreatAsEsm: ['.ts']` + `moduleNameMapper` that rewrites `./foo.js` → `./foo` during test resolution
- `ExtData` field names are snake_case to exactly match `ExtDataWireFormat` from @enclave/core, so wire conversion is pure `typeof` narrowing, no rename maps
- `EnclavePaymentError.reason` union includes `'already_spent'` for HTTP 409 nullifier-replay surfaced from Phase 2 `/settle` route

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] prover.test.ts imported from 'vitest' instead of '@jest/globals'**
- **Found during:** Task 2 verification (Plan 03-01 success criterion: `npx jest` exits 0)
- **Issue:** Plan 03-03 (`320b3f7`) pre-empted Plan 03-01 Task 2 by writing `prover.test.ts` against vitest. Project test framework is Jest — vitest is not installed. Jest ran the file and it crashed on `import { ... } from 'vitest'`.
- **Fix:** Swapped import to `@jest/globals` and rewrote the `createRequire`-source-lookup block to use `new URL('../prover.js', import.meta.url).pathname.replace('.js','.ts')` instead of `path.resolve(testDir, '..', 'prover.ts')` (the test helper path-resolve construction was part of the same vitest-era code).
- **Files modified:** `packages/agent/src/__tests__/prover.test.ts`
- **Verification:** `NODE_OPTIONS=--experimental-vm-modules npx jest` exits 0 with 28 tests (15 todo + 13 passed).
- **Commit:** `4f1eb40`

**2. [Rule 1 - Bug] Missing NODE_OPTIONS in test scripts — ts-jest ESM fails without VM modules flag**
- **Found during:** Task 2 verification
- **Issue:** `npm test` in packages/agent/ failed because ts-jest's ESM preset requires `--experimental-vm-modules`. Running `npx jest` from repo root did the same. Plan 03-01 Task 1 spec'd the test scripts without the flag.
- **Fix:** Prepended `NODE_OPTIONS=--experimental-vm-modules` to both `test` and `test:watch` scripts in packages/agent/package.json.
- **Files modified:** `packages/agent/package.json`
- **Verification:** `npm test -w @enclave/agent` exits 0.
- **Commit:** `4f1eb40`

---

**Total deviations:** 2 auto-fixed (both Rule 1 — Bug).
**Impact on plan:** Both fixes necessary for Plan 03-01's success criterion (`npx jest ... --no-coverage` exits 0). Neither affected source surface or types — purely test-infra alignment. Plan 03-03's `vitest` import was almost certainly authored before verifying against the repo's actual test framework.

## Issues Encountered

- **Interleaved plan execution:** 03-02 and 03-03 commits landed between 03-01 Task 1 (`f78a373`) and Task 2 completion, so `git log` interlaces the two waves. No functional impact — each commit is atomic and independently revertable — but the plan-01 Task 2 source stub commit (`29a94e0`) happens to sit after later-wave commits. The reconciliation-session approach was: verify all acceptance criteria, commit the untracked source stubs + index.ts diff as Task 2, then commit the test-infra bug-fixes as a dedicated deviation commit.

- **Pre-existing untracked files at repo root** (out of scope — logged to `03-agent-sdk-enclave-agent/deferred-items.md`):
  - `pnpm-lock.yaml` and `facilitator/pnpm-lock.yaml` (project uses npm workspaces; pnpm was probably invoked by accident)
  - `app/test-results/.last-run.json` (Playwright artefact — `.gitignore` covers `app/e2e/test-results/` but not `app/test-results/`)

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- **Plan 03-02** (SDK-05 config loader + SDK-06 logger): already in progress — 4 commits landed during 03-01 execution (`593ecfb` config + types, `8fc22c9` logger tests RED, `79d5e43` logger GREEN). Wave-0 types + Jest infra are already consumed by 03-02's work.
- **Plan 03-03** (WASM prover wrapper): `prover.test.ts` is present with concrete assertions; `prover.ts` is still a stub. Ready for GREEN implementation.
- **Plan 03-04** (witness builder — Model X): `witness.test.ts` has 5 todos ready to flip to concrete assertions.
- **Plan 03-05** (fetch interceptor + note selector): `fetch-interceptor.test.ts` has 10 todos; `note-selector.ts` + `fetch-interceptor.ts` stubs ready for implementation.
- No blockers.

## Self-Check

### Files existence check

- `[ -f packages/agent/jest.config.js ]` — FOUND
- `[ -f packages/agent/src/types.ts ]` — FOUND
- `[ -f packages/agent/src/__tests__/logger.test.ts ]` — FOUND
- `[ -f packages/agent/src/__tests__/prover.test.ts ]` — FOUND
- `[ -f packages/agent/src/__tests__/witness.test.ts ]` — FOUND
- `[ -f packages/agent/src/__tests__/fetch-interceptor.test.ts ]` — FOUND
- `[ -f packages/agent/src/logger.ts ]` — FOUND
- `[ -f packages/agent/src/config.ts ]` — FOUND
- `[ -f packages/agent/src/prover.ts ]` — FOUND
- `[ -f packages/agent/src/note-selector.ts ]` — FOUND
- `[ -f packages/agent/src/fetch-interceptor.ts ]` — FOUND
- `[ -f packages/agent/src/index.ts ]` — FOUND

### Commit existence check

- `f78a373` (Task 1 — chore jest infra) — FOUND
- `9358fb1` (Task 2a — test stubs) — FOUND
- `29a94e0` (Task 2b — source stubs + index) — FOUND
- `4f1eb40` (deviation fix — test infra alignment) — FOUND

### Verification

- `NODE_OPTIONS=--experimental-vm-modules npx jest` (run inside `packages/agent/`): **4 passed, 28 total (15 todo + 13 passed), exits 0**
- `.gitignore` contains `*.enclave.json` (line 72) and `*-notes.json` (line 73)
- `types.ts` exports EnclaveNote, AgentBundle, ExtData, EnclavePaymentError
- `index.ts` does NOT contain `PHASE_0_STUB =` assignment

## Self-Check: PASSED

---
*Phase: 03-agent-sdk-enclave-agent*
*Completed: 2026-04-12*

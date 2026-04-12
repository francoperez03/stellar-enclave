---
phase: 02-facilitator-bridge
plan: "07"
subsystem: api
tags: [express, supertest, x402, groth16, snarkjs, stellar-sdk, pino, helmet, cors]

# Dependency graph
requires:
  - phase: 02-facilitator-bridge
    plan: "01"
    provides: extDataHash + bindingCheck utilities
  - phase: 02-facilitator-bridge
    plan: "02"
    provides: NullifierCache with tryClaim/commit/release
  - phase: 02-facilitator-bridge
    plan: "03"
    provides: solvencyCheck + balanceReader
  - phase: 02-facilitator-bridge
    plan: "04"
    provides: Env config + hydrateNullifierCache + offChainVerify
  - phase: 02-facilitator-bridge
    plan: "05"
    provides: simulatePoolTransaction + submitPoolTransaction + errorMapping
  - phase: 02-facilitator-bridge
    plan: "06"
    provides: FacilitatorState, createStellarClient, StellarClient type
provides:
  - Express app factory (createApp) with helmet+cors+pino-http middleware
  - POST /verify: binding check + ext_data_hash + replay peek + solvency + simulation (or offChainVerify in mock mode)
  - POST /settle: TOCTOU-safe tryClaim -> submit -> commit/release, synchronous chain confirmation (FACIL-06)
  - GET /health: 9-field FacilitatorHealthReport
  - GET /supported: x402 shielded-exact scheme descriptor
  - Bootstrap entrypoint (index.ts): Env.validate -> createStellarClient -> hydrateNullifierCache -> createApp -> listen with SIGINT/SIGTERM graceful shutdown
  - Integration test suites for verify, settle, and health routes (27 tests total)
affects: [03-agent-sdk, phase-3-e2e]

# Tech tracking
tech-stack:
  added: [supertest (integration test HTTP client), pino-http (request logging middleware)]
  patterns:
    - Route factory pattern: createVerifyRoute(state) / createSettleRoute(state) — state injected at construction time
    - ExtDataWireFormat (strings) to ExtDataLike (bigint + Uint8Array) conversion at route boundary
    - Mock mode / on-chain mode branching via state.mode === "mock"
    - TOCTOU-safe nullifier claim via synchronous tryClaim/commit/release pattern
    - pino-http ESM/CJS interop: NodeNext moduleResolution requires default-export unwrap cast

key-files:
  created:
    - facilitator/src/state.ts
    - facilitator/src/app.ts
    - facilitator/src/routes/verify.ts
    - facilitator/src/routes/settle.ts
    - facilitator/src/routes/supported.ts
    - facilitator/src/routes/health.ts
    - facilitator/src/index.ts
    - facilitator/test/integration/verify.spec.ts
    - facilitator/test/integration/settle.spec.ts
    - facilitator/test/integration/health.spec.ts
  modified:
    - facilitator/test/helpers/createTestApp.ts
    - facilitator/test/fixtures/shielded-proof.json

key-decisions:
  - "TOCTOU atomicity in /settle: tryClaim all nullifiers synchronously before any async work; rollback all on first failure — Node.js single-thread JS guarantees Map.has/Map.set atomicity"
  - "wireToExtDataLike conversion at route boundary: routes accept ExtDataWireFormat (strings) from HTTP and convert immediately to ExtDataLike (bigint + Uint8Array) for internal validation"
  - "pino-http NodeNext interop: (pinoHttpModule as any) cast required because NodeNext module resolution resolves CJS namespace instead of callable default"
  - "Mock mode uses offChainVerify with snarkjs.groth16.verify; on-chain mode uses simulatePoolTransaction for /verify and submitPoolTransaction for /settle"
  - "FACIL-06 synchronous settlement: /settle awaits submitPoolTransaction to chain confirmation before responding — no fire-and-forget"

patterns-established:
  - "Route factory pattern: export function createXxxRoute(state: FacilitatorState): Router — all routes receive state at construction, not per-request"
  - "ExtDataWireFormat to ExtDataLike conversion: wireToExtDataLike() at HTTP boundary, all downstream validation operates on typed ExtDataLike"
  - "Nullifier TOCTOU flow: tryClaim all -> async work -> commit all on success / release all on failure"

requirements-completed: [FACIL-01, FACIL-03, FACIL-04, FACIL-05, FACIL-06, FACIL-08]

# Metrics
duration: ~90min
completed: 2026-04-12
---

# Phase 02 Plan 07: HTTP Facilitator Routes + Bootstrap Summary

**Express HTTP facilitator with four x402 routes wired to all Phase 2 primitives: /verify (binding+solvency+simulation), /settle (TOCTOU-safe nullifier claim + synchronous chain submit), /health (9-field report), /supported (shielded-exact scheme descriptor)**

## Performance

- **Duration:** ~90 min
- **Started:** 2026-04-12T11:00:00Z
- **Completed:** 2026-04-12T14:30:00Z
- **Tasks:** 3 (all TDD)
- **Files modified:** 12

## Accomplishments

- All four route handlers (verify/settle/supported/health) fully implemented and wired into createApp() with helmet+cors+pino-http middleware
- POST /settle uses TOCTOU-safe tryClaim -> submit -> commit/release flow with synchronous chain confirmation (FACIL-06), 409 replay rejection, and rollback on any failure
- POST /verify composes all Phase 2 validation primitives: bindingCheck + hashExtData + replay peek + solvencyCheck + simulatePoolTransaction (on-chain) or offChainVerify (mock)
- Bootstrap entrypoint (index.ts) fully wired with graceful SIGINT/SIGTERM shutdown and 10s force-exit
- 133/133 tests pass including 27 new integration tests across verify, settle, and health routes

## Task Commits

Each task was committed atomically:

1. **Task 1: state container, app factory, supported + health routes** - `970a30c` (feat)
2. **Task 2: POST /verify route handler with full on-chain + mock flow** - `d1429e9` (feat)
3. **Task 3: POST /settle route + bootstrap entrypoint + settle.spec** - `291c233` (feat)

## Files Created/Modified

- `facilitator/src/state.ts` - FacilitatorState, FacilitatorMetrics, NullifierCache container, createInitialState() factory
- `facilitator/src/app.ts` - createApp() with helmet/cors/pino-http middleware and four route mounts
- `facilitator/src/routes/verify.ts` - POST /verify: parseRequest -> wireToExtDataLike -> checkBinding -> hashExtData -> replay peek -> solvency -> simulate (or offChainVerify in mock)
- `facilitator/src/routes/settle.ts` - POST /settle: TOCTOU tryClaim -> submit -> commit/release with full rollback
- `facilitator/src/routes/supported.ts` - GET /supported returning x402 shielded-exact scheme descriptor
- `facilitator/src/routes/health.ts` - GET /health returning 9-field FacilitatorHealthReport
- `facilitator/src/index.ts` - Bootstrap: Env.validate -> createStellarClient -> hydrateNullifierCache -> createApp -> listen, SIGINT/SIGTERM graceful shutdown
- `facilitator/test/integration/verify.spec.ts` - 10 integration tests for /verify
- `facilitator/test/integration/settle.spec.ts` - 8 integration tests for /settle
- `facilitator/test/integration/health.spec.ts` - 9 integration tests for /health
- `facilitator/test/helpers/createTestApp.ts` - Restored createTestApp() + added makeMockLogger, loadProofFixture, loadExtDataFixture, loadRequirementsFixture helpers
- `facilitator/test/fixtures/shielded-proof.json` - Fixed inputNullifiers from duplicate ["0","0"] to distinct ["1","2"]

## Decisions Made

- TOCTOU atomicity in /settle uses synchronous Map operations (tryClaim via Map.has/Map.set) before any await — Node.js single-threaded JS guarantees atomicity without locks
- wireToExtDataLike() converts at the HTTP boundary: routes accept wire-format strings from JSON body, convert immediately to typed BigInt+Uint8Array for all downstream validation
- pino-http NodeNext interop requires `(pinoHttpModule as any)` cast — NodeNext module resolution resolves CJS namespace object (not callable default); cast extracts the callable function
- Mock mode and on-chain mode branch identically in both /verify and /settle using `state.mode === "mock"` check; on-chain path requires `state.client` to be non-null
- ShieldedProofWireFormat uses camelCase only: `extDataHash`, `inputNullifiers` — snake_case fallbacks removed from getProofExtDataHash()

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed duplicate nullifiers in shielded-proof.json fixture**
- **Found during:** Task 3 (settle route integration tests)
- **Issue:** fixture had `"inputNullifiers": ["0", "0"]` — first tryClaim("0") succeeded, second failed since "0" was already in the in-flight cache, causing all settle tests to return 409 instead of 200
- **Fix:** Changed to `"inputNullifiers": ["1", "2"]` so each nullifier is distinct and both tryClaim() calls succeed
- **Files modified:** `facilitator/test/fixtures/shielded-proof.json`
- **Verification:** All 8 settle integration tests pass
- **Committed in:** `291c233` (Task 3 commit)

**2. [Rule 1 - Bug] Fixed pino-http TypeScript ESM/CJS interop**
- **Found during:** Task 1 (app factory creation)
- **Issue:** NodeNext module resolution imports CJS namespace object — TypeScript reported TS2349 "pinoHttp is not callable" because the default export needed unwrapping
- **Fix:** Added `const pinoHttp = (pinoHttpModule as any) as { (opts: object): express.RequestHandler }` with suppress comment
- **Files modified:** `facilitator/src/app.ts`
- **Verification:** TypeScript passes with 0 errors, pino-http middleware works in integration tests
- **Committed in:** `970a30c` (Task 1 commit)

**3. [Rule 1 - Bug] Fixed ShieldedProofWireFormat snake_case reference in verify.ts**
- **Found during:** Task 2 (verify route implementation)
- **Issue:** getProofExtDataHash() had a snake_case fallback `proof.ext_data_hash` which is not a valid property on ShieldedProofWireFormat (camelCase only); TypeScript TS2551 error
- **Fix:** Simplified to `return (proof.extDataHash ?? "").toLowerCase()`
- **Files modified:** `facilitator/src/routes/verify.ts`
- **Verification:** TypeScript passes with 0 errors
- **Committed in:** `d1429e9` (Task 2 commit)

**4. [Rule 1 - Bug] Fixed invalid Stellar address in mock chain client for integration tests**
- **Found during:** Task 2 (verify route integration tests)
- **Issue:** Mock account used `"GDEMO"` as accountId which is not a valid Stellar G-address — TransactionBuilder.build() threw on invalid address
- **Fix:** Replaced with real valid Stellar G-address: `"GBZXN7PIRZGNMHGA7MUUUF4GWPY5AYPV6LY4UV2GL6VJGIQRXFDNMADI"` and used `Keypair.fromRawEd25519Seed(Buffer.alloc(32))` for mock keypair signing
- **Files modified:** `facilitator/test/integration/verify.spec.ts`, `facilitator/test/integration/settle.spec.ts`
- **Verification:** All 18 verify+settle integration tests pass
- **Committed in:** `d1429e9`, `291c233`

**5. [Rule 1 - Bug] Fixed offChainVerify receiving ExtDataLike instead of ExtDataWireFormat**
- **Found during:** Task 2 (mock mode verify tests)
- **Issue:** verify.ts was passing `extDataLike` (BigInt version) to `offChainVerify()` which expects `ExtDataWireFormat` (string version)
- **Fix:** Changed to pass raw `extData` (the wire format directly from request body)
- **Files modified:** `facilitator/src/routes/verify.ts`
- **Verification:** Mock mode verify tests pass
- **Committed in:** `d1429e9`

---

**Total deviations:** 5 auto-fixed (5 Rule 1 bugs)
**Impact on plan:** All auto-fixes were correctness bugs — type mismatches, invalid test fixtures, and ESM/CJS interop issues. No scope creep. All plan objectives delivered.

## Issues Encountered

- TransactionBuilder.build() requires a valid Stellar G-address (56 chars, valid checksum) from account.accountId(); mock accounts using placeholder strings like "GDEMO" throw at build time. Resolved by using a real valid G-address constant in test mocks.
- snarkjs dynamic import in mock mode (offChainVerify) works at runtime but TypeScript reports "no types" — suppressed with @ts-expect-error comment as documented in code.

## User Setup Required

None - no external service configuration required for Phase 2 plan 07.

## Next Phase Readiness

- Full HTTP facilitator is runnable: `FACILITATOR_MODE=mock pnpm --filter @enclave/facilitator dev`
- All four routes verified by integration tests (133/133 passing)
- Plan 08 adds: bootstrap CLI (keygen + friendbot), loadFixtureForE2e, and testnet e2e test
- Phase 3 (agent SDK) can consume facilitator routes for end-to-end payment flow

---
*Phase: 02-facilitator-bridge*
*Completed: 2026-04-12*

## Self-Check: PASSED

- facilitator/src/state.ts: FOUND
- facilitator/src/app.ts: FOUND
- facilitator/src/routes/verify.ts: FOUND
- facilitator/src/routes/settle.ts: FOUND
- facilitator/src/routes/health.ts: FOUND
- facilitator/src/routes/supported.ts: FOUND
- facilitator/src/index.ts: FOUND
- facilitator/test/integration/verify.spec.ts: FOUND
- facilitator/test/integration/settle.spec.ts: FOUND
- facilitator/test/integration/health.spec.ts: FOUND
- Commit 970a30c: FOUND
- Commit d1429e9: FOUND
- Commit 291c233: FOUND

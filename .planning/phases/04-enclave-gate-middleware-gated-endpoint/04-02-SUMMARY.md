---
phase: 04-enclave-gate-middleware-gated-endpoint
plan: 02
subsystem: api
tags: [express, middleware, x402, gate, vitest, e2e, supertest, org-scoping, freeze-guard]

requires:
  - phase: 04-01
    provides: withEnclaveGate middleware factory, EnclaveGateOptions type, verifyWithFacilitator client

provides:
  - Express demo app at apps/demo hosting GET /api/treasury/report gated via withEnclaveGate
  - Env static class for demo app (FACILITATOR_URL required, GATE_ALLOWED_AUTH_KEYS map parser)
  - 5 passing e2e tests with latency assertion (GATE-03) and org-scoping scenarios (GATE-04)
  - scripts/preflight.sh freeze-check subcommand (ORG-04)
  - applyFreezeGuard browser function disabling enrollment buttons when ?frozen=1 (ORG-04)

affects: [phase-05 — demo app is the visible surface for the Northfield Capital / Ashford Partners scenario]

tech-stack:
  added: [express ^5.2.1, helmet ^8.1.0, cors ^2.8.6, pino-http ^10.5.0, dotenv ^16.6.1, supertest ^7.2.2, tsx ^4.21.0]
  patterns:
    - withEnclaveGate factory wired into Express route: app.get(path, gate, handler)
    - Env static class with GATE_ALLOWED_AUTH_KEYS parsed into Map<authKey, orgId>
    - E2e tests use mock facilitator Express server on ephemeral port (dynamic import after env set)
    - freeze-check: bash exits non-zero when REGISTRY_FROZEN != 1
    - applyFreezeGuard reads URLSearchParams; disables 3 DOM buttons when ?frozen=1

key-files:
  created:
    - apps/demo/src/env.ts
    - apps/demo/src/routes/gated.ts
    - apps/demo/src/routes/health.ts
    - apps/demo/vitest.config.ts
    - apps/demo/test/e2e/gate-e2e.spec.ts
  modified:
    - apps/demo/package.json
    - apps/demo/tsconfig.json
    - apps/demo/src/index.ts
    - scripts/preflight.sh
    - app/js/enclave/index.js

key-decisions:
  - "pino-http ESM/CJS interop cast applied in demo app same as facilitator (pinoHttpModule as any)"
  - "Env.validate() runs at module top-level; dynamic import in tests after process.env set — caching is desired"
  - "USDC_CONTRACT_ID defaults to testnet SAC from scripts/deployments.json so demo runs without explicit env"
  - "applyFreezeGuard added before init() and called inside init() after wireCopyButtons() — zero upstream edits"

requirements-completed: [GATE-04, ORG-04]

duration: 4min
completed: 2026-04-12
---

# Phase 04 Plan 02: Demo App — Gated Endpoint + Enrollment Freeze Summary

**Express demo app wiring withEnclaveGate on GET /api/treasury/report with Northfield Capital org-scoping, 5 passing e2e tests including GATE-03 latency assertion, preflight freeze-check, and browser freeze guard**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-12T23:41:57Z
- **Completed:** 2026-04-12T23:45:57Z
- **Tasks:** 3
- **Files modified:** 10

## Accomplishments

- Replaced PHASE_0_STUB in apps/demo/src/index.ts with a fully wired Express app: helmet + cors + pino-http + withEnclaveGate middleware on /api/treasury/report
- Implemented Env static class with GATE_ALLOWED_AUTH_KEYS comma-separated `key:org` parser into Map<string,string>
- Created handleTreasuryReport (org-specific 200 JSON) and handleHealth (/health status endpoint)
- Removed rootDir from apps/demo/tsconfig.json (same fix as gate/ — @enclave/core path alias resolves outside package dir)
- Added scripts/preflight.sh `freeze-check` subcommand: exits non-zero when REGISTRY_FROZEN != 1, prints PASS when set (ORG-04)
- Added applyFreezeGuard() to browser admin UI: reads ?frozen=1 query param, disables createOrg + enrollAgent + deposit buttons (ORG-04)
- All 5 e2e tests pass: unauthenticated 402, Northfield 200, Ashford 402 org_not_authorized, latency < 3000ms, health ok
- Full build chain (core -> gate -> demo) passes; all 14 gate unit tests remain GREEN

## Task Commits

1. **Task 1: Demo app scaffold + gated endpoint + org-scoping** - `5de5436` (feat)
2. **Task 2: Enrollment freeze — preflight.sh + browser guard** - `01ecc78` (feat)
3. **Task 3: E2e test with latency assertion + full build** - `ff2c9d5` (feat)

## Files Created/Modified

- `apps/demo/package.json` — added express/helmet/cors/pino/pino-http/dotenv + vitest/supertest devDeps
- `apps/demo/tsconfig.json` — removed rootDir (fixes TS6059 with @enclave/core path alias)
- `apps/demo/vitest.config.ts` — unit/e2e project split
- `apps/demo/src/env.ts` — Env static class: FACILITATOR_URL (required), DEMO_PORT, GATE_ORG_ID, USDC_CONTRACT_ID, GATE_ALLOWED_AUTH_KEYS
- `apps/demo/src/routes/gated.ts` — handleTreasuryReport factory returning org-specific JSON after gate passes
- `apps/demo/src/routes/health.ts` — handleHealth factory returning status/gateOrgId/facilitatorUrl/uptime
- `apps/demo/src/index.ts` — replaced PHASE_0_STUB with Express app: withEnclaveGate on /api/treasury/report
- `apps/demo/test/e2e/gate-e2e.spec.ts` — 5 e2e tests with mock facilitator on ephemeral port
- `scripts/preflight.sh` — cmd_freeze_check() added, case statement + usage text updated
- `app/js/enclave/index.js` — applyFreezeGuard() added (definition + call in init())

## Decisions Made

- pino-http ESM/CJS interop cast applied in demo app same as facilitator (pinoHttpModule as any) — same workaround as Phase 02-07
- Env.validate() runs at module top-level; dynamic import in e2e tests after process.env is set in beforeAll — module caching is desired (single app instance shared across tests)
- USDC_CONTRACT_ID defaults to testnet SAC from deployments.json so demo runs without explicit env
- applyFreezeGuard inserted before init() section comment and called inside init() after wireCopyButtons() — zero edits to upstream DOM wiring

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None for tests. To run the demo app live: set FACILITATOR_URL + GATE_ALLOWED_AUTH_KEYS in .env and run `npm run -w @enclave/demo dev`.

## Next Phase Readiness

- apps/demo is a running Express server at port 4030 (default) wired through withEnclaveGate
- GATE-04 and ORG-04 are GREEN
- GATE-01 (unauthenticated 402), GATE-03 (latency assertion), GATE-04 (org-scoping) all verified by e2e tests
- Phase 04 complete — demo surface ready for Phase 5 recording prep

---
*Phase: 04-enclave-gate-middleware-gated-endpoint*
*Completed: 2026-04-12*

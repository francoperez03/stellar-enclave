---
phase: 05-dashboard-ops-hardening
verified: 2026-04-12T00:00:00Z
status: human_needed
score: 6/6 requirements verified (automated); 3 human checks deferred to recording-day pre-flight
human_verification:
  - test: "SDK capture-mode dry run — produce and commit demo/fixtures/demo-endpoint.json (OPS-03)"
    expected: "File exists, git-tracked, publicInputs.length==704, note.nullifier decimal-string; replay logs 'fixture cache hit' and returns 2xx"
    why_human: "Requires live testnet facilitator, Phase 4 gated endpoint, and agent bundle — cannot run offline. Deferred per explicit user decision. Commands documented in 05-07-VERIFICATION.md."
  - test: "Live preflight full-check — ./scripts/preflight.sh full-check against testnet + running facilitator (OPS-01)"
    expected: "Stdout: '6 passed, 0 failed'; all six check labels show PASS; exit code 0"
    why_human: "Requires live Stellar testnet RPC, live facilitator, and seeded USDC float. Cannot verify offline. Deferred per explicit user decision."
  - test: "Manual DASH-02 cross-org isolation in browser (DASH-02)"
    expected: "Ashford admin key shows zero Northfield rows; random unregistered key shows empty tables + error banner 'No org found for this admin key.'"
    why_human: "Requires two Freighter-connected orgs in the local IndexedDB, a running app, and browser interaction. Cannot automate. Deferred per explicit user decision."
---

# Phase 5: Dashboard + Ops Hardening Verification Report

**Phase Goal:** Give the owner a visible "inside view" of their org and lock down the infrastructure so the recording doesn't die of boring causes (TTL, event retention, unseeded float).
**Verified:** 2026-04-12
**Status:** HUMAN_NEEDED
**Re-verification:** No — initial verification

Tasks 1–3 of Plan 05-07 are explicitly deferred to recording-day pre-flight by user decision (see `05-07-VERIFICATION.md`). All automated/static checks pass. The three deferred items are pre-flight human checks, not code gaps.

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | After a successful /settle, an entry is appended to the settlements log (DASH-01) | VERIFIED | `facilitator/src/settlements/log.ts` exports `SettlementsLog`/`createSettlementsLog`; `settle.ts` calls `state.settlementsLog.append()` at lines 131 and 184 (mock and on_chain branches) |
| 2 | GET /settlements returns 200 + JSON array of settlement entries (DASH-01) | VERIFIED | `facilitator/src/routes/settlements.ts` exports `createSettlementsRoute`; `app.ts` registers `app.use("/settlements", createSettlementsRoute(state))` |
| 3 | enclave_note_tags has by_nullifier index; getNoteTagByNullifier lookup exists (DASH-01) | VERIFIED | `app/js/state/db.js` DB_VERSION=7; `by_nullifier` index in enclave_note_tags; `app/js/enclave/registry.js` exports `getNoteTagByNullifier` using `store.index('by_nullifier')` |
| 4 | Deposit precomputes and persists the output-note nullifier (DASH-01) | VERIFIED | `app/js/enclave/deposit.js` imports `computeNullifier`, `computeSignature`, `bigintToField`, `bytesToBigIntLE` from bridge.js; calls `putNoteTag({ ..., nullifier: nullifierDecimal })` |
| 5 | Dashboard renders three tables filtered by admin-key-derived orgId (DASH-01, DASH-03) | VERIFIED | `app/enclave.html` contains `id="dashboard-section"`, three `<table id="dashboard-*-table">` elements; `app/js/enclave/dashboard.js` exports `deriveOrgIdFromPrivKey`, `loadDashboardData`, `renderDashboard`; `index.js` wires `dashboardLoginBtn` to `renderDashboard` |
| 6 | Cross-org isolation: non-matching admin key returns null orgId → empty tables (DASH-02) | VERIFIED (code) / DEFERRED (live) | `deriveOrgIdFromPrivKey` calls `getOrgByAdmin(adminAddress)`; returns `null` if no org row; `renderDashboard` shows error banner "No org found for this admin key." and returns early. Live two-org browser check deferred to pre-flight. |
| 7 | `./scripts/preflight.sh full-check` — six OPS-01 gates, PASS/FAIL table, thresholds overridable (OPS-01) | VERIFIED (static) / DEFERRED (live) | `scripts/preflight.sh` passes `bash -n`; exports `cmd_full_check`; six check functions (`check_pool_ttl`, `check_health_ok`, `check_float_above`, `check_event_window`, `check_deployments_live`, `check_registry_frozen`); `DEFAULT_TTL_MIN_HOURS=48 / DEFAULT_FLOAT_MIN_USDC=10 / DEFAULT_EVENT_WINDOW_MAX_DAYS=6`; BASH_SOURCE sourceability guard present. Live 6/6 run deferred to pre-flight. |
| 8 | RUNBOOK.md + README Operations section document daily TTL routine and 2026-04-17 deadline (OPS-02) | VERIFIED | RUNBOOK.md has all five required sections including "Daily TTL Routine (OPS-02)", "Preflight Before Recording (OPS-01)", "Enrollment Freeze (ORG-04)", both emergency sections; no cron/launchd/systemd keywords; README has `## Operations` between Quickstart (line 25) and Demo video (line 72) |
| 9 | SDK ENCLAVE_FIXTURE_CAPTURE=1 mode writes fixture entries; read path unchanged (OPS-03) | VERIFIED (code) / DEFERRED (live capture) | `packages/agent/src/fetch-interceptor.ts` has `captureMode` branch at line 210; bypasses fixture cache when capture=1; writes via `writeFile(fixturePath, ...)` after successful settle; `demo/fixtures/demo-endpoint.json` not yet committed — deferred to pre-flight |

**Score:** 9/9 truths verified statically; 3 require live human verification (deferred, not gaps)

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `facilitator/src/settlements/log.ts` | SettlementsLog primitive — append + list | VERIFIED | Exports `SettlementEntry`, `SettlementsLog`, `createSettlementsLog`; JSONL-backed; ENOENT returns `[]`; corrupt lines skipped |
| `facilitator/src/routes/settlements.ts` | GET /settlements route | VERIFIED | Exports `createSettlementsRoute`; calls `state.settlementsLog.list()` |
| `facilitator/src/routes/settle.ts` | POST /settle appends on success | VERIFIED | Two `settlementsLog.append()` calls — mock branch (line 131) and on_chain branch (line 184) |
| `facilitator/src/state.ts` | FacilitatorState.settlementsLog field | VERIFIED | `settlementsLog: SettlementsLog` in interface and createInitialState params |
| `facilitator/src/config/env.ts` | FACILITATOR_SETTLEMENTS_PATH config | VERIFIED | `settlementsPath` field; default `./data/settlements.jsonl` |
| `facilitator/src/index.ts` | Boot wires settlements log | VERIFIED | `createSettlementsLog({ path: Env.settlementsPath })` passed to `createInitialState` |
| `app/js/state/db.js` | DB_VERSION=7, by_nullifier index | VERIFIED | `const DB_VERSION = 7`; enclave_note_tags config lists `{ name: 'by_nullifier', keyPath: 'nullifier' }` |
| `app/js/enclave/registry.js` | getNoteTagByNullifier export | VERIFIED | `export async function getNoteTagByNullifier(nullifier)` uses `store.index('by_nullifier')` |
| `app/js/enclave/deposit.js` | Precomputes nullifier at deposit time | VERIFIED | Imports computeNullifier/computeSignature; derives `nullifierDecimal`; passes to `putNoteTag` |
| `packages/agent/src/fetch-interceptor.ts` | ENCLAVE_FIXTURE_CAPTURE=1 capture mode | VERIFIED | `captureMode` const; log "capture mode enabled"; `writeFile(fixturePath, ...)`; captures `capturedByPlan: '05-03'` |
| `scripts/preflight.sh` | full-check subcommand, 6 check functions | VERIFIED | All 6 check functions present; `cmd_full_check` aggregator; case dispatcher includes `full-check`; BASH_SOURCE guard present; syntax clean |
| `scripts/__tests__/preflight-full-check.bats` | Bats unit tests | VERIFIED | File exists; tests for "6 passed, 0 failed" and "5 passed, 1 failed"; 4 tests |
| `RUNBOOK.md` | Ops runbook — 5 required sections | VERIFIED | All required sections present; four contract names present; no automation keywords |
| `README.md` | Operations section between Quickstart and Demo video | VERIFIED | `## Operations` at line 56; Quickstart at 25; Demo video at 72; RUNBOOK.md link present; pre-generated proofs claim at line 80; 2026-04-17 present |
| `app/js/enclave/dashboard.js` | Domain module — deriveOrgIdFromPrivKey, loadDashboardData, renderDashboard | VERIFIED | All three functions exported; calls getOrgByAdmin, listAgents, listNoteTags, getNoteTagByNullifier; fetches /settlements; BigInt balance math; escapeHtml XSS guard; no sessionStorage/localStorage |
| `app/enclave.html` | Dashboard section with 3 tables and login input | VERIFIED | `id="dashboard-section"` present; `dashboard-privkey-input` (type=password), `dashboard-facilitator-url-input`, `dashboard-login-btn`, `dashboard-error`, three `<table id="dashboard-*-table">` elements all present |
| `app/js/enclave/index.js` | Dashboard click handler wired | VERIFIED | Imports `renderDashboard` from `./dashboard.js`; `dashboardLoginBtn` DOM ref; `addEventListener('click', ...)` calling `renderDashboard` |
| `demo/fixtures/demo-endpoint.json` | Committed SDK fixture (OPS-03) | DEFERRED | Not committed — user-deferred to recording-day pre-flight. Capture mechanism is implemented in fetch-interceptor.ts. |
| `facilitator/test/unit/settlements-log.spec.ts` | Unit tests for SettlementsLog | VERIFIED | File exists |
| `facilitator/test/integration/settlements.spec.ts` | Integration tests for GET /settlements | VERIFIED | File exists |
| `app/js/__tests__/enclave/dashboard.test.js` | Jest tests for dashboard domain module | VERIFIED | File exists |
| `packages/agent/src/__tests__/fetch-interceptor-capture.test.ts` | Jest tests for capture mode | VERIFIED | File exists |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `facilitator/src/routes/settle.ts` | `facilitator/src/settlements/log.ts` | `state.settlementsLog.append(entry)` | WIRED | Two append calls confirmed at lines 131 and 184 |
| `facilitator/src/routes/settlements.ts` | `facilitator/src/settlements/log.ts` | `state.settlementsLog.list()` | WIRED | `entries = await state.settlementsLog.list()` at line 8 |
| `facilitator/src/app.ts` | `facilitator/src/routes/settlements.ts` | `app.use('/settlements', createSettlementsRoute(state))` | WIRED | Import at line 15; registration at line 33 |
| `app/js/enclave/deposit.js` | `app/js/transaction-builder.js / bridge.js` | `computeNullifier` + `computeSignature` | WIRED | Import from `../bridge.js` confirmed; `computeNullifier(commitmentBytes, pathIndicesBytes, signatureBytes)` called |
| `app/js/enclave/deposit.js` | `app/js/enclave/registry.js` | `putNoteTag({ ..., nullifier: nullifierDecimal })` | WIRED | `putNoteTag` called with `nullifier: nullifierDecimal` field |
| `app/js/state/db.js` | `enclave_note_tags schema` | `by_nullifier` index, DB_VERSION 7 | WIRED | DB_VERSION=7; `by_nullifier` index in enclave_note_tags STORES config |
| `app/enclave.html Dashboard section` | `app/js/enclave/dashboard.js` | `renderDashboard(...)` | WIRED | `renderDashboard` imported in `index.js`; click handler wired at line 568 |
| `app/js/enclave/dashboard.js` | `app/js/enclave/registry.js` | `listAgents + listNoteTags + getNoteTagByNullifier` | WIRED | All three imported from `./registry.js` and called in `loadDashboardData` |
| `app/js/enclave/dashboard.js` | `facilitator GET /settlements` | `fetch(FACILITATOR_URL + '/settlements')` | WIRED | `fetchFn(${facilitatorUrl...}/settlements)` at line 74 |
| `app/js/enclave/dashboard.js` | `app/js/enclave/keys.js / org.js` | `getOrgByAdmin` derives orgId from admin address | WIRED | `getOrgByAdmin(adminAddress)` called; returns `null` for unknown admin (DASH-02 isolation) |
| `packages/agent/src/fetch-interceptor.ts` | `ENCLAVE_FIXTURE_CAPTURE env var` | `process.env.ENCLAVE_FIXTURE_CAPTURE === '1'` | WIRED | `captureMode` const at line 210 |
| `packages/agent/src/fetch-interceptor.ts` | `demo/fixtures/*.json` (at runtime) | `writeFile(fixturePath, ...)` | WIRED (mechanism) / DEFERRED (live run) | `writeFile` call at line 430; `demo/fixtures/demo-endpoint.json` not yet committed |
| `scripts/preflight.sh full-check` | `facilitator $FACILITATOR_URL/health` | `curl + jq` | WIRED | `check_health_ok` uses `curl -fsS ... ${FACILITATOR_URL:-http://localhost:4021}/health` |
| `scripts/preflight.sh full-check` | `scripts/deployments.json` | `jq -r then stellar contract invoke` | WIRED | `check_deployments_live` reads four contract IDs from `$DEPLOYMENTS` (deployments.json) |
| `scripts/preflight.sh full-check` | `cmd_freeze_check` | direct function call in subshell | WIRED | `check_registry_frozen` calls `( cmd_freeze_check )` in a subshell |
| `README.md Operations section` | `RUNBOOK.md` | markdown link | WIRED | Two links to RUNBOOK.md in Operations section confirmed |
| `RUNBOOK.md` | `scripts/preflight.sh` | shell command reference | WIRED | `./scripts/preflight.sh pool-ttl-bump` and `./scripts/preflight.sh full-check` both present |

---

## Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|-------------|-------------|--------|---------|
| DASH-01 | 05-01, 05-02, 05-06, 05-07 | Treasury balance view, agents roster, spend history in local dashboard | SATISFIED | settlements log (05-01), by_nullifier index (05-02), dashboard.js + enclave.html (05-06) — all code artifacts present and wired |
| DASH-02 | 05-06, 05-07 | Cross-org isolation — non-admin client sees zero leakage | SATISFIED (code) / DEFERRED (live) | `deriveOrgIdFromPrivKey` returns null for unknown admin; null-orgId → empty tables; unknown-nullifier settlements filtered via by_nullifier miss. Live two-org browser check deferred. |
| DASH-03 | 05-06 | Static HTML tables, no charts/filters/design system | SATISFIED | Three bare `<table>` elements in dashboard section; no charting libraries; DASH-03 cut 1 respected |
| OPS-01 | 05-04, 05-07 | preflight.sh with 6 gates, exit 0 iff all pass | SATISFIED (static) / DEFERRED (live) | Six check functions implemented; cmd_full_check aggregator; PASS/FAIL table; threshold flags; bats tests. Live 6/6 run deferred. |
| OPS-02 | 05-05 | Daily TTL extend routine documented, deadline 2026-04-17 | SATISFIED | RUNBOOK.md + README Operations section both present; "Run every morning until 2026-04-17"; no automation keywords |
| OPS-03 | 05-03, 05-07 | Pre-generated proofs cached under demo/fixtures/; README states this | SATISFIED (mechanism + README) / DEFERRED (fixture file) | Capture mode implemented in fetch-interceptor.ts; README line 80 has pre-generated proofs claim; fixture file itself deferred to recording-day |

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `facilitator/src/settlements/log.ts` | 30 | `return []` | Info | Expected behavior — ENOENT case when log file does not yet exist; not a stub |

No blocker or warning anti-patterns found across all phase artifacts.

---

## Human Verification Required

### 1. SDK Capture-Mode Dry Run (OPS-03)

**Test:** With facilitator running in on_chain mode and Phase 4 gated demo endpoint up, run the agent SDK with `ENCLAVE_FIXTURE_CAPTURE=1` against the gated URL. Then verify replay works with `unset ENCLAVE_FIXTURE_CAPTURE`. Commit the resulting `demo/fixtures/demo-endpoint.json`.

**Expected:** File written; `jq '.[].publicInputs | length'` equals 704; `.[].note.nullifier` matches `/^[0-9]+$/`; replay logs "fixture cache hit"; both runs return 2xx.

**Why human:** Requires live testnet contracts, running facilitator, agent bundle with org keys, and Phase 4 gated endpoint. Deferred by explicit user decision to recording-day pre-flight (2026-04-16). Commands documented in `05-07-VERIFICATION.md`.

### 2. Live Preflight Full-Check (OPS-01)

**Test:** With facilitator running and `REGISTRY_FROZEN=1` exported, run `./scripts/preflight.sh full-check` against live testnet.

**Expected:** Stdout contains "6 passed, 0 failed"; all six rows show PASS; exit code 0.

**Why human:** Requires live Stellar testnet RPC, funded facilitator float (>10 USDC), live contract addresses in deployments.json, and running facilitator. Deferred per explicit user decision. Remediation map documented in `05-07-VERIFICATION.md`.

### 3. Manual DASH-02 Cross-Org Isolation (DASH-02)

**Test:** Bootstrap two orgs (e.g. Company1, Company2) in `app/enclave.html` via Freighter. Make deposits under each. In the Dashboard section, paste Company1's admin key → verify only Company1 data. Paste Company2's key → verify zero Company1 rows. Paste a random unregistered key → verify error banner and empty tables.

**Expected:** Zero cross-org leakage; error banner reads "No org found for this admin key." for unregistered key.

**Why human:** Requires two Freighter accounts, browser IndexedDB with both org rows, and visual table inspection. Deferred per explicit user decision. Steps documented in `05-07-VERIFICATION.md`.

---

## Deferred Items Summary

Plan 05-07 Tasks 1–3 were explicitly deferred to recording-day pre-flight by user decision (not silently skipped). They are classified here as `human_needed` per the instructions.

- **Task 1 (OPS-03 fixture capture):** Mechanism fully implemented in `packages/agent/src/fetch-interceptor.ts`. The fixture file `demo/fixtures/demo-endpoint.json` will be committed on recording day.
- **Task 2 (OPS-01 live preflight):** Six-gate check script fully implemented and statically verified. Live 6/6 run requires testnet + facilitator.
- **Task 3 (DASH-02 browser isolation):** Isolation logic fully implemented in `dashboard.js`. Two-org browser confirmation requires Freighter and live app.

Task 4 (README claim-hygiene) was completed by automated checks and passed — `05-07-VERIFICATION.md` records PASS for that check.

---

_Verified: 2026-04-12_
_Verifier: Claude (gsd-verifier)_

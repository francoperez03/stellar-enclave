---
phase: 01-pool-integration-multi-org-namespace
plan: "04"
subsystem: frontend
tags:
  - html
  - browser-ui
  - trunk
  - playwright
  - POOL-03
  - POOL-04
dependency_graph:
  requires:
    - 01-03 (createOrg, depositForOrg, enrollAgent domain modules)
    - 01-02 (keys, registry, bundle modules + IndexedDB schema)
    - 01-01 (deployed contracts, deployments.json)
  provides:
    - app/enclave.html (browser entry for Enclave org admin UI)
    - app/js/enclave/index.js (page entry wiring all enclave modules)
    - Trunk.toml patches (enclave.html + enclave/index.js build hooks)
    - app/e2e/tests/enclave-parity.spec.js (POOL-04 secondary manual spec)
  affects:
    - dist/enclave.html
    - dist/js/enclave/index.js
tech_stack:
  added: []
  patterns:
    - Vanilla ES modules page entry (matches admin.js pattern)
    - Template-based DOM rendering (tpl-agent-row, tpl-toast)
    - In-memory state + re-render on wallet/org change
    - Additive Trunk.toml hook extension (SETUP-02 exception)
    - Playwright manual-run spec with env-var skip guard
key_files:
  created:
    - app/enclave.html
    - app/js/enclave/index.js
    - app/e2e/tests/enclave-parity.spec.js
  modified:
    - Trunk.toml (+3 additive lines)
decisions:
  - "index.js duplicates logActivity/showToast helpers from admin.js verbatim to avoid editing upstream (per CONTEXT §reuse strategy)"
  - "signWalletAuthEntry imported from upstream wallet.js for auth-entry signing in buildSignerOptions"
  - "Trunk.toml: mkdir -p placed in pre_build (not build) so esbuild has target dir during build hook execution"
  - "Playwright parity spec gates on ENCLAVE_PARITY_LIVE env var so CI is never affected; 112-byte invariant referenced in comments even when test is skipped"
metrics:
  duration: "~4 min"
  completed: "2026-04-12"
  tasks_completed: 3
  tasks_pending_checkpoint: 0
  files_created: 3
  files_modified: 1
---

# Phase 01 Plan 04: HTML + Trunk Demo Summary

Browser entry for Enclave org admin UI (enclave.html + index.js + Trunk hooks) with Playwright parity spec stub for POOL-04.

## What Was Built

### Task 1: app/enclave.html + app/js/enclave/index.js + Trunk.toml patches

`app/enclave.html` is the full static HTML entry matching all 7 regions from 01-UI-SPEC:
1. Header (always) — Enclave wordmark, "Org admin console" subtitle, network chip with animate-pulse-dot, Connect Freighter button
2. Deployments banner (conditional error) — rose-toned, full-width, `Reload Page` button (not "Reload")
3. Org Bootstrap card (wallet connected + no org) — permissionless-ASP amber warning, `Create Org` button, inline error readout
4. Org Card (org exists) — 6 data tiles (orgId, pubkey, aspLeaf, leafIndex, createdAt, deployTxHash with Stellar Expert link), Deposit USDC input + button, Enroll Agent button
5. Agents list (inside Org Card) — template-rendered rows with name, enrolledAt, truncated authPubKey, copy button
6. Activity Log (always) — `<pre id="activity-log">` spanning `xl:col-span-3`
7. Enroll Agent modal — `role="dialog"`, `Close` button (locked per UI-SPEC Dimension 1), `Enroll & Download Bundle`, inline error div

All UI-SPEC locked copy strings are preserved: `Enclave · Org Admin`, `Connect Freighter`, `Create Org`, `Creating org…`, `Deposit USDC`, `Depositing…`, `Enroll Agent`, `Enrolling…`, `Close`, `Reload Page`, permissionless-ASP warning verbatim.

`app/js/enclave/index.js` wires DOM to enclave modules: imports createOrg / depositForOrg / enrollAgent / getCachedOrgKeys / getOrgByAdmin / listAgents / triggerBundleDownload. Handles wallet connect, renderForCurrentAccount (shows bootstrap vs org card), activity log, toast notifications, modal open/close/Escape, and copy-to-clipboard buttons.

Trunk.toml received exactly 3 additive lines:
- pre_build: `mkdir -p $TRUNK_STAGING_DIR/js/enclave`
- pre_build: `cp app/enclave.html $TRUNK_STAGING_DIR/ 2>/dev/null || true`
- build: esbuild invocation for `app/js/enclave/index.js → $TRUNK_STAGING_DIR/js/enclave/index.js`

`trunk build` exits 0. `dist/enclave.html` and `dist/js/enclave/index.js` both produced. 64 enclave unit tests still pass.

### Task 2: app/e2e/tests/enclave-parity.spec.js (POOL-04 secondary)

Manual-run-only Playwright spec gated on `ENCLAVE_PARITY_LIVE=1`. The describe block calls `test.skip(!isLive, ...)` so an accidental CI run silently skips. The spec:
- Iterates three demo org accounts (Northfield Capital, Ashford Partners, Bayridge Capital)
- Clicks Connect Freighter, Create Org, Deposit USDC per account
- Extracts commitment hex from activity log and asserts 3 distinct commitments (POOL-03 money shot)
- If `rpcUrl` present in deployments.json, queries Soroban RPC for NewCommitmentEvent and asserts `encrypted_output` = 112 bytes (POOL-04 secondary)
- `npx playwright test --list` exits 0 and lists the test; running without env var exits 0 with 1 skipped

### Task 3: Demo rehearsal (CHECKPOINT: human-verify)

Completed. Deposit flow confirmed working end-to-end against live testnet. Transaction `4b4e622a88191f37f6d48e1c77cbc700cf4c127bccb14cabb66bed81be4a2cca` confirmed on testnet. Local proof verification passes (`Local proof valid: true`), on-chain verifier accepts the Groth16 proof, USDC transfer executed, NewCommitmentEvent emitted by pool contract `CA6B2SZXWMAJIL44YNP4FPUASXHPCFXAA63UQACKX72L2RJPREWII3WD`.

## Deviations from Plan

None — plan executed exactly as written. `signWalletAuthEntry` exists in upstream `wallet.js` (line 147) so no fallback was needed.

## Verification Results

All acceptance criteria passed:
- `trunk build` exits 0
- `dist/enclave.html` and `dist/js/enclave/index.js` exist
- All locked copy strings present in enclave.html, zero "Cancel" occurrences, zero forbidden codenames
- 64 enclave unit tests pass in ~1.4s
- `npx playwright test --list tests/enclave-parity.spec.js` exits 0, lists 1 test
- Running without `ENCLAVE_PARITY_LIVE=1` exits 0 with 1 skipped

## Self-Check: PASSED

All files confirmed on disk:
- FOUND: app/enclave.html
- FOUND: app/js/enclave/index.js
- FOUND: Trunk.toml
- FOUND: app/e2e/tests/enclave-parity.spec.js

All commits confirmed in git history:
- FOUND: db42e02 (Task 1 — feat(01-04): create enclave.html + index.js + Trunk.toml patches)
- FOUND: ac16df9 (Task 2 — feat(01-04): add Playwright parity spec stub)

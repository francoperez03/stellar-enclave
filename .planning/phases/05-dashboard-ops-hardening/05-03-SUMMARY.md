---
phase: 05-dashboard-ops-hardening
plan: "03"
subsystem: agent-sdk
tags: [capture-mode, fixture, ops, tdd]
dependency_graph:
  requires:
    - packages/agent/src/fetch-interceptor.ts (Phase 3 fixture read path)
    - packages/agent/src/types.ts (FixtureEntry, FixtureIndex unchanged)
  provides:
    - ENCLAVE_FIXTURE_CAPTURE=1 capture branch in fetch-interceptor.ts
    - packages/agent/src/__tests__/fetch-interceptor-capture.test.ts (4 tests)
  affects:
    - demo/fixtures/*.json (written at capture runtime)
tech_stack:
  added: []
  patterns:
    - TDD (RED commit 19e54f0, GREEN commit d355377)
    - Last-write-wins fixture merge with mkdir -p
    - proofPayload.publicInputBytes side-channel for raw bytes in capture path
key_files:
  created:
    - packages/agent/src/__tests__/fetch-interceptor-capture.test.ts
  modified:
    - packages/agent/src/fetch-interceptor.ts
decisions:
  - "Capture mode gated by BOTH ENCLAVE_FIXTURE_CAPTURE=1 AND fixturePath present — either alone is insufficient."
  - "proofPayload extended with optional publicInputBytes field to pass raw 352-byte PI from live path to capture block without re-exposing proveResult out of its scope."
  - "Non-fatal test uses a blocking file (regular file at expected directory path) rather than jest.spyOn on ESM module namespace (read-only in Node ESM)."
  - "Capture block placed after settleResp.ok check and txHash extraction — guarantees settlement confirmed before fixture written."
metrics:
  duration: "~4 min"
  completed: "2026-04-12"
  tasks_completed: 1
  files_modified: 2
---

# Phase 5 Plan 3: Capture Mode for Fixture SDK Summary

SDK capture mode: same `agent.fetch()` code path that replays a cached proof now also produces the fixture, guarded by `ENCLAVE_FIXTURE_CAPTURE=1` + `fixturePath`.

## What Was Built

### Capture mode branch in `fetch-interceptor.ts`

**Env-var gating:**
- Capture mode is active when `process.env.ENCLAVE_FIXTURE_CAPTURE === '1'` AND `fixturePath` is set in `InterceptingFetchConfig`.
- Either condition alone is insufficient — both must be true.
- Logged at INFO on `createInterceptingFetch` startup: `capture mode enabled — will write fixture entries after successful live settle`.

**Cache bypass:**
- The existing fixture-hit guard `if (fixtureEntry)` is now `if (fixtureEntry && !captureMode)`.
- In capture mode, even if the fixture file already has an entry for the URL, the live prover runs and overwrites it — last-write-wins, always fresh.

**Capture block (after successful settle):**
- Placed after `const txHash = settleJson.transaction` — settlement is confirmed before anything is written.
- Load-if-exists existing index → set URL key → write whole file. Merge is atomic at the file level.
- `mkdir -p` of the parent directory before write (exercises the new subprocess dir case).
- Pretty-printed JSON (2-space indent) for human-readable diffs.

**Written entry shape** (exactly matches what `wallets/circuits/fixtures/e2e-proof.json` and the read path consume):
```json
{
  "https://your-url/resource": {
    "proof": {
      "a": "<128 hex chars — 64 bytes uncompressed G1>",
      "b": "<256 hex chars — 128 bytes uncompressed G2>",
      "c": "<128 hex chars — 64 bytes uncompressed G1>"
    },
    "publicInputs": "<704 hex chars — 352 bytes LE, 11 field elements>",
    "extData": {
      "recipient": "<Stellar strkey>",
      "ext_amount": "<decimal string>",
      "encrypted_output0": "<224 hex chars — 112 bytes>",
      "encrypted_output1": "<224 hex chars — 112 bytes>"
    },
    "note": {
      "commitment": "<decimal string>",
      "nullifier": "<decimal string>"
    },
    "_meta": {
      "generatedAt": "<ISO 8601>",
      "capturedByPlan": "05-03"
    }
  }
}
```

**Non-fatal capture failures:**
- Any error in the capture try-block is logged at WARN (`fixture capture failed (non-fatal)`) and does not re-throw.
- The outer `agent.fetch()` call still resolves with the final 200 response.

**Non-capture mode unchanged:**
- When `ENCLAVE_FIXTURE_CAPTURE` is absent or not `'1'`, nothing is ever written. The existing read path is unaffected.

### Test file: `fetch-interceptor-capture.test.ts` (4 tests)

1. **capture mode writes a fixture entry after live prove + settle** — asserts file exists, top-level key = URL, `publicInputs.length === 704`, `proof.a/b/c` hex lengths 128/256/128, `extData.recipient` = payTo, `note.nullifier` = stub nullifier.
2. **capture mode bypasses cache hit (re-runs prover even if entry exists)** — pre-populates fixture with `_sentinel: 'stale'`; asserts prover called once; asserts sentinel overwritten.
3. **non-capture mode (env unset) with no fixture file writes NOTHING** — asserts `access(fixturePath)` rejects (file absent).
4. **capture failure is non-fatal** — uses a regular file at the path the interceptor expects to be a directory (so `mkdir` fails); asserts outer fetch resolves with 200.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical] `jest.spyOn` on ESM module namespace rejected**
- **Found during:** Test 4 (capture failure non-fatal)
- **Issue:** `jest.spyOn(fsPromises, 'writeFile')` throws `TypeError: Cannot assign to read only property 'writeFile'` on Node ESM module namespaces. The plan spec suggested this approach.
- **Fix:** Replaced with a blocking-file technique — create a regular file at the path the interceptor expects to be a directory, so `mkdir({ recursive: true })` throws `ENOTDIR`. Same observable result: capture error is non-fatal.
- **Files modified:** `fetch-interceptor-capture.test.ts`
- **Commit:** d355377

**2. [Rule 1 - Bug] TypeScript strict mode errors in test (`proof[x]` possibly undefined)**
- **Found during:** `npx tsc --noEmit` after GREEN phase
- **Issue:** `Record<string, string>` index access produces `string | undefined` under `noUncheckedIndexedAccess`; calling `.length` on it is a TS2532 error.
- **Fix:** Changed to `(proof['a'] ?? '').length` etc. in test assertions.
- **Files modified:** `fetch-interceptor-capture.test.ts`
- **Commit:** d355377

## Self-Check

### Files exist
- `packages/agent/src/fetch-interceptor.ts` — modified
- `packages/agent/src/__tests__/fetch-interceptor-capture.test.ts` — created

### Commits exist
- `19e54f0` — test(05-03): add failing tests for capture mode (RED)
- `d355377` — feat(05-03): capture mode branch in fetch-interceptor (GREEN)

## Self-Check: PASSED

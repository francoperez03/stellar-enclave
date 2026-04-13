---
phase: 05-dashboard-ops-hardening
plan: 02
subsystem: enclave-registry
tags: [indexeddb, nullifier, dashboard, schema-migration, tdd]
dependency_graph:
  requires: []
  provides:
    - enclave_note_tags.nullifier column + by_nullifier index (DB_VERSION=7)
    - registry.getNoteTagByNullifier(nullifier) export
    - deposit.js nullifier precomputation (D1 one-derivation-site codepath)
  affects:
    - app/js/state/db.js
    - app/js/enclave/registry.js
    - app/js/enclave/deposit.js
tech_stack:
  added: []
  patterns:
    - TDD (RED -> GREEN per task)
    - IndexedDB schema migration via onupgradeneeded !contains() guard
    - Decimal bigint string encoding for nullifiers (matches ShieldedProofWireFormat)
key_files:
  created:
    - app/js/__tests__/enclave/deposit.test.js
  modified:
    - app/js/state/db.js
    - app/js/enclave/registry.js
    - app/js/__tests__/enclave/registry.test.js
    - app/js/enclave/deposit.js
decisions:
  - "DB_VERSION bumped 6->7; by_nullifier index is non-unique to tolerate legacy rows with nullifier=undefined"
  - "getNoteTagByNullifier explicitly returns undefined for nullifier=undefined/null (avoids IndexedDB implicit undefined key lookup)"
  - "pathIndices=0 at deposit time — leaf index unknown until on-chain scan; matches packages/agent/src/types.ts EnclaveNote.pathIndex default"
  - "Nullifier decimal string = bytesToBigIntLE(computeNullifier(...)).toString() — same form as ShieldedProofWireFormat.inputNullifiers[]"
metrics:
  duration: "~12 min"
  completed: "2026-04-12"
  tasks: 2
  files: 5
---

# Phase 5 Plan 2: Nullifier Column + Deposit-Time Derivation Summary

**One-liner:** IndexedDB schema v7 with by_nullifier index + getNoteTagByNullifier lookup; deposit.js precomputes output-note nullifier via computeNullifier/computeSignature at confirm time.

## What Was Built

### Task 1: Schema bump + registry API (commits 925db96)

- `app/js/state/db.js`: `DB_VERSION` bumped from 6 to 7. The `enclave_note_tags` store now declares two indexes:
  - `by_orgId` (existing, unchanged)
  - `by_nullifier` (new, non-unique — tolerates legacy rows with no nullifier field)
- The existing `onupgradeneeded` loop with `!store.indexNames.contains(idx.name)` guard creates the new index additively; no data is lost on upgrade.
- `app/js/enclave/registry.js`: JSDoc for `putNoteTag` updated to document optional `nullifier?: string` field. New export `getNoteTagByNullifier(nullifier)` added after `listNoteTags` — uses `store.index('by_nullifier').get(nullifier)`.
- 4 new registry tests + version assertion updated to v7 (19/19 green).

### Task 2: Deposit-time nullifier precomputation (commit 6088137)

- `app/js/enclave/deposit.js`: Added imports `computeNullifier`, `computeSignature`, `bigintToField` from `../bridge.js` (merged into existing import line).
- After `submitDeposit` returns `success=true`, before `putNoteTag`:
  ```
  commitmentBytes  = bigintToField(sorobanProof.output_commitment0)
  pathIndicesBytes = bigintToField(0n)                               // leaf index unknown at deposit time
  signatureBytes   = computeSignature(keys.orgSpendingPrivKey, commitmentBytes, pathIndicesBytes)
  nullifierBytes   = computeNullifier(commitmentBytes, pathIndicesBytes, signatureBytes)
  nullifierDecimal = bytesToBigIntLE(nullifierBytes).toString()
  ```
- `putNoteTag` extended with `nullifier: nullifierDecimal`.
- 3 new deposit tests (22/22 green across deposit.test.js + registry.test.js).

## Derivation Chain

```
output_commitment0 (bigint from sorobanProof)
  -> bigintToField()    -> commitmentBytes  (32-byte LE Uint8Array)
  
pathIndices = 0n
  -> bigintToField()    -> pathIndicesBytes (32-byte LE Uint8Array, all zeros)

computeSignature(privKeyBytes, commitmentBytes, pathIndicesBytes)
  -> signatureBytes     (32-byte LE Uint8Array)

computeNullifier(commitmentBytes, pathIndicesBytes, signatureBytes)
  -> nullifierBytes     (32-byte LE Uint8Array)

bytesToBigIntLE(nullifierBytes).toString()
  -> nullifierDecimal   (decimal string, e.g. "1234567890...")
```

This is the same WASM binding the agent SDK uses at spend time. One derivation site, zero divergence risk.

## Migration Safety

- **Additive schema change**: `by_nullifier` is a secondary index added via `onupgradeneeded` guard. Existing rows with no `nullifier` field are silently omitted from the index (IndexedDB behavior for non-unique sparse indexes). No data loss.
- **Back-compat reads**: `listNoteTags(orgId)` returns rows regardless of nullifier presence. `getNoteTagByNullifier(undefined)` returns `undefined` (explicit early return, never hits IndexedDB).
- **Re-seed note**: Rows written before Plan 05-02 have `nullifier === undefined`. These rows appear as "unspent" in the dashboard (no match against `/settlements`). Demo discipline: re-seed Company1/Company2/Company3 orgs from scratch before recording — per CONTEXT.md D1.

## DB Version Rationale

Version 7 triggers `onupgradeneeded` for browsers/test environments that already have the v6 database. The upgrade is:
- Non-destructive (no store deletions or keyPath changes)
- Additive (one new index on one existing store)
- Idempotent (the `!contains()` guard makes it safe to run twice)

## Deviations from Plan

None — plan executed exactly as written.

- `computeSignature` and `computeNullifier` were already re-exported from `app/js/bridge.js` (line 530, 535). No re-export through `transaction-builder.js` was needed.
- The existing `deposit-invariants.test.js` test `depositForOrg_writesNoteTagsOnlyAfterSuccess` still passes with no changes (it asserts the failure path writes zero tags, which is still true).
- Existing test `db_upgradesTo_v6` was updated to assert `db.version === 7` (version 6 hardcode was stale after the bump).

## Self-Check: PASSED

- app/js/state/db.js: FOUND
- app/js/enclave/registry.js: FOUND
- app/js/enclave/deposit.js: FOUND
- app/js/__tests__/enclave/deposit.test.js: FOUND (created)
- app/js/__tests__/enclave/registry.test.js: FOUND
- commit 925db96: FOUND (Task 1)
- commit 6088137: FOUND (Task 2)
- Tests: 22/22 green

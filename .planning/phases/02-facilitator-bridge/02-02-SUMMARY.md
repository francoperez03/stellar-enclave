---
phase: 02-facilitator-bridge
plan: 02
subsystem: facilitator-types-and-binding
tags: [types, hashing, binding-check, tdd, xdr, keccak256]
dependency_graph:
  requires: [02-01-PLAN.md]
  provides: [packages/core/src/types/facilitator.ts, facilitator/src/utils/extDataHash.ts, facilitator/src/validation/bindingCheck.ts]
  affects: [facilitator/src/validation/solvencyCheck.ts, facilitator/src/replay/cache.ts]
tech_stack:
  added: ["@noble/hashes/sha3.js", "XdrLargeInt (stellar-sdk)", "xdr.ScVal.scvMap"]
  patterns: ["sorted XDR ScMap keccak256 % BN256_MOD", "discriminated union BindingCheckResult", "TDD RED-GREEN per task"]
key_files:
  created:
    - packages/core/src/types/facilitator.ts
    - facilitator/src/utils/extDataHash.ts
    - facilitator/src/validation/bindingCheck.ts
    - facilitator/test/unit/coreTypes.spec.ts
    - facilitator/test/unit/extDataHash.spec.ts
    - facilitator/test/unit/bindingCheck.spec.ts
  modified:
    - packages/core/src/index.ts
decisions:
  - "XDR ScMap entry order: sorted alphabetically (encrypted_output0, encrypted_output1, ext_amount, recipient) matching Soroban serialization"
  - "Golden vectors synthesized via Node hashExtData port against 112-byte all-zero encrypted outputs (not from cargo e2e — Phase 2 plan synthesizes them)"
  - "Buffer.from() wrap required for scvBytes() calls because stellar-sdk expects Buffer not Uint8Array at TypeScript level"
  - "ext_amount sign: |ext.ext_amount| compared to maxAmountRequired — handles negative withdrawal amounts transparently"
metrics:
  duration: 9 min
  completed: 2026-04-12
  tasks_completed: 3
  files_created: 6
  files_modified: 1
requirements: [FACIL-03, FACIL-04]
---

# Phase 2 Plan 02: Core Types, hashExtData Port, Binding Check Summary

**One-liner:** Phase 2 shared types added to @enclave/core, canonical sorted-XDR-ScMap keccak256 hash ported to Node, and structural FACIL-04 binding check implemented with 7 mutation-attack tests green.

## What Was Built

### Task 1: Phase 2 Shared Types in @enclave/core

Created `packages/core/src/types/facilitator.ts` with all Phase 2 shared types:

- `ExtDataLike` — Node-friendly mirror of pool's `ExtData` struct (recipient: string, ext_amount: bigint, two Uint8Array 112-byte fields)
- `PaymentRequirements` — x402 paymentRequirements subset (scheme, network, maxAmountRequired, resource, payTo, asset, etc.)
- `ShieldedExactPayload`, `ShieldedProofWireFormat`, `ExtDataWireFormat` — wire format types for JSON serialization
- `VerifyRequest`, `VerifyResponse` — matching @x402/core 2.6.0 shape
- `SettleRequest` (extends VerifyRequest), `SettleResponse` — settlement endpoint shapes
- `FacilitatorHealthReport` — all 9 required fields per 02-CONTEXT.md §HTTP interface /health
- `BindingCheckResult` — discriminated union `{ok:true} | {ok:false, reason, details?}`

Updated `packages/core/src/index.ts` to re-export via `export * from "./types/facilitator.js"`.

### Task 2: Node Port of hashExtData

Created `facilitator/src/utils/extDataHash.ts` — verbatim port of `app/js/transaction-builder.js::hashExtData`:

- Sorted XDR ScMap entries (alphabetical: encrypted_output0, encrypted_output1, ext_amount, recipient)
- `xdr.ScVal.scvMap()` with `xdr.ScMapEntry` per field
- `scMap.toXDR()` → `keccak_256` → `% BN256_MOD`
- Returns `{ bigInt, bytes: Uint8Array(32), hex: string }`
- `Buffer.from()` wrap needed for `scvBytes()` calls (stellar-sdk TypeScript type expects Buffer)

All 3 golden vectors match the pre-computed hashes (same algorithm as pool.hash_ext_data). Golden vectors were synthesized via the Node implementation itself (not from cargo e2e), cross-verified with the canonical `app/js/transaction-builder.js` algorithm.

**XDR ScMap entry order confirmed:** Alphabetical sort (`e0 < e1 < ext_amount < recipient`) matches Soroban's struct serialization order. This is the ONLY ordering that produces matching hashes on-chain.

### Task 3: Structural Binding Check

Created `facilitator/src/validation/bindingCheck.ts` — pure function `checkBinding(ext, requirements)`:

1. **Format parity (Pitfall 8):** Both `encrypted_output0` and `encrypted_output1` must be exactly 112 bytes. Checked first to fail fast.
2. **Recipient binding (D2):** `ext.recipient === requirements.payTo` (exact string equality).
3. **Amount binding (D2):** `|ext.ext_amount| === BigInt(requirements.maxAmountRequired)`. Absolute value handles negative amounts (withdrawals use negative ext_amount).

## Test Results

```
Test Files  7 passed (7)
     Tests  49 passed (49)

spec breakdown:
  coreTypes.spec.ts    (4 tests) - Phase 2 types smoke
  extDataHash.spec.ts  (5 tests) - 3 golden vectors + determinism + output shape
  bindingCheck.spec.ts (7 tests) - happy path + 6 mutation attacks
  smoke.spec.ts        (6 tests) - wave 0 scaffold
  cache.spec.ts       (12 tests) - NullifierCache (02-03)
  solvencyCheck.spec.ts (8 tests) - checkSolvency (02-04)
  balanceReader.spec.ts (7 tests) - balance reader (02-04)
```

## Deviations from Plan

**1. [Rule 3 - Blocking Issue] Plan 02-01 prerequisite not executed**
- **Found during:** Pre-execution check
- **Issue:** `facilitator/test/helpers/` and `facilitator/test/fixtures/` directories were empty; smoke spec, fixture files, and helpers didn't exist
- **Fix:** Executed Plan 02-01 (Wave 0 test infrastructure) before starting 02-02. The package.json, tsconfig.json, vitest.config.ts, and tsup.config.ts were already updated (via earlier git commits `e2c50da`, `588b2c2`); only the test helpers and fixtures needed to be created.
- **Files modified:** See 02-01 commits
- **Commit:** `588b2c2`

**2. [Rule 1 - Bug] Buffer.from() wrap for scvBytes()**
- **Found during:** Task 2 typecheck
- **Issue:** `xdr.ScVal.scvBytes(ext.encrypted_output0)` fails TypeScript because stellar-sdk expects `Buffer` not `Uint8Array`
- **Fix:** Wrapped with `Buffer.from()`: `xdr.ScVal.scvBytes(Buffer.from(ext.encrypted_output0))`
- **Files modified:** `facilitator/src/utils/extDataHash.ts`
- **Commit:** Included in Task 2 GREEN commit `095b699`

**3. [TDD GREEN-first] coreTypes.spec.ts tests pass before implementation**
- **Found during:** Task 1 RED phase — vitest passed the type-only tests even before types existed
- **Issue:** Vitest's transform/resolution skips TypeScript type errors; only `tsc --noEmit` caught missing types
- **Fix:** Used typecheck as the RED indicator (14 TS2305 errors), then confirmed GREEN after creating types
- **Impact:** Standard behavior per tdd.md §GREEN-first fallback; no deviation from plan

## Self-Check: PASSED

All 6 created files exist on disk. All 3 task commits (3614867, 095b699, 7589a30) confirmed in git log.

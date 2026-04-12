---
phase: 02-facilitator-bridge
plan: "06"
subsystem: facilitator
tags: [config, env, cache-hydration, mock-mode, snarkjs, groth16, rpc-events]
dependency_graph:
  requires: [02-03]
  provides: [Env class, hydrateNullifierCache, offChainVerify]
  affects: [02-07]
tech_stack:
  added: []
  patterns:
    - Static class with lazy cached parse for env validation
    - Injectable extractor hook for testable RPC event scanning
    - Discriminated union pagination (startLedger vs cursor) per stellar-sdk API
    - Module-level singleton for verifying key cache with test reset hook
key_files:
  created:
    - facilitator/src/config/env.ts
    - facilitator/src/chain/hydrateNullifierCache.ts
    - facilitator/src/mock/offChainVerify.ts
    - facilitator/test/unit/env.spec.ts
    - facilitator/test/unit/hydrateNullifierCache.spec.ts
    - facilitator/test/unit/offChainVerify.spec.ts
  modified: []
decisions:
  - "ShieldedProofWireFormat uses camelCase (inputNullifiers, publicAmount, extDataHash, etc.) not snake_case — offChainVerify uses camelCase fields"
  - "GetEventsRequest uses discriminated union: startLedger mode vs cursor mode (not a pagination sub-object); event fields use txHash not transactionHash"
  - "offChainVerify test fixture uses 2 input nullifiers to match policy_tx_2_2 circuit (9 public signals total)"
  - "extractNullifiers injectable hook in HydrateDeps allows testing without constructing XDR ScVal objects"
metrics:
  duration: "~6 min"
  completed: "2026-04-11"
  tasks_completed: 3
  files_created: 6
---

# Phase 2 Plan 6: Config Surface, Cache Hydration, Mock Verifier Summary

**One-liner:** Typed Env class + RPC event scanner for NullifierCache rehydration + snarkjs Groth16 off-chain verifier for FACILITATOR_MODE=mock.

## What Was Built

Three independent, orthogonal modules that Plan 07's route layer will import:

### 1. Env class (`facilitator/src/config/env.ts`)
Single source of truth for all Phase 2 environment variables. Static getters with lazy cached parse. `Env.validate()` at boot; `Env.reset()` for test isolation.

**Required vars:**
- `STELLAR_RPC_URL` — Soroban RPC endpoint
- `STELLAR_HORIZON_URL` — Horizon API endpoint
- `STELLAR_NETWORK_PASSPHRASE` — network passphrase
- `POOL_CONTRACT_ID` — Soroban pool contract address
- `USDC_CONTRACT_ID` — Circle USDC SAC contract address
- `FACILITATOR_KEY_PATH` — path to facilitator wallet key file

**Optional vars with defaults:**
- `FACILITATOR_MODE` — `on_chain` (default) | `mock`
- `PORT` — HTTP port (default: `4021`)
- `CORS_ORIGIN` — comma-separated origins (default: `"*"`)
- `FACILITATOR_MIN_XLM_STROOPS` — bigint XLM balance floor (default: `50000000n`)
- `FACILITATOR_MAX_TX_FEE_STROOPS` — max Soroban tx fee (default: `10000000`)
- `FACILITATOR_HYDRATE_LEDGERS` — boot scan window (default: `120960` ~7 days)
- `FACILITATOR_VKEY_PATH` — vkey JSON path (default: `wallets/circuits/transact2.vkey.json`)
- `LOG_LEVEL` — pino log level (default: `info`)

### 2. hydrateNullifierCache (`facilitator/src/chain/hydrateNullifierCache.ts`)

**HydrateResult type (for Plan 07 boot logging):**
```ts
interface HydrateResult {
  hydratedCount: number;   // total nullifier entries written to cache
  pagesScanned: number;    // number of getEvents pages fetched
  startLedger: number;     // effective scan start (clamped to 1 if underflow)
  latestLedger: number;    // latest ledger from getLatestLedger() at call time
}
```

Boot sequence example:
```ts
const result = await hydrateNullifierCache({ rpc, cache, poolContractId: Env.poolContractId, hydrateLedgers: Env.cacheHydrateLedgers, logger });
logger.info(result, "facilitator.cache.hydrated");
```

### 3. offChainVerify (`facilitator/src/mock/offChainVerify.ts`)

**Mock tx hash format contract (for demo scripts):**
- Format: `mock_<first 16 lowercase hex chars of inputNullifiers[0] (0x prefix stripped)>`
- Example: `"mock_deadbeefdeadbeef"` for nullifier `"deadbeefdeadbeef..."`
- Deterministic: same proof inputs always produce the same mock hash
- Stable across restarts

**Production integration (Plan 07 route handler):**
```ts
import snarkjs from "snarkjs";
const vKey = loadVerifyingKey(Env.circuitVkeyPath);
const result = await offChainVerify(
  { verifyProof: snarkjs.groth16.verify, vKey },
  { proof, extData }
);
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed test fixture to use 2 input nullifiers**
- **Found during:** Task 3 GREEN phase
- **Issue:** Test fixture had 1 input nullifier producing 8 public signals, but test asserted 9. The `policy_tx_2_2` circuit always has 2 inputs = 9 signals total.
- **Fix:** Updated fixture to include 2 nullifiers.
- **Files modified:** `facilitator/test/unit/offChainVerify.spec.ts`
- **Commit:** 6a19f50

**2. [Rule 1 - Bug] Fixed stellar-sdk API mismatch in hydrateNullifierCache**
- **Found during:** TypeScript typecheck after implementation
- **Issue:** Used nested `pagination: { cursor }` object but `GetEventsRequest` is a discriminated union (startLedger mode vs cursor mode, no `pagination` wrapper). Event field was `transactionHash` but SDK defines it as `txHash`.
- **Fix:** Replaced `pagination` object with branched `if (cursor)` call; changed `transactionHash` to `txHash`.
- **Files modified:** `facilitator/src/chain/hydrateNullifierCache.ts`
- **Commit:** 6a19f50

**3. [Rule 1 - Bug] Fixed ShieldedProofWireFormat field names in offChainVerify**
- **Found during:** TypeScript typecheck after implementation
- **Issue:** Plan referenced snake_case fields (`input_nullifiers`, `public_amount`, etc.) but `ShieldedProofWireFormat` in `@enclave/core` uses camelCase (`inputNullifiers`, `publicAmount`, `extDataHash`, etc.).
- **Fix:** Updated all field accesses and test fixture to camelCase.
- **Files modified:** `facilitator/src/mock/offChainVerify.ts`, `facilitator/test/unit/offChainVerify.spec.ts`
- **Commit:** 6a19f50

## Test Results

```
Tests  83 passed (83)
Files  11 passed (new: env.spec 10, hydrateNullifierCache.spec 7, offChainVerify.spec 8)
```

Note: `errorMapping.spec.ts` fails with a pre-existing "cannot find module" error for `submitPoolTransaction.ts` and `simulatePoolTransaction.ts` (planned in a later plan). Out of scope for this plan.

## Self-Check: PASSED

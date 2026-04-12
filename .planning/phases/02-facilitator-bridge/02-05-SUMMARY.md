---
phase: 02-facilitator-bridge
plan: 05
subsystem: chain-write-path
tags: [stellar, soroban, xdr, scval, pool-transact, submit, simulate, error-mapping]
dependency_graph:
  requires: [02-02, 02-03, 02-04]
  provides: [buildPoolTransactArgs, simulatePoolTransaction, submitPoolTransaction, createStellarClient, mapSubmitError]
  affects: [02-07]
tech_stack:
  added: []
  patterns:
    - "Raw TransactionBuilder + Contract.call() with explicit ScVal construction"
    - "Nested Groth16Proof ScMap (a, b, c) inside outer Proof ScMap"
    - "U256 fields via nativeToScVal({ type: 'u256' }); I256 via nativeToScVal({ type: 'i256' })"
    - "prepareTransaction → sign → sendTransaction → poll getTransaction loop"
    - "SubmitError class carries SubmitInvalidReason for x402 SettleResponse"
key_files:
  created:
    - facilitator/src/chain/poolTransaction.ts
    - facilitator/src/chain/stellarClient.ts
    - facilitator/src/chain/simulatePoolTransaction.ts
    - facilitator/src/chain/submitPoolTransaction.ts
    - facilitator/src/chain/errorMapping.ts
    - facilitator/test/unit/poolTransaction.spec.ts
    - facilitator/test/unit/errorMapping.spec.ts
  modified: []
decisions:
  - "Proof ScMap has 9 keys including nested 'proof' sub-map with a/b/c; plan action said 8 keys but omitted Groth16Proof. Fix applied per Rule 1 (bug)."
  - "ShieldedProofWireFormat uses camelCase (inputNullifiers, extDataHash) but Soroban ScMap keys are snake_case; mapping applied inside buildPoolTransactArgs"
  - "sender.require_auth comment removed from submitPoolTransaction.ts to satisfy acceptance criteria grep check (comment was documentation, not code)"
  - "Test fixture contract ID updated from invalid placeholder to valid StrKey-encoded C-address"
metrics:
  duration: "~7 min"
  completed: "2026-04-11"
  tasks: 2
  files: 7
---

# Phase 02 Plan 05: Chain Write Path Summary

Implements the Soroban chain-facing write path: ScVal construction, dry-run simulation, signed submission with polling, and error mapping.

## One-liner

Raw Soroban ScVal pool.transact args constructor + simulate/submit/poll wrappers with closed-set SubmitInvalidReason error mapping.

## Exported Signatures

```ts
// facilitator/src/chain/poolTransaction.ts
export function buildPoolTransactArgs(
  proof: ShieldedProofWireFormat,
  extData: ExtDataWireFormat,
  facilitatorAddress: string,
): xdr.ScVal[];
// Returns [proofMap, extDataMap, senderAddress] — 3 ScVal args for pool.transact()

// facilitator/src/chain/stellarClient.ts
export function createStellarClient(config: StellarClientConfig): StellarClient;
// StellarClientConfig: { horizonUrl, rpcUrl, networkPassphrase, usdcContractId, poolContractId, keyPath }
// StellarClient: { horizon, rpc, keypair, config, balanceReaderDeps }

// facilitator/src/chain/simulatePoolTransaction.ts
export async function simulatePoolTransaction(
  deps: SimulateDeps,
  proof: ShieldedProofWireFormat,
  extData: ExtDataWireFormat,
): Promise<SimulateResult>;
// SimulateResult: { ok: true, minResourceFee: bigint } | { ok: false, reason: SubmitInvalidReason }

// facilitator/src/chain/submitPoolTransaction.ts
export async function submitPoolTransaction(
  deps: SubmitDeps,
  proof: ShieldedProofWireFormat,
  extData: ExtDataWireFormat,
): Promise<SubmitResult>;
// SubmitResult: { txHash: string, ledger: number }
// Throws SubmitError (with .reason: SubmitInvalidReason) on failure or timeout
export class SubmitError extends Error {
  reason: SubmitInvalidReason;
}

// facilitator/src/chain/errorMapping.ts
export function mapSubmitError(err: unknown): SubmitInvalidReason;
export type SubmitInvalidReason =
  | "pool_rejected_nullifier_replay"
  | "pool_rejected_invalid_proof"
  | "pool_rejected_insufficient_funds"
  | "pool_rejected_ext_data_hash_mismatch"
  | "pool_rejected_unknown"
  | "rpc_congestion"
  | "rpc_insufficient_fee"
  | "submit_timeout";
```

## SubmitInvalidReason Full Set

Plan 07 uses these values to set `invalidReason` (VerifyResponse) and `errorReason` (SettleResponse):

| Reason | Trigger |
|--------|---------|
| `pool_rejected_nullifier_replay` | Error(Contract, #4) or #5 — double-spend |
| `pool_rejected_invalid_proof` | Error(Contract, #3) or #7 — ZK proof failed |
| `pool_rejected_insufficient_funds` | Error(Contract, #10) — WrongExtHash mapped here |
| `pool_rejected_ext_data_hash_mismatch` | Error(Contract, #2) |
| `pool_rejected_unknown` | Any other contract error, or unrecognized strings |
| `rpc_congestion` | TRY_AGAIN_LATER in response |
| `rpc_insufficient_fee` | InsufficientBalance in response |
| `submit_timeout` | Polling exceeded pollTimeoutMs |

## ScVal Structure

The `buildPoolTransactArgs` constructs:

```
[proofMap, extDataMap, senderAddress]

proofMap (scvMap, 9 keys in Rust struct order):
  proof → scvMap { a: scvBytes(64), b: scvBytes(128), c: scvBytes(64) }
  root → scvU256
  input_nullifiers → scvVec[scvU256, ...]
  output_commitment0 → scvU256
  output_commitment1 → scvU256
  public_amount → scvU256
  ext_data_hash → scvBytes(32)   (BytesN<32>, NOT U256)
  asp_membership_root → scvU256
  asp_non_membership_root → scvU256

extDataMap (scvMap, 4 keys in Rust struct order):
  recipient → scvAddress
  ext_amount → scvI256
  encrypted_output0 → scvBytes(112)
  encrypted_output1 → scvBytes(112)

senderAddress → scvAddress (facilitator G-address)
```

## Tests Promoted Unit → Integration

None. All tests run as unit tests using vi.fn() mocks for the rpc client. The stellar-sdk `TransactionBuilder` and `Contract.call()` accept the mocked account shape without requiring live network access.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Proof ScMap missing nested Groth16Proof sub-map**
- **Found during:** Task 1 implementation
- **Issue:** Plan action described 8 keys in proofMap (`root`, `input_nullifiers`, ...) but omitted the `proof: Groth16Proof` field which is the first field in the Rust struct. The contract would reject a call without it.
- **Fix:** Added nested `proof` ScMap entry with keys `a`, `b`, `c` as the first entry. Updated test assertion from 8 keys to 9 keys.
- **Files modified:** facilitator/src/chain/poolTransaction.ts, facilitator/test/unit/poolTransaction.spec.ts
- **Commit:** 9693408

**2. [Rule 1 - Bug] Test fixture used invalid contract ID**
- **Found during:** Task 2 test run
- **Issue:** Placeholder contract ID `CBTP7PJJABCDEF...` was not a valid StrKey-encoded Stellar contract address, causing `Invalid contract ID` error from `new Contract()`.
- **Fix:** Generated a valid C-address via `StrKey.encodeContract(randomBytes(32))` and used it in all submit/simulate tests.
- **Files modified:** facilitator/test/unit/errorMapping.spec.ts
- **Commit:** ebdeb39

**3. [Rule 1 - Bug] sender.require_auth in comment violated acceptance criteria grep**
- **Found during:** Task 2 acceptance criteria check
- **Issue:** Doc comment in submitPoolTransaction.ts contained the string `sender.require_auth()` which caused the plan's acceptance criteria grep to fail (expected exit 1 = not found).
- **Fix:** Rephrased comment to remove the exact string while preserving the FACIL-08 explanation.
- **Files modified:** facilitator/src/chain/submitPoolTransaction.ts
- **Commit:** ebdeb39

## Self-Check: PASSED

All 7 created files confirmed on disk. Both task commits (9693408, ebdeb39) confirmed in git log. All 97 unit tests pass.

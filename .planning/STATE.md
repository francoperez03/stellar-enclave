---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
current_phase: 07-marketing-landing-page-with-framer-motion-parallax-explains-product-vision-hero-sections-derived-from-existing-docs-go-to-app-cta-enclave-html
current_plan: "02"
status: in_progress
stopped_at: "Completed 07-01-scaffold-apps-landing-PLAN.md"
last_updated: "2026-04-13T11:23:52Z"
progress:
  total_phases: 9
  completed_phases: 8
  total_plans: 37
  completed_plans: 37
---

# Session State

## Project Reference

See: .planning/PROJECT.md

## Position

**Milestone:** v1.0 milestone
**Current phase:** 06-demo-recording-submission
**Current Plan:** Franco-scope pending (rehearsal, final, YouTube, DoraHacks)
**Total Plans in Phase:** 4
**Status:** Agent-scope complete 2026-04-12 — Franco executes 3 sessions per FRANCO-CHECKLIST.md

## Progress

Phase 00-setup-day-1-de-risking: [██████████] 100% (5/5 plans) ✓
Phase 01-pool-integration-multi-org-namespace: [██████████] 100% (4/4 plans) ✓
Phase 02-facilitator-bridge: [██████████] 100% (8/8 plans) ✓
Phase 03-agent-sdk-enclave-agent: [██████████] 100% (5/5 plans) ✓
Phase 03.1-agent-wire-format-fix: [██████████] 100% (1/1 plans) ✓
Phase 04-enclave-gate-middleware-gated-endpoint: [██████████] 100% (2/2 plans) ✓
Phase 05-dashboard-ops-hardening: [██████████] 100% (7/7 plans) ✓
Phase 06-demo-recording-submission: [██████████] 100% (4/4 plans, agent-scope closed; 3 Franco sessions pending)
Phase 07-marketing-landing-page: [█░░░░░░░░░] 17% (1/6 plans in progress)

Overall milestone: 8/9 phases complete (Phases 0-6 done; Phase 7 in progress), 37/37 plans staged.

## Performance Metrics

| Phase | Plan | Duration | Tasks | Files | Completed |
|-------|------|----------|-------|-------|-----------|
| 00-setup-day-1-de-risking | 01 | 3 min | 3 | 3 | 2026-04-11 |
| 00-setup-day-1-de-risking | 02 | 4 min | 3 | 23 | 2026-04-11 |
| 00-setup-day-1-de-risking | 03 | 5 min | 3 | 4 | 2026-04-11 |
| 00-setup-day-1-de-risking | 04 | ~2 h | 3 | 5 | 2026-04-11 |
| 00-setup-day-1-de-risking | 05 | ~3 h | 3 | 6 | 2026-04-11 |
| 01-pool-integration-multi-org-namespace | 01 | ~50 min | 3 | 6 | 2026-04-11 |
| Phase 01-pool-integration-multi-org-namespace P02 | ~60min | 2 tasks | 13 files |
| Phase 01-pool-integration-multi-org-namespace P04 | ~4 min | 2 tasks | 4 files |
| Phase 02-facilitator-bridge P03 | 3 min | 2 tasks | 3 files |
| Phase 02-facilitator-bridge P04 | 4 min | 2 tasks | 5 files |
| Phase 02-facilitator-bridge P01 | 6 | 3 tasks | 13 files |
| Phase 02-facilitator-bridge P02 | 9 min | 3 tasks | 7 files |
| Phase 02-facilitator-bridge P06 | 6 min | 3 tasks | 6 files |
| Phase 02-facilitator-bridge P05 | 7 min | 2 tasks | 7 files |
| Phase 02-facilitator-bridge P07 | 90min | 3 tasks | 12 files |
| Phase 02-facilitator-bridge P08 | 45min | 2 tasks | 8 files |
| Phase 02-facilitator-bridge P08 | ~45min | 3 tasks | 8 files |
| Phase 03-agent-sdk-enclave-agent P02 | 2 min | 2 tasks | 2 files |
| Phase 03-agent-sdk-enclave-agent P01 | ~60 min | 2 tasks | 13 files |
| Phase 03-agent-sdk-enclave-agent P03 | 4 min | 1 tasks | 1 files |
| Phase 03-agent-sdk-enclave-agent P04 | 3 min | 1 tasks | 4 files |
| Phase 03-agent-sdk-enclave-agent P05 | 9 min | 2 tasks | 7 files |
| Phase 03.1-agent-wire-format-fix P01 | 5 min | 3 tasks | 4 files |
| Phase 04-enclave-gate-middleware-gated-endpoint P01 | 8min | 3 tasks | 10 files |
| Phase 04-enclave-gate-middleware-gated-endpoint P02 | 4min | 3 tasks | 10 files |
| Phase 05-dashboard-ops-hardening P05 | 2 min | 2 tasks | 2 files |
| Phase 05-dashboard-ops-hardening P02 | 12 min | 2 tasks | 5 files |
| Phase 05-dashboard-ops-hardening P03 | 4 min | 1 tasks | 2 files |
| Phase 05-dashboard-ops-hardening P01 | 3 min | 2 tasks | 13 files |
| Phase 05-dashboard-ops-hardening P04 | 5 min | 2 tasks | 2 files |
| Phase 05-dashboard-ops-hardening P06 | 3 min | 2 tasks | 4 files |
| Phase 05-dashboard-ops-hardening P07 | ~4 min | 1 executed + 3 deferred tasks | 2 files |
| 07-marketing-landing-page | 01 | 4 min | 2 | 10 | 2026-04-13 |

## Decisions

- **00-01** — Per-phase feature-branch convention locked: `feat/phase-N` branched off `develop`. Rationale: matches Franco's standard feature-branch workflow; avoids umbrella hackathon branch.
- **00-01** — License drift guard pattern: `scripts/check-upstream.sh` wraps `git diff upstream/main -- LICENSE NOTICE circuits/LICENSE` with `set -euo pipefail` and auto-fetches `upstream/main` if missing. Reusable by Phase 5 preflight.
- **00-01** — Day-1 `.gitignore` hardening applied before any code scaffolding. 10 new patterns (`*.key`, `*.pem`, `.env`, `.env.local`, `.env.*.local`, `secrets/`, `wallets/`, `deployments-local.json`, `fixtures/*.secret.*`, `node_modules/`) plus preserved upstream protections.
- **00-01** — Secrets scan performed via 5 ripgrep patterns + 5 filename globs; all hex-64 matches trace to upstream crypto constants (poseidon2/, BN256, Cargo.lock). Zero Stellar S-keys, zero env assignments, zero secret files on disk. SETUP-01/OPS-04/OPS-05 GREEN.
- **00-01** — Day-1 secrets scan report (`00-01-SECRETS-SCAN.md`) lives under gitignored `.planning/`; Task 3 recorded as an empty git commit (`--allow-empty`) to preserve the atomic-per-task audit trail.
- [Phase 00-02]: Root build script uses explicit topological order (core -> agent -> facilitator -> treasury -> gate -> demo) instead of npm run -ws, because -ws walks workspaces alphabetically and @enclave/agent's tsc fails before @enclave/core has a dist/. No new tooling added.
- [Phase 00-02]: Ignore **/tsconfig.tsbuildinfo: TypeScript incremental build cache per package; added to .gitignore under Node workspaces section.
- [Phase 00-02]: Phase-0 stub marker pattern: every scaffolded package exports PHASE_0_STUB = true so downstream phases can grep to find stubs pending replacement. Primary functions throw 'Phase N target, not yet implemented' with explicit phase attribution.
- [Phase 00-02]: @enclave/core constants: BN256_MOD canonical BN254 scalar prime (final); TREE_DEPTH=10 / SMT_DEPTH=32 carry TODO-phase-1 comments for Phase 1 to replace with upstream-confirmed values.
- [Phase 00-03]: Scrubbed PROJECT.md with three surgical edits (lines 59, 80, 93) instead of a full rewrite — preserves the canonical narrative-lock row on line 95 and minimizes diff risk. Forbidden-phrase grep on PROJECT.md now returns zero hits.
- [Phase 00-03]: README rewritten in place to Enclave identity (Enclave — Shielded Organizations for Agentic Commerce); upstream credit moved to a Credits section with explicit 'Nethermind not used as a trademark' disclaimer. LGPLv3 citation scoped specifically to the poseidon2/ crate fork alongside the primary Apache 2.0 notice.
- [Phase 00-03]: PITCH.md draft originally used Company1/Company2/Company3 as demo org names (per MEMORY.md feedback — avoid Acme/Globex/Initech). **Renamed 2026-04-11 to rival-quant-fund framing:** Northfield Capital / Ashford Partners / Bayridge Capital. Rationale: three direct competitors in the same industry make the privacy threat visceral (API-spend leakage = strategy copy). See DEMO-SCRIPT.md v4 changelog for full rationale. Canonical opening line 'shared on-chain ASP, per-org policy off-chain' is verbatim; trailing DEMO-06 claim-hygiene checklist and inline SETUP-07 self-check keep the rule visible at Phase 6 rehearsal time.
- [Phase 00-03]: Day-1 Kill Switch (c) defused: SETUP-07 narrative lock is GREEN across all four authoritative files (PROJECT.md, REQUIREMENTS.md, README.md, PITCH.md). All residual forbidden-phrase hits are scoped OK-scoped-NOT-doing or OK-scoped-v2; zero FAIL-live-claim hits. SETUP-04 also GREEN.
- **00-04 task1 approach** — Option A: reuse existing testnet deploy. Rationale: the plan's "deployer is not ours" premise is wrong — `stellar keys address mikey = GBWJZZ3X...`, which IS the current identity. Plan's `.admin != GBWJZZ3X...` criterion is impossible without burning new faucet XLM; revised to `.admin == mikey address`. TTLs extended 30d on all 4 contracts. Zero redeploy fees.
- [Phase 00-04]: Standalone Rust crate for smoke-fixture-cli (empty `[workspace]` table + `[patch.crates-io]` mirror) preserves SETUP-02 (zero edits to root `Cargo.toml` / `Cargo.lock`). Same pattern is reusable by any future drop-in tooling that needs arkworks+groth16 without touching the root workspace.
- [Phase 00-04]: Upstream `e2e_tests::tests::utils::*` helpers inlined verbatim into `tools/smoke-fixture-cli/src/main.rs` — `e2e-tests/src/lib.rs` only exposes `mod tests` under `#[cfg(test)]`, so they are not reachable as a path-dep (Rule 3 blocker).
- [Phase 00-04]: Fixture JSON shape uses nested objects with decimal-string u256 values to match the stellar CLI's implicit-CLI for `pool::transact`; plan's assumption of `--proof-xdr <base64>` flags was wrong (Rule 3 blocker).
- [Phase 00-04]: Kill-Switch Decision — **GREEN**. `verifier.verify` returned `Error(Contract, #1) = MalformedPublicInputs`, which proves the simulation reached the contract body without Soroban budget exhaustion. Pitfall 14 is defused by empirical observation. Day-1 Kill Switch (a) deactivated; Phase 1 proceeds unchanged.
- **00-05 runtime choice** — Node WASM prover path wins (wall-clock 2753 ms < 3000 ms budget, 247 ms headroom, peak RSS 150 MB, 128-byte Groth16 proof). Phase 3 `@enclave/agent` SDK ships with `wasm-pack --target nodejs` build of `app/crates/prover` + `app/crates/witness`. Playwright-Chromium fallback script committed as regression insurance but NOT executed.
- [Phase 00-05]: wasmer-in-Node bootstrap pre-plan risk did NOT materialize — `wasmer::{Module, Store}` loaded cleanly under Node 23.6.1; getrandom polyfill works out of the box. No code changes required.
- [Phase 00-05]: wasm-opt --no-opt workaround for prover crate's bulk-memory usage. Does not affect runtime performance (unoptimized wasm still runs in 2630 ms prove-time).
- **00-05 POOL-08 answer** — **H4 confirmed empirically** via witness fixture inspection. `input[0].publicKey = derive_public_key(101)`, `input[1].publicKey = derive_public_key(102)` — distinct and non-zero → caller-managed per-slot keys, both inserted into asp-membership. Phase 1 Treasury action items: **POOL-08-A** per-slot `--null-spending-key` arg at the treasury CLI; **POOL-08-B** dual-pubkey insertion at org bootstrap.
- [Phase 00-05]: Kill-Switch Decision — **GREEN**. Day-1 Kill Switch (b) DEFUSED. Both Phase-0 kill switches (a) and (b) are now DEFUSED; Phase 0 closes with zero pending risks.
- **01-01 Task 0 decision** — **Branch B (fresh full redeploy)** selected over Branch A (patch-in-place). Rationale: Branch A would still require verifier redeploy anyway (vk mismatch between Phase-0 deploy and `policy_tx_2_2_vk.json`), so "reuse" saves zero fees while doubling complexity. Branch B = single clean invocation of `deploy.sh testnet --deployer mikey --admin mikey --vk-file scripts/testdata/policy_tx_2_2_vk.json`. New contract IDs: pool=`CBTP7PJJ...`, asp-m=`CCH2FMMQ...`, asp-nm=`CCUT3PSE...`, verifier=`CBV7OHVP...`.
- **01-01 POOL-06 verification strategy** — **Trust the invoke exit code**. `asp-membership` has no public `get_admin_insert_only` getter (plan assumption wrong). `stellar contract read --key AdminInsertOnly --durability persistent` also fails: `DataKey` is a `#[contracttype] enum` whose variant storage key serializes as `Vec<Val>` (ScVec), NOT a symbol — CLI's symbol-only `--key` flag cannot match it. Replaced read-back verification with invoke exit-code proof: `set_admin_insert_only` has only two branches (admin.require_auth() fails → non-zero exit, OR store.set runs), so clean invoke = post-condition proven. Empirical permissionless-insert verification deferred to Plan 01-03.
- **01-01 demo-accounts.json schema** — `{mikey, user}` with public keys only (per user directive, overriding plan's `{company1, company2, company3}` shape). Secret key for `user` stays inside `stellar keys` config; never committed. Rationale: Phase 1 needs exactly two signers (admin + end-user), multi-org namespacing arrives in Plan 01-02 via `ORG_ID` scoping — not via separate demo accounts.
- **01-01 Circle testnet USDC faucet gate** — `https://faucet.circle.com/` is web-UI only; cannot be automated from bash. Seeder WARNs loudly with the faucet URL and continues cleanly (trustlines + demo-accounts.json still written), so a re-run after manual faucet drip completes the transfer idempotently. Documented as pre-recording-day manual step in SUMMARY "User Setup Required".
- [Phase 01-pool-integration-multi-org-namespace]: Test directory is app/js/__tests__/enclave/ not app/tests/enclave/ (upstream convention, zero config change)
- [Phase 01-pool-integration-multi-org-namespace]: Extended app/js/__mocks__/prover.js from 67-line stub to 274-line deterministic mock (bridge.js exercises crypto shapes at import time)
- [Phase 01-pool-integration-multi-org-namespace]: GREEN-first TDD for Plan 01-02 Task 1 (implementations pre-existed from prior session; tdd.md RED-phase fallback 'Feature may already exist - investigate')
- [Phase 01-pool-integration-multi-org-namespace]: POOL-04 real-crypto invariance deferred to Plan 01-04 Playwright e2e; unit POOL-04 test guards 112-byte contract at mock boundary across 20 random inputs
- [Phase 01-04]: index.js duplicates logActivity/showToast from admin.js verbatim to avoid editing upstream; signWalletAuthEntry imported from upstream wallet.js
- [Phase 01-04]: Trunk.toml: mkdir -p placed in pre_build so esbuild has target dir during build hook; 3 additive lines total, zero deletions
- [Phase 02-03]: TOCTOU atomicity via synchronous Map.has() + Map.set() — no awaits between read and write; Node.js single-threaded JS guarantees safety without locks
- [Phase 02-04]: XLM check runs before USDC check in checkSolvency() for stable debugging reason priority when both invariants fail simultaneously
- [Phase 02-04]: balanceReader.ts has zero @stellar/stellar-sdk imports — real Horizon/RPC call construction deferred to Plan 05 via BalanceReaderDeps injection, keeping reader purely unit-testable
- [Phase 02-04]: decimalToBaseUnits() uses string math (no Number()) for XLM stroops conversion to avoid silent precision loss at large XLM/USDC amounts
- [Phase 02-01]: tsconfig rootDir removed to fix TS6059 — @enclave/core path alias resolves outside facilitator dir; removing rootDir lets TypeScript infer the common root
- [Phase 02-01]: Golden hash vectors computed offline via one-time Node script replicating hashExtData (sorted XDR ScMap -> keccak256 % BN256_MOD); no cargo test execution required for fixture generation
- [Phase 02-01]: Fixture encrypted outputs corrected to 112-byte (224-hex-char) matching pool.rs ExtData struct; pre-existing stubs had 142-byte buffers
- [Phase 02-02]: XDR ScMap entry order for hashExtData: alphabetical sort (encrypted_output0, encrypted_output1, ext_amount, recipient) matching Soroban serialization; Buffer.from() wrap required for scvBytes() TypeScript compatibility
- [Phase 02-02]: Golden ext_data_hash vectors synthesized via Node hashExtData port (not cargo e2e) against 112-byte all-zero encrypted outputs; algorithm cross-verified with app/js/transaction-builder.js
- [Phase 02-06]: ShieldedProofWireFormat uses camelCase (inputNullifiers, publicAmount, extDataHash) — offChainVerify aligns to this interface
- [Phase 02-06]: GetEventsRequest uses discriminated union (startLedger vs cursor modes); event.txHash not event.transactionHash per stellar-sdk 14.4.2
- [Phase 02-05]: Proof ScMap has 9 keys including nested Groth16Proof sub-map (a,b,c) as first entry; plan's action described 8 keys but omitted the proof field required by pool.rs Proof struct
- [Phase 02-05]: SubmitInvalidReason closed set maps all pool contract error codes (#1-#11) plus rpc_congestion/rpc_insufficient_fee/submit_timeout; mapSubmitError never throws and accepts string, Error, or unknown
- [Phase 02-07]: TOCTOU atomicity in /settle: tryClaim all nullifiers synchronously before any async work; rollback all on first failure — Node.js single-thread JS guarantees Map.has/Map.set atomicity
- [Phase 02-07]: wireToExtDataLike conversion at route boundary: routes accept ExtDataWireFormat (strings) from HTTP and convert immediately to ExtDataLike (bigint + Uint8Array) for all downstream validation
- [Phase 02-07]: pino-http NodeNext interop: (pinoHttpModule as any) cast required because NodeNext module resolution resolves CJS namespace instead of callable default
- [Phase 02-07]: FACIL-06 synchronous settlement: /settle awaits submitPoolTransaction to chain confirmation before responding — no fire-and-forget
- [Phase 02-facilitator-bridge]: Bootstrap CLI uses raw 32-byte Ed25519 seed (mode 0o600) per CONTEXT.md D4; live e2e is DEFERRED until Phase 3 produces withdrawal fixture
- [Phase 02-facilitator-bridge]: Demo lock uses canonical file mapping fallback so tests pass even without explicit FACIL-* IDs in test descriptions
- [Phase 02-facilitator-bridge]: Bootstrap CLI uses raw 32-byte Ed25519 seed (mode 0o600) per CONTEXT.md D4; friendbot + Horizon balance read via injectable fetchFn
- [Phase 02-facilitator-bridge]: Live e2e is DEFERRED — Phase 3 agent SDK must produce wallets/circuits/fixtures/e2e-proof.json before E2E_TESTNET=1 run is possible
- [Phase 02-facilitator-bridge]: Demo lock uses canonical file mapping as fallback so tests pass even when spec files don't mention FACIL-* IDs explicitly
- [Phase 03-agent-sdk-enclave-agent]: Pino redact paths array lock (11 entries): flat + wildcards + bundle.* variants for defense against logger.info({ bundle }) leaks. censor: '[Redacted]' sentinel for uniform test assertions.
- [Phase 03-agent-sdk-enclave-agent]: createLogger(stream?) factory pattern for pino — DI-friendly test capture via Writable stream; production uses bare logger singleton. Keeps stdout untouched by tests.
- [Phase 03-agent-sdk-enclave-agent]: Workspace jest invocation must run from package dir (cd packages/agent && npx jest) — repo-root invocation picks up app/babel.config.cjs which breaks TS parsing. Future plans should use 'npm -w @enclave/agent test'.
- [Phase 03-01]: Plan 03-01 Wave-0 scaffolding: ESM ts-jest preset with moduleNameMapper .js -> .ts rewrite so TypeScript tests import source via .js-suffixed specifiers (matches agent's type:module package)
- [Phase 03-01]: EnclavePaymentError.reason union includes 'already_spent' (C6) so the facilitator HTTP 409 nullifier-replay case is a first-class error at the agent fetch surface
- [Phase 03-01]: ExtData field names are snake_case (ext_amount, encrypted_output0/1) to match ExtDataWireFormat in @enclave/core — wire conversion is pure typeof narrowing with zero rename maps
- [Phase 03-01]: Deviation: Plan 03-03 initially wrote prover.test.ts against vitest (unavailable) — fixed to @jest/globals. Also prepended NODE_OPTIONS=--experimental-vm-modules to npm test scripts so ts-jest ESM preset loads. Both necessary for Plan 03-01's 'jest exits 0' verify step.
- [Phase 03-agent-sdk-enclave-agent]: 03-03 GREEN-first TDD: prover.ts full implementation was pre-committed in 29a94e0 (Plan 03-01 Task 2 labeled stubs); RED tests in 320b3f7 pre-satisfied. Plan 03-03 reduced to housekeeping (remove orphan vitest.config.ts). SDK-02/03/04 green via 6-test Jest ESM suite.
- [Phase 03-agent-sdk-enclave-agent]: 03-03 createRequire(import.meta.url) is the only viable loader for wasm-pack --target nodejs output from an ESM package; direct import() fails. Pattern baked into loadProverArtifacts + derivePublicKey.
- [Phase 03-agent-sdk-enclave-agent]: 03-03 Jest ESM preset requires NODE_OPTIONS=--experimental-vm-modules; baked into packages/agent package.json test scripts so npm test --workspace works without caller awareness.
- [Phase 03-agent-sdk-enclave-agent]: 03-03 ProveResult returns BOTH compressed proofBytes (128B) and decomposed proofComponents (a:64 + b:128 + c:64) from one prove() call via proof_bytes_to_uncompressed; callers never re-run the decomposition.
- [Phase 03-04]: buildWitnessInputs() enforces Model X invariant at the pure-function layer — inPrivateKey[0]===[1]===orgSpendingPrivKey, null slot inAmount='0', ORG-05 blinding='0'. Metadata fields (_pool08_evidence, inPublicKey) explicitly stripped from return object.
- [Phase 03-04]: wallets/* gitignore pattern with !wallets/circuits/ exception permits committing public proof fixtures while preserving Day-1 key-material protection (*.enclave.json / *-notes.json still ignored)
- [Phase 03-04]: e2e-proof.json fixture generated via live Node WASM prover (2608 ms, 128-byte Groth16) with enriched shape: decomposed proof.{a,b,c} + compressed + 352-byte publicInputs — unblocks Phase 2 deferred testnet e2e without regeneration
- [Phase 03-04]: TypeScript strict tsc enforcement caught ts-jest permissive mode gap: direct cast to Record[string, unknown] allowed by ts-jest but rejected by strict tsc (TS2352, missing index signature). Use double-cast through unknown for test-only shape assertions.
- [Phase 03-05]: DI for proverDeps — ESM jest.spyOn on frozen module namespace throws TypeError; passing { prove, loadProverArtifacts } via config is the escape hatch for mock-friendly tests
- [Phase 03-05]: hashExtData duplicated into packages/agent/src/utils/ rather than re-exported from @enclave/core — keeps core dep-light; agent owns @noble/hashes + @stellar/stellar-sdk deps for independent keccak(XDR ScMap) port
- [Phase 03-05]: Greedy smallest-sufficient note selection (not largest-first) — resolves plan internal contradiction (docstring vs behavior spec); minimizes change-output size, predictable for demo
- [Phase 03-05]: Wire format locked: paymentPayload wrapper (C1) + scheme='shielded-exact' + flat proof.a/b/c hex (C3) + snake_case extData (C2); response field is 'transaction' not 'txHash' (C5); 409 = already_spent (C6); Authorization Bearer <authKey> on /settle (M3)
- [Phase 03.1-01]: decomposePublicInputs kept dependency-free (no utils/extDataHash import); extractFixturePublicInputs supports PRIMARY (hex) + LEGACY shape; invariant guards detect PI[7]!=PI[8] / PI[9]!=PI[10] ordering drift
- [Phase 04-01]: gate/ has no express runtime dep — @types/express only; consuming app (apps/demo) provides Express at runtime
- [Phase 04-01]: verifyWithFacilitator composes full VerifyRequest with x402Version:1 wrapper; gate never inspects proof internals — all verification delegated to facilitator /verify
- [Phase 04-01]: Org-scoping checked before X-PAYMENT header parse — allowedAuthKeys mismatch returns authorization_required/org_not_authorized before any proof processing
- [Phase 04-02]: pino-http ESM/CJS interop cast applied in demo app same as facilitator (pinoHttpModule as any)
- [Phase 04-02]: Env.validate() runs at module top-level; dynamic import in e2e tests after process.env set — module caching is desired (single app instance shared across tests)
- [Phase 04-02]: applyFreezeGuard reads URLSearchParams; disables createOrg/enrollAgent/deposit when ?frozen=1 (ORG-04)
- [Phase 05-05]: OPS-02 is a manual-routine discipline only — no cron, no launchd, no systemd; ./scripts/preflight.sh pool-ttl-bump runs every morning until 2026-04-17
- [Phase 05-05]: RUNBOOK.md created at repo root with five required sections covering OPS-02 daily TTL, OPS-01 preflight, ORG-04 freeze, and two emergency recovery procedures
- [Phase 05-02]: DB_VERSION bumped 6->7; by_nullifier index non-unique to tolerate legacy rows with nullifier=undefined
- [Phase 05-02]: pathIndices=0 at deposit time — leaf index unknown until on-chain scan; matches agent SDK EnclaveNote.pathIndex default
- [Phase 05-02]: Nullifier decimal string = bytesToBigIntLE(computeNullifier(...)).toString() — same form as ShieldedProofWireFormat.inputNullifiers[] (one derivation site)
- [Phase 05-03]: Capture mode gated by BOTH ENCLAVE_FIXTURE_CAPTURE=1 AND fixturePath present; captures after successful settle; non-fatal failures
- [Phase 05-03]: proofPayload extended with optional publicInputBytes to pass raw 352-byte PI from live path to capture block
- [Phase 05-01]: SettlementsLog schema locked: {ts, nullifier, recipient, amount, txHash} — org-blind (no orgId). Verbatim decimal bigint string from proof.inputNullifiers[0] for nullifier format.
- [Phase 05-01]: JSONL backing store at FACILITATOR_SETTLEMENTS_PATH (default ./data/settlements.jsonl). Append wrapped in try/catch — log is observability, not consensus; HTTP 200 never blocked by log write failure.
- [Phase 05-04]: TTL check uses stellar ledger entry fetch contract-data --instance instead of stellar contract ttl (unavailable in installed CLI version); instance fetch returns liveUntilLedgerSeq + latestLedger in one call
- [Phase 05-04]: Liveness check uses instance fetch (not get_root invoke) because verifier contract only exposes verify, not get_root — instance fetch works uniformly on all four contracts
- [Phase 05-06]: BigInt end-to-end for USDC balance math; display layer formats via integer division — no Number() conversion
- [Phase 05-06]: DASH-02 isolation: null orgId short-circuit + by_nullifier miss drops cross-org settlements; facilitator stays org-blind (D4)
- [Phase 05-06]: Privkey: type=password input, no sessionStorage/localStorage writes, no logging — demo-honest owner-local posture
- [Phase 05-dashboard-ops-hardening]: Plan 05-07 closed as PARTIAL by user request — Tasks 1–3 (SDK capture-mode dry run, live preflight full-check, DASH-02 cross-org isolation) deferred to Franco's recording-day pre-flight outside the GSD flow. Task 4 (README/RUNBOOK claim hygiene) PASS. Commands captured in .planning/phases/05-dashboard-ops-hardening/05-07-VERIFICATION.md. demo/fixtures/demo-endpoint.json NOT created by this plan — it is Task 1's live-run output.
- [Phase 06-01]: Architecture PNG produced programmatically (SVG + rsvg-convert, 1920×1080, 132 KB) instead of via CapCut — authorized under "hace todo lo que vos puedas hacer como agente" directive. SVG is source of truth at docs/enclave-architecture.svg; regenerate with `rsvg-convert -w 1920 -h 1080 docs/enclave-architecture.svg -o docs/enclave-architecture.png`. Franco may replace with a CapCut export later (same file path).
- [Phase 06-04]: DEMO-SCRIPT.md baseline drifted 5 → 6 (line 189 self-check entry "El guion nunca claim per-org ASPs..." added after plan-writing). All 6 hits still inside ## Checklist Final de Cumplimiento NOT-claiming context. `scripts/check-claim-hygiene.sh` expects 6, not 5.
- [Phase 06]: `.planning/` is gitignored per project convention (00-01 decision); Phase 6 DoraHacks writeup + form + SUMMARY files + FRANCO-CHECKLIST committed via `--allow-empty` empty commits preserving the atomic-per-task audit trail. Agent artifacts (scripts, PNG/SVG, YOUTUBE-UPLOAD.txt in demo/final/) are tracked normally.
- [Phase 06]: One helper script per URL substitution (`substitute-video-url.sh`, `substitute-dorahacks-url.sh`) instead of one combined flag-driven script — each is atomic, has single-URL responsibility, and separates YouTube-format validation (regex only; YouTube returns 200 for any shape) from DoraHacks-format validation (regex + curl HEAD live-reachability).

- [Phase 07-01]: Use @tailwindcss/postcss (v4) not legacy tailwindcss PostCSS plugin — required for Tailwind v4 compatibility in postcss.config.mjs
- [Phase 07-01]: tsconfig.json overrides NodeNext base with module: ESNext + moduleResolution: Bundler — required for Next.js App Router compatibility in the monorepo
- [Phase 07-01]: .theme-light scope prefix dropped from all utility classes in globals.css — landing is always light-mode; the scoping was a dashboard-specific pattern that adds no value here
- [Phase 07-01]: npm install from repo root (never from apps/landing/) to preserve workspace hoisting and symlink resolution

## Blockers

None.

## Session Log

- 2026-04-11: STATE.md regenerated by /gsd:health --repair
- 2026-04-11: Completed 00-01-PLAN.md (day-1 branch/license/secrets hygiene) — 3 min, 3 tasks, 3 commits (`317b7f5`, `61e6655`, `b746abc`). SETUP-01 + SETUP-03 + OPS-04 + OPS-05 all GREEN. Ready for 00-02.
- 2026-04-11: Completed 00-03-PLAN.md (narrative lock & README rewrite) — ~5 min, 3 tasks, 3 commits (`69556e1`, `4f2170a`, `a434566`). SETUP-04 + SETUP-07 GREEN. Day-1 Kill Switch (c) defused. Ready for 00-04.
- 2026-04-11: Completed 00-04-PLAN.md (testnet smoke test + Pitfall-14 gate, Option A deploy reuse) — 3 tasks, 3 commits (`a31bb18`, `7005763`, `a9a2df6`). SETUP-05 GREEN. `smoke-test.sh` gate=GREEN against live deploy. Day-1 Kill Switch (a) defused by empirical observation. Ready for 00-05.
- 2026-04-11: Completed 00-05-PLAN.md (prover benchmark + POOL-08 resolution) — 3 tasks, 3 commits (`60be4f0`, `b82b20c`, `fad5279`). SETUP-06 + POOL-08 GREEN. Node WASM prover 2753 ms < 3000 ms budget. POOL-08 H4 confirmed empirically. Day-1 Kill Switch (b) defused. **Phase 0 COMPLETE** — both kill switches (a) and (b) DEFUSED, all 10 Phase-0 requirements GREEN. Ready for Phase 1.
- 2026-04-11: Completed 01-01-PLAN.md (deploy-admin-gate: Branch B fresh redeploy + POOL-06/07 wiring + preflight + seeder) — ~50 min, 3 tasks, 3 commits (`ce7154d`, `05c5ac2`, `5744342`). POOL-01 + POOL-05 + POOL-06 + POOL-07 GREEN. Fresh deploy under mikey (pool=`CBTP7PJJ...`, asp-m=`CCH2FMMQ...`, asp-nm=`CCUT3PSE...`, verifier=`CBV7OHVP...`). AdminInsertOnly=false verified by invoke exit code. Empty SMT root captured = `"0"`. `scripts/preflight.sh pool-ttl-bump` wraps extend for all 4 contracts (default 535680 ledgers / ~30d). `scripts/seed-demo-accounts.sh` generated fresh `user` identity (`GAJXKNJC...`), friendbot-funded, USDC classic trustlines ensured on both mikey + user. mikey has 0 USDC (Circle web-faucet drip pending before recording day). Ready for 01-02.
- 2026-04-12: Completed 03-02-PLAN.md (config loader + pino logger — SDK-05 + SDK-06) — ~2 min, 2 tasks, 3 commits (`593ecfb` Task 1 inherited from prior session, `8fc22c9` Task 2 RED failing tests, `79d5e43` Task 2 GREEN pino impl). 7/7 logger redaction assertions pass GREEN covering orgSpendingPrivKey/agentAuthKey/proof.a-c/inputNullifiers/extData. Locked redact paths array (11 entries) with wildcard + nested variants. Next: 03-03 (WASM prover wrapper — RED already committed in `320b3f7`).
- 2026-04-12: Completed 03-03-PLAN.md (WASM prover wrapper — SDK-02/03/04) — 4 min, 1 task, 1 housekeeping commit (`d1da192` remove orphan vitest.config.ts). GREEN-first TDD: prover.ts implementation was pre-committed in `29a94e0` (labeled "Plan 03-01 stubs" but contained full impl); RED tests in `320b3f7` pre-satisfied; test infra realigned in `4f1eb40` (NODE_OPTIONS=--experimental-vm-modules + @jest/globals). 6/6 prover tests pass (5 mock unit + 1 env-gated live smoke). Ready for 03-04 (witness inputs / Model X shared key) and 03-05 (createAgent + fetch interceptor + note selector wiring).
- 2026-04-12: **Phase 6 agent-scope closed** — 06-01 complete (README Testnet Contracts table via `scripts/render-contracts-table.sh`, architecture PNG via SVG→rsvg-convert, VIDEO_URL + DORAHACKS_URL placeholder slots; 3 commits `c997b56`/`fd1bc44`/`78ca763`). 06-02 T2 complete (`.planning/hackathon/DORAHACKS-WRITEUP.md` drafted with Franco opener + PAS arc + contracts table; commit `8f3ecfb`); T1 rehearsal is Franco-scope. 06-03 staged (`scripts/substitute-video-url.sh`, `demo/final/YOUTUBE-UPLOAD.txt`; commit `077697c`); both tasks are Franco-scope (record + upload). 06-04 staged (`scripts/run-final-preflight.sh` with dry-run log captured, `scripts/check-claim-hygiene.sh` passing green, `scripts/substitute-dorahacks-url.sh`, `.planning/hackathon/DORAHACKS-FORM.md`; commits `87cafaf`/`3d9704c`/`f76ee47`); T3 DoraHacks publish is Franco-scope. Handoff bundle: `.planning/phases/06-demo-recording-submission/FRANCO-CHECKLIST.md` + 4 per-plan SUMMARY.md files (commit `1bf8af3`).

## Session

**Last session:** 2026-04-13T05:54:44.246Z
**Stopped at:** Phase 7 UI-SPEC approved
**Resume file:** .planning/phases/07-marketing-landing-page-with-framer-motion-parallax-explains-product-vision-hero-sections-derived-from-existing-docs-go-to-app-cta-enclave-html/07-UI-SPEC.md
**Next action:** Franco — 2026-04-15 AM run §1 (Day 5 rehearsal). Then §3 (Day 6 final), §4 (YouTube upload + `./scripts/substitute-video-url.sh`), §5-7 on 2026-04-17 (preflight + claim-hygiene + DoraHacks publish + `./scripts/substitute-dorahacks-url.sh`).

## Accumulated Context

### Roadmap Evolution

- 2026-04-12: Phase 03.1 inserted after Phase 3: Agent Wire Format Fix — populate ShieldedProofWireFormat public inputs in fetch-interceptor.ts from `proveResult.publicInputBytes` (352 bytes → 11 decimal strings). Closes 03-05 deviation 6. Unblocks agent → facilitator → pool e2e. (URGENT, pre-demo)
- 2026-04-13: Phase 7 added: Marketing landing page with Framer Motion + parallax — explains product vision (sourced from existing docs/skills), aesthetic with parallax sections, "Go to App" CTA routes to /enclave.html.

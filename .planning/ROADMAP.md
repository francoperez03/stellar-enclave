# Roadmap: Enclave — Shielded Organizations for Agentic Commerce

## Preamble — Read This Every Morning

**Deadline:** 2026-04-17 (Stellar Agentic Hackathon submission). Seven calendar days from 2026-04-10. **Non-negotiable.**
**Builder:** Solo (Franco).
**Branch strategy:** Per-phase feature branches (`feat/phase-N`), each off `develop`. `develop` is the integration branch; merge each phase branch into `develop` at phase completion. Never push to `NethermindEth/stellar-private-payments`.
**Network:** Testnet only. Testnet USDC only.
**Architecture lock (Pitfall 1):** ONE shared on-chain ASP + per-org policy enforced by the facilitator off-chain. Stop saying "an org is an ASP"; start saying "an org is a policy enforced by the facilitator over a shared membership set". This phrasing is baked into REQUIREMENTS.md, PROJECT.md, the README, and the pitch script. Any deviation is a narrative regression.

### Scope Cut Order (Pitfalls §15 — authoritative)

When the day slips and something has to die, cut in this order. Re-read this list at the start of every working day BEFORE opening an editor.

1. **Dashboard polish** — collapse to a static `<table>`; no charts, no filters, no design system.
2. **Enclave Gate as an independent package** — collapse into a gated route inside the Enclave Treasury demo. `gate/` stays a directory, not a published package.
3. **Post-paper as PDF** — move to a README section.
4. **Bilingual README** — English only.
5. **Live proof generation in the video** — pre-generate fixtures, state honestly in README.
6. **Third org** — two orgs (Northfield Capital + Ashford Partners) suffice to prove coexistence; drop Bayridge Capital.
7. **Real USDC settlement (last resort)** — mock facilitator logs "would have settled", only if the bridge is genuinely impossible by day 6.

**Never cut:** shielded pool multi-org coexistence (the thesis), on-chain proof verification (the credibility), the ≤3-min video, the testnet deploy, the honest README, Apache 2.0 + LGPL compliance, upstream credit to Nethermind/SDF.

### Daily Pact

Before writing any code today, answer three questions aloud:
1. What phase am I in?
2. What's the next cut if today slips?
3. Did I re-read the cut order above?

---

## Risk Ledger — Top 5 Pitfalls and Where They Die

These are the five pitfalls from `research/PITFALLS.md` that can kill the submission single-handed. Each is tied to the phase that defuses it.

| # | Pitfall | Lethality | Defused in | How it dies |
|---|---------|-----------|------------|-------------|
| 1 | **Per-org on-chain ASPs are impossible** — pool contract hard-codes one ASP root; three deployed ASPs can't route (Pitfall 1) | Extinction event (the entire plan falls apart at deploy time) | **Phase 0** | Narrative locked in writing across PROJECT.md, REQUIREMENTS.md, README, pitch script on day 1. SETUP-07. |
| 2 | **Prover is browser-WASM-only** — Node-native path may not exist; SDK can't generate proofs without either napi-rs bindings or a Playwright fallback (Pitfall 6) | Blocks SDK + agent demo entirely | **Phase 0 (benchmark)** → Phase 3 (integration) | Day-1 benchmark records Node vs browser vs Playwright proving times in `docs/benchmarks.md`. SETUP-06. If >3s, fallback is Playwright + pre-generated fixtures. |
| 3 | **TTL expiry + RPC 7-day retention** — pool storage TTL expires mid-demo; events outside 7-day window break indexer (Pitfalls 10, 11) | Testnet deploy dies silently during recording | **Phase 0 (smoke test)** + Phase 5 (preflight) | Day-1 `stellar contract invoke -- get_root` against deployed pool; daily `contract extend` routine; `scripts/preflight.sh` blocks recording if TTL <48h or oldest event >6 days. SETUP-05, OPS-01, OPS-02. |
| 4 | 1/2 | In Progress|  | Day-1 end-to-end `transact` against the deployed testnet pool. If it reverts with OOG, scope pivots immediately to mock facilitator + cached proofs; narrative becomes "proof-of-concept pending mainnet budget tuning". SETUP-05. |
| 5 | 3/7 | In Progress|  | Day 5 = rehearsal + backup recording; day 6 = final recording; day 7 = rescue + submission buffer. DEMO-05. |

### Day-1 Kill Switches (all in Phase 0)

If ANY of these fail on day 1, the scope pivots the same morning:

- **(a) Smoke test fails** (`get_root` errors, TTL expired, verifier OOGs on a real `transact`) → pivot to mock facilitator + cached proofs; narrative becomes "PoC on top of the deployed pool; on-chain verification shown against a checked-in local deploy". Cut order accelerates: cuts 5, 6, 7 apply preemptively.
- **(b) Prover-in-Node benchmark >3s for `policy_tx_2_2`** → SDK ships with Playwright fallback, not napi-rs bindings; live proving is cut from the video (cut 5 applied preemptively); pre-generated fixtures become the demo path.
- **(c) Narrative can't be reconciled to the shared-ASP + off-chain-policy model** → project is blocked; do not proceed to Phase 1 until PROJECT.md, REQUIREMENTS.md, README skeleton, and pitch script all say the same thing in writing.

**Rule:** Phase 0 is the ONLY phase that has permission to stop the project. After Phase 0, every slip is absorbed via the cut order, not a pivot.

---

## Phases

- [ ] **Phase 0: Setup & Day-1 De-risking** — Lock narrative, run smoke test, benchmark prover, verify TTL, preserve license, scan for secrets.
- [x] **Phase 1: Pool Integration & Multi-Org Namespace** — Wire existing pool, model orgs as off-chain namespaces, implement org bootstrap + enrollment + pre-funding. (completed 2026-04-12)
- [x] **Phase 2: Facilitator Bridge** — Build the shielded-proof → USDC x402 settlement service with replay protection, policy enforcement, and `/health`. (completed 2026-04-12)
- [x] **Phase 3: Agent SDK (`@enclave/agent`)** — Ship the Node-runnable agent client with proving, key hygiene, and structured logging. (completed 2026-04-12)
- [x] **Phase 03.1: Agent Wire Format Fix** (INSERTED) — Populate ShieldedProofWireFormat public inputs from `publicInputBytes` in fetch-interceptor. Unblocks agent → facilitator → pool e2e. (completed 2026-04-12)
- [ ] **Phase 4: Enclave Gate Middleware + Gated Endpoint** — Add the `withEnclaveGate` middleware, one gated demo endpoint, and the enrollment-freeze discipline.
- [ ] **Phase 5: Dashboard + Ops Hardening** — Local-only dashboard, preflight script, TTL cron, cached demo fixtures.
- [ ] **Phase 6: Demo Recording + Submission** — Rehearsal, final recording, README, DoraHacks writeup, submission.

## Phase Details

### Phase 0: Setup & Day-1 De-risking
**Goal**: Kill the four silent killers (narrative ambiguity, prover-in-Node uncertainty, testnet infrastructure rot, null-input ASP semantics) on day 1 before writing any product code.
**Depends on**: Nothing (first phase).
**Requirements**: SETUP-01, SETUP-02, SETUP-03, SETUP-04, SETUP-05, SETUP-06, SETUP-07, POOL-08, OPS-04, OPS-05.
**Success Criteria** (what must be TRUE):
  1. PROJECT.md, REQUIREMENTS.md, a README stub, and a pitch-script draft all state "shared on-chain ASP, per-org policy off-chain" verbatim — no residual "per-org ASP" phrasing anywhere (SETUP-07).
  2. `stellar contract invoke --id <pool> -- get_root` succeeds against our freshly-deployed Enclave pool AND a full `transact` dry-run with a pre-built proof verifies on-chain without OOG (SETUP-05 + Pitfall 14 defusal).
  3. `docs/benchmarks.md` exists and contains a measured proof-generation time for `policy_tx_2_2` on the target runtime (Node WASM, browser WASM, and/or Playwright), with a clear winner picked for the SDK path (SETUP-06).
  4. Branch `feat/phase-0` exists locally off `develop` with no remote `origin` pointing at NethermindEth; `git diff upstream/main -- LICENSE NOTICE circuits/LICENSE` returns empty; new-code directories are scaffolded (`facilitator/`, `treasury/`, `gate/`, `apps/demo/`, SDK packages); upstream dirs untouched (SETUP-01, SETUP-02, SETUP-03).
  5. A `git secrets` / manual scan on day 1 confirms `.gitignore` blocks `*.key`, `.env`, `secrets/`, `wallets/`, and no key material is committed; the scope cut order from PITFALLS §15 lives at the top of THIS roadmap and Franco has re-read it (OPS-04, OPS-05).
  6. Null-input behavior of the upstream WASM prover is empirically verified (does the prover use the depositor's own publicKey, or a hardcoded null publicKey, for the unused inputs of a 2-in/2-out witness?). The finding is documented in `docs/benchmarks.md` and the deploy script for Phase 1 is parameterized accordingly (POOL-08).
**Plans**: 5 plans
  - [ ] 00-01-PLAN.md — Branch hygiene, license guard, .gitignore hardening, secrets scan, cut-order re-read (SETUP-01, SETUP-03, OPS-04, OPS-05)
  - [ ] 00-02-PLAN.md — npm workspaces scaffold + six stub packages (@enclave/core types + constants, agent, facilitator, treasury, gate, apps/demo) (SETUP-02)
  - [ ] 00-03-PLAN.md — Narrative lock: scrub PROJECT.md residual per-org-ASP claims, rewrite README as Enclave with credits, draft PITCH.md, SETUP-07 forbidden-phrase grep (SETUP-04, SETUP-07)
  - [ ] 00-04-PLAN.md — Fresh testnet deploy + smoke test: scripts/smoke-test.sh runs get_root + transact dry-run, Pitfall 14 triage checkpoint with kill-switch decision (SETUP-05)
  - [ ] 00-05-PLAN.md — Prover benchmark (Node WASM → Playwright fallback) + POOL-08 empirical null-input witness dump, docs/benchmarks.md winner commit, Day-1 Kill Switch (b) checkpoint (SETUP-06, POOL-08)

**Cut decision if Phase 0 slips:** Phase 0 does NOT slip — it pivots. If the smoke test or verification fails, apply day-1 kill switches above (mock facilitator, cached proofs, preemptive cuts 5/6/7). If the prover benchmark fails, the SDK ships with Playwright fallback and live proving is dropped from the video. If narrative reconciliation takes all of day 1, that is the correct use of day 1 — do not start Phase 1 until narrative is locked.

---

### Phase 1: Pool Integration & Multi-Org Namespace
**Goal**: Deploy our own fresh instances of the upstream Soroban contracts on testnet (we are admin), then prove three fictional orgs coexist in the single shared shielded pool as off-chain namespaces with zero cross-org leakage on-chain. Each org admin self-bootstraps with one on-chain ASP insert.
**Depends on**: Phase 0 (narrative locked, smoke test passed, benchmark recorded, null-input semantics verified).
**Requirements**: POOL-01, POOL-02, POOL-03, POOL-04, POOL-05, POOL-06, POOL-07, ORG-01, ORG-02, ORG-03, ORG-05.
**Success Criteria** (what must be TRUE):
  1. The four upstream contracts (`pool`, `asp-membership`, `asp-non-membership`, `circom-groth16-verifier`) are redeployed as fresh instances on testnet with us as admin of all four; source code is unmodified; addresses are written to `deployments.json` (POOL-01).
  2. The deploy script calls `set_admin_insert_only(false)` on our `asp-membership` instance and verifies the flag is `false` afterwards, enabling permissionless self-insert by org admins (POOL-06). The `asp-non-membership` SMT is initialized empty, the empty-tree root is recorded in `deployments.json`, and no banlist entries are added during the MVP (POOL-07). If POOL-08 found that the prover uses a hardcoded null publicKey, the deploy script also pre-inserts a single `Poseidon2(nullPubKey, 0)` leaf into `asp-membership`.
  3. Northfield Capital, Ashford Partners, and Bayridge Capital each bootstrap via a single CLI command that (a) generates an admin keypair locally, (b) generates ONE shared `orgSpendingPubKey` per Model X, (c) submits exactly one on-chain tx — `asp_membership.insert_leaf(Poseidon2(orgSpendingPubKey, 0))` signed and gas-paid by the org admin — and (d) writes the org row to the off-chain registry. Blinding is the deterministic constant `0` (ORG-01, ORG-05, POOL-03).
  4. An org admin can enroll new agent members under an existing org via a CLI command that performs **zero on-chain txs**: it generates an agent auth keypair, hands the agent the shared `orgSpendingPubKey`, and writes the agent's auth key to the registry. An org admin can pre-fund the treasury with testnet USDC; deposited notes are bound to the `orgSpendingPubKey` and tagged in the off-chain registry (ORG-02, ORG-03).
  5. A ciphertext-length parity test confirms `encrypted_output` blob lengths are indistinguishable across orgs; no on-chain field, event, or ciphertext length reveals `org_id` (POOL-02, POOL-04).
  6. `scripts/preflight.sh` contains a `pool-ttl-bump` subcommand that bumps the pool + ASP contracts' persistent storage TTL; the routine is documented and runs green (POOL-05).
**Plans**: TBD

**Cut decision if Phase 1 slips:** Drop Bayridge Capital — two orgs (Northfield Capital + Ashford Partners) are enough to prove coexistence (cut 6 from the order). If deposit flow is flaky, pre-seed the registry and mark treasuries as "pre-deposited" in the README; do NOT cut POOL-02/04 (they are the thesis). If `set_admin_insert_only(false)` fails for any reason, fall back to having the facilitator-admin call `insert_leaf` on behalf of orgs — the bootstrap CLI hands the leaf to the facilitator instead of submitting it directly. Do NOT cut POOL-06/07 (they are cheap one-time deploy actions).

---

### Phase 2: Facilitator Bridge
**Goal**: Build the shielded-proof → public USDC x402 settlement service AND the meta-tx gas relayer for `pool.transact()` — the single highest-risk component, scheduled early so slippage is absorbed by later phases, not the demo.
**Depends on**: Phase 1 (pool + org registry exists; agents have shared org keys that can produce proofs).
**Requirements**: FACIL-01, FACIL-03, FACIL-04, FACIL-05, FACIL-06, FACIL-07, FACIL-08. (~~FACIL-02~~ cut 2026-04-11 — shielded balance is the natural cap; no off-chain policy needed.)
**Success Criteria** (what must be TRUE):
  1. The facilitator accepts a shielded x402 proof, verifies it on-chain via the existing Groth16 verifier, and — on success — forwards a real testnet USDC x402 payment from its own float to the endpoint's `payTo`; receiving endpoints see an unmodified x402 flow (FACIL-01).
  2. The facilitator submits the agent's `pool.transact()` Soroban tx itself, paying the XLM gas from its own gas float (meta-tx / relayer model). Agents never need their own XLM. The flow is: agent posts proof → facilitator verifies → facilitator submits `pool.transact()` → on success facilitator settles USDC → returns HTTP 200 (FACIL-08).
  3. A replay test (same proof submitted twice) returns HTTP 409 on the second attempt; the facilitator validates that the proof commits to the claimed `payTo`, `maxAmountRequired`, and `resource` — mismatches are rejected (FACIL-03, FACIL-04).
  4. USDC settles synchronously before HTTP 200 is returned — no "200 + silent settlement failure" path (FACIL-06).
  5. `/health` reports USDC float balance, **XLM gas float balance**, last-seen pool root, and readiness; both floats are seeded with ≥3× the expected demo budget before recording day (FACIL-05, FACIL-07, FACIL-08).
**Plans**: 8 plans across 4 waves (wave 0 test infra → wave 1 primitives → wave 2 chain + config + mock → wave 3 HTTP app + CLI)
- [ ] 02-01-PLAN.md — Wave 0 test infra: facilitator workspace package.json, vitest/tsup config, canonical fixtures, test helpers
- [x] 02-02-PLAN.md — @enclave/core Phase 2 types, hashExtData Node port, structural bindingCheck (completed 2026-04-12)
- [ ] 02-03-PLAN.md — TOCTOU-safe NullifierCache primitive (peek/tryClaim/commit/release/hydrate)
- [ ] 02-04-PLAN.md — checkSolvency pure validator + Horizon/Soroban balance reader
- [ ] 02-05-PLAN.md — buildPoolTransactArgs, simulatePoolTransaction, submitPoolTransaction, errorMapping
- [ ] 02-06-PLAN.md — Env config class, hydrateNullifierCache RPC event scanner, mock mode offChainVerify (snarkjs)
- [ ] 02-07-PLAN.md — HTTP app factory, /verify + /settle + /supported + /health routes, bootstrap entrypoint
- [ ] 02-08-PLAN.md — bootstrap CLI (keygen + friendbot), live testnet e2e spec, demo-lock requirement coverage test

**Cut decision if Phase 2 slips:** Apply cut 7 — mock facilitator logs "would have settled" with fake `tx_id`; Stellar Expert link in the video points at a pre-recorded real settlement from rehearsal day. This is the last-resort cut; take it no later than end of day 3, not day 6. If it happens earlier, update README to say "facilitator bridge demoed against a pre-recorded settlement" and move on.

---

### Phase 3: Agent SDK (`@enclave/agent`)
**Goal**: Ship the Node-runnable SDK an autonomous agent imports to pay x402 endpoints transparently from org funds, using the shared org spending key (Model X).
**Depends on**: Phase 0 (prover path chosen, null-input semantics verified) + Phase 2 (facilitator exists to talk to, meta-tx relayer is live).
**Requirements**: SDK-01, SDK-02, SDK-03, SDK-04, SDK-05, SDK-06, SDK-07.
**Success Criteria** (what must be TRUE):
  1. An agent is instantiated from an org's derived agent auth key + the shared `orgSpendingPubKey`, and used as `agent.fetch(url)`; the SDK transparently handles x402 402-challenge → proof-generation → POST to facilitator → HTTP 200 (SDK-01).
  2. The SDK produces a shielded proof compatible with the existing `policy_tx_2_2` circuit layout — zero public-input-layout changes; the proving key + witness calculator load from a configurable local path and never over the network at runtime (SDK-02, SDK-03).
  3. The SDK constructs witnesses using the shared `orgSpendingPubKey` for **both real and null inputs** (Model X). The agent never holds its own spending key — only an auth key for facilitator authentication. The blinding factor for ASP membership proofs is hardcoded to `0` per ORG-05. A unit test verifies that two different agents from the same org produce proofs that share the same input keypair material (SDK-07).
  4. The Node-runnable proving path works end-to-end against a real facilitator — either Node WASM or Playwright-driven Chromium, per the Phase-0 benchmark decision (SDK-04).
  5. Agent private keys (auth keys + the shared org spending key) live in env vars or local files outside the repo; `.gitignore` blocks `*.key`, `.env`, `secrets/`, `wallets/`; structured logs auto-redact keys, nullifiers, and raw payloads and a redaction test confirms no secret survives the pipeline (SDK-05, SDK-06).
**Plans**: 5 plans across 4 waves (wave 0 scaffold → wave 1 config+logger+prover → wave 2 witness → wave 3 fetch+wiring)
- [x] 03-01-PLAN.md — Wave 0: Jest + ts-jest scaffold, all source module stubs, types (EnclaveNote/AgentBundle/ExtData/EnclavePaymentError), .gitignore additions
- [x] 03-02-PLAN.md — Wave 1: config loader (ENCLAVE_BUNDLE_PATH/NOTES_PATH/PROVING_ARTIFACTS_PATH), pino logger with redact paths (SDK-05, SDK-06)
- [x] 03-03-PLAN.md — Wave 1: WASM prover wrapper via createRequire, prove() returning 128-byte proof, derivePublicKey (SDK-02, SDK-03, SDK-04)
- [x] 03-04-PLAN.md — Wave 2: buildWitnessInputs() Model X — inPrivateKey[0]==[1]==orgSpendingPrivKey, blinding=0 (SDK-07)
- [x] 03-05-PLAN.md — Wave 3: fetch interceptor 402->prove->settle->retry pipeline, note selector, fixture mode, createAgent() wiring (SDK-01)

**Cut decision if Phase 3 slips:** Ship the SDK with Playwright-only proving (drop the Node WASM path), apply cut 5 (pre-generated proofs for the video). The drop-in `agent.fetch(url)` API is non-negotiable — even if proofs are cached, the call site in the demo must look like "agent calls fetch, payment happens". If the SDK is fundamentally broken, the demo replaces `agent.fetch` with a shell script that posts a pre-built proof to the facilitator; the narrative drops "autonomous agent" and becomes "programmatic client".

---

### Phase 03.1: Agent Wire Format Fix (INSERTED)

**Goal:** Populate the 8 missing ShieldedProofWireFormat public-input fields in `packages/agent/src/fetch-interceptor.ts` by decomposing `proveResult.publicInputBytes` (352 bytes = 11 × 32-byte LE field elements) into the correct wire-format strings (7 decimal u256 strings + 1 big-endian hex string for `extDataHash`). Canonical ordering taken from `circuits/src/policy_tx_2_2.circom` line 10 and cross-checked against `contracts/pool/src/pool.rs` lines 405-436. Closes 03-05 deviation 6. Unblocks the full agent → facilitator → pool e2e flow required by the demo.
**Requirements**: SDK-01 (reused — no new ID; closes the wire-format sub-gap of agent.fetch transparent 402 handling that 03-VERIFICATION flagged as human_needed)
**Depends on:** Phase 3
**Plans:** 1/1 plans complete

Plans:
- [ ] 03.1-01-PLAN.md — decomposePublicInputs helper + fetch-interceptor wiring (live + fixture paths) + test upgrade (SDK-01 wire-format closure)

### Phase 4: Enclave Gate Middleware + Gated Endpoint
**Goal**: Ship the second demo layer — an HTTP middleware that gates an endpoint by ZK membership in an org — and freeze enrollment for recording.
**Depends on**: Phase 3 (SDK produces proofs the middleware can verify).
**Requirements**: GATE-01, GATE-02, GATE-03, GATE-04, ORG-04.
**Success Criteria** (what must be TRUE):
  1. A `withEnclaveGate({ orgId })` Next.js middleware wraps a demo endpoint in `apps/demo/` and only serves callers presenting a valid shielded proof of membership in that org; the middleware rejects replayed proofs via nonce + nullifier tracking (GATE-01, GATE-02).
  2. Per-request verification latency stays under 3s on the demo machine (well below the 10s Vercel function timeout); a latency assertion runs in the e2e smoke test (GATE-03).
  3. A Northfield Capital agent successfully calls the gated endpoint; the same endpoint returns 402 to Ashford Partners and Bayridge Capital agents — recorded in a screen capture for the video (GATE-04).
  4. `scripts/preflight.sh` enforces `REGISTRY_FROZEN=1` before demo recording; attempts to enroll new members during the freeze window fail loudly (ORG-04, Pitfall 3 defusal).
**Plans**: 2 plans across 2 waves (wave 1: gate middleware package; wave 2: demo app + enrollment freeze)
Plans:
- [ ] 04-01-PLAN.md — @enclave/gate middleware package: withEnclaveGate factory, facilitatorClient, env config, types, unit tests (GATE-01, GATE-02, GATE-03)
- [ ] 04-02-PLAN.md — Demo app gated endpoint + enrollment freeze: Express app at apps/demo/, org-scoping, preflight freeze-check, browser freeze guard, e2e latency test (GATE-04, ORG-04)

**Cut decision if Phase 4 slips:** Apply cut 2 — Enclave Gate is NOT published as `@gate/middleware`; it lives as a single file in `apps/demo/` and is described as "a gated route inside the Enclave Treasury demo" in the README. If the middleware itself is broken, the video narration swaps Enclave Gate for a "roadmap preview" slide ("Enclave Gate — coming in week 2") and the demo shows only the Enclave Treasury facilitator flow. Do NOT cut the enrollment freeze (ORG-04) regardless — it defuses Pitfall 3 and is cheap.

---

### Phase 5: Dashboard + Ops Hardening
**Goal**: Give the owner a visible "inside view" of their org and lock down the infrastructure so the recording doesn't die of boring causes (TTL, event retention, unseeded float).
**Depends on**: Phase 4 (everything that writes to the registry is done).
**Requirements**: DASH-01, DASH-02, DASH-03, OPS-01, OPS-02, OPS-03.
**Success Criteria** (what must be TRUE):
  1. A local-only Next.js dashboard (no public hosting) lets an org owner log in with the admin key and view treasury balance, agent roster, and spend history as plain HTML tables — no charts, no filters, no design system (DASH-01, DASH-03).
  2. A non-admin client (e.g., Ashford Partners admin) loading Northfield Capital's dashboard sees zero leakage — treasury, agents, and history all hidden; a manual cross-org check confirms the isolation (DASH-02).
  3. `scripts/preflight.sh` checks in one green run: pool TTL >48h, facilitator `/health` OK, float > threshold, RPC oldest event <6 days, `deployments.json` addresses live, `REGISTRY_FROZEN=1` set (OPS-01).
  4. A daily `contract extend` routine (cron or manual, documented) keeps pool + ASPs + verifier TTL fresh through 2026-04-17 (OPS-02).
  5. Pre-generated proofs for the demo flow live under `demo/fixtures/`; the README states explicitly that recording uses pre-generated proofs (OPS-03, cut 5 pre-applied defensively).
**Plans**: 7 plans across 3 waves (wave 1 parallel primitives -> wave 2 dashboard UI -> wave 3 end-to-end verification)
  - [ ] 05-01-facilitator-settlements-log.md - Persistent /settlements log on the facilitator (DASH-01 spend-history source; wave 1)
  - [ ] 05-02-deposit-nullifier-precompute.md - Registry schema bump + deposit-time nullifier precompute via computeNullifier (DASH-01 bug-proof cross-reference; wave 1)
  - [ ] 05-03-sdk-fixture-capture-mode.md - ENCLAVE_FIXTURE_CAPTURE=1 branch in the agent SDK (OPS-03; wave 1)
  - [ ] 05-04-preflight-full-check.md - scripts/preflight.sh full-check subcommand with 6 OPS-01 gates + bats tests (OPS-01; wave 1)
  - [ ] 05-05-ops02-daily-ttl-routine-docs.md - RUNBOOK.md + README Operations section documenting the daily pool-ttl-bump (OPS-02; wave 1)
  - [ ] 05-06-dashboard-ui.md - Dashboard section inside app/enclave.html: paste-key login, three HTML tables, cross-org isolation (DASH-01, DASH-02, DASH-03; wave 2)
  - [ ] 05-07-e2e-verification.md - Capture-mode dry run + live full-check + DASH-02 manual check + README claim hygiene (all six reqs; wave 3)

**Cut decision if Phase 5 slips:** Apply cut 1 — the dashboard becomes a single `GET /dashboard/:orgId` returning a bare `<table>`; no login, no multi-page navigation. Do NOT cut `scripts/preflight.sh` or the TTL routine — they are the insurance policy for the recording day.

---

### Phase 6: Demo Recording + Submission
**Goal**: Record, rehearse, record again, ship on time — with day 7 reserved as pure rescue/submission buffer.
**Depends on**: Phase 5 (preflight green, fixtures cached, dashboard visible).
**Requirements**: DEMO-01, DEMO-02, DEMO-03, DEMO-04, DEMO-05, DEMO-06.
**Success Criteria** (what must be TRUE):
  1. Day 5 (2026-04-15): rehearsal recording captured as a backup; `scripts/preflight.sh` green; a first pass of the video exists, even if imperfect (DEMO-05).
  2. Day 6 (2026-04-16): final recording captured — ≤3 minutes, shows (a) three orgs coexisting in one pool (or two, if cut 6 applied), (b) an agent paying an x402 endpoint via the facilitator, (c) Stellar Expert showing on-chain USDC settlement, (d) the Enclave Gate-gated endpoint refusing a non-member agent (or the "coming soon" slide if cut 2 applied) (DEMO-02, DEMO-05).
  3. The public GitHub repo (the fork of `NethermindEth/stellar-private-payments`) has a README that explains the product, the shared-ASP + off-chain-policy architecture, upstream credit to Nethermind/SDF, Apache 2.0 + LGPL obligations, and a quickstart (DEMO-01).
  4. At submission time, `scripts/preflight.sh` returns zero errors against the live testnet deployment: facilitator `/health`, demo endpoints, pool contract all respond (DEMO-03).
  5. The DoraHacks writeup is submitted by 2026-04-17 with links to the repo, the video, the testnet contract addresses, and the README; the video narration does NOT claim per-org on-chain ASPs, per-org anonymity sets, mainnet readiness, or security audit status (DEMO-04, DEMO-06).
**Plans**: 4 plans
  - [ ] 06-01-readme-delta-groundwork.md — README delta: architecture image + Testnet Contracts section rendered from deployments.json + YouTube/DoraHacks URL placeholder slots (DEMO-01, DEMO-06; wave 1 — pre-Day 5 prep)
  - [ ] 06-02-day5-rehearsal-dorahacks-draft.md — Day 5 rehearsal recording (DEMO-05 backup) + DoraHacks writeup draft with Franco opener (DEMO-04 draft, DEMO-06; wave 2 — 2026-04-15)
  - [ ] 06-03-day6-final-recording-youtube-upload.md — Day 6 final recording + CapCut export + YouTube unlisted upload + README URL substitution (DEMO-02, DEMO-05, DEMO-01, DEMO-06; wave 3 — 2026-04-16)
  - [ ] 06-04-day7-submission-dorahacks-publish.md — Final preflight against live testnet + DoraHacks publish + final claim-hygiene grep (DEMO-03, DEMO-04, DEMO-01, DEMO-06; wave 4 — 2026-04-16/17)

**Cut decision if Phase 6 slips:** Day 7 is the buffer — use it. If day 6 recording fails, day 7 is one last re-take using the day-5 backup as fallback narration. If day 7 is also lost, submit with the day-5 backup video and a README apology. Apply cut 3 (drop post-paper PDF, fold into README section) and cut 4 (English-only README) preemptively before day 5 to free the recording window. Under NO circumstances miss the 2026-04-17 submission deadline — an imperfect submission beats a perfect miss.

---

## Daily Cadence

Solo builder, one day per phase as the default, with overlap allowed on low-risk phases and explicit buffer on the recording side.

| Day | Date | Primary phase(s) | Morning | Afternoon | Explicit risk |
|-----|------|------------------|---------|-----------|---------------|
| 1 | 2026-04-10 (Fri) | **Phase 0** (all day) + Phase 1 kickoff if narrative locks early | Re-read cut order, lock narrative (SETUP-07), scaffold branches + dirs (SETUP-01/02/03), license audit (SETUP-04) | Run smoke test (SETUP-05), record prover benchmark (SETUP-06), verify null-input prover behavior (POOL-08), secrets scan (OPS-04) | All four day-1 kill switches live today (narrative, smoke test, prover benchmark, null-input semantics). If any fails, pivot before starting Phase 1. |
| 2 | 2026-04-11 (Sat) | **Phase 1** (all day) | Deploy fresh contract instances + `set_admin_insert_only(false)` (POOL-01, POOL-06, POOL-07); scaffold `treasury/` core; org bootstrap CLI with self-insert (ORG-01); shared key derivation Model X (POOL-03, ORG-05) | Agent enrollment off-chain (ORG-02), pre-funding deposits (ORG-03), ciphertext-length parity test (POOL-04), TTL bump routine (POOL-05) | Multi-org coexistence is the thesis — do not move to Phase 2 until the parity test passes AND three orgs have successfully self-inserted into the deployed `asp-membership` contract. |
| 3 | 2026-04-12 (Sun) | **Phase 2** (all day — riskiest phase, front-loaded) | Facilitator scaffolding; accept proof + on-chain verify (FACIL-01); meta-tx relayer for `pool.transact()` (FACIL-08); replay protection (FACIL-03, FACIL-04) | Synchronous settlement (FACIL-06); `/health` with USDC + XLM gas float (FACIL-05); float seed script (FACIL-07) | Facilitator is the highest-risk component. If blocked end-of-day, take cut 7 (mock facilitator) tomorrow morning — do NOT push into day 4. |
| 4 | 2026-04-13 (Mon) | **Phase 3** (all day) + Phase 4 kickoff in evening if SDK lands early | Agent SDK scaffolding; `agent.fetch` (SDK-01); shared org key for real + null inputs (SDK-07); proving path wired from Phase-0 benchmark decision (SDK-02, SDK-03, SDK-04) | Key hygiene (SDK-05); structured logging + redaction test (SDK-06); start `withEnclaveGate` middleware if there's daylight | If SDK proving is broken by noon, swap to Playwright fallback without arguing; do not burn afternoon debugging napi-rs. |
| 5 | 2026-04-14 (Tue) | **Phase 4** (AM) + **Phase 5** (PM) | Finish `withEnclaveGate` middleware (GATE-01..04); Northfield Capital-only gated endpoint; enrollment freeze (ORG-04) | Dashboard (DASH-01..03); `scripts/preflight.sh` (OPS-01); TTL cron (OPS-02); cache demo fixtures (OPS-03) | This is the most packed day — DO NOT let Enclave Gate eat into Phase 5. If Enclave Gate is not done by noon, apply cut 2 (collapse to a route) and move on. |
| 6 | 2026-04-15 (Wed) | **Phase 6 rehearsal** (DEMO-05 — rehearsal + backup recording, per Pitfall 17) | Record rehearsal video end-to-end (backup in the can); finalize README (DEMO-01) | Write DoraHacks draft (DEMO-04); run preflight (DEMO-03); review narration for claim hygiene (DEMO-06) | Mandated by Pitfall 17. Do NOT skip the rehearsal recording — it is the insurance policy for day 7. |
| 7 | 2026-04-16 (Thu) | **Phase 6 final recording** (DEMO-02, DEMO-05) | Final video recording; upload to unlisted YouTube | Final preflight; push README; upload DoraHacks writeup (DEMO-04); submit | If final recording fails, submit the day-6 rehearsal cut. |
| 8 | 2026-04-17 (Fri) | **Submission + rescue buffer** | Re-run preflight against live testnet; verify submission links resolve | Emergency re-record only if something broke overnight | Hard deadline: 2026-04-17. An imperfect submission beats a perfect miss. |

**Note on the 7-vs-8-day count:** The hackathon window is 2026-04-10 through 2026-04-17 inclusive = 8 calendar days. The cadence above uses day 5 (2026-04-14) as the last pure-build day, day 6 (2026-04-15) as rehearsal-per-Pitfall-17, day 7 (2026-04-16) as final recording, day 8 (2026-04-17) as rescue + submission buffer. This matches DEMO-05 ("rehearsal on day 5, final on day 6, submission by day 7") modulo the inclusive count. **Do not re-interpret the dates — the clock is the clock.**

---

## Requirement → Phase Traceability

All 54 v1 requirements from REQUIREMENTS.md, mapped to exactly one phase. Zero unmapped.

| Requirement | Phase | Category |
|-------------|-------|----------|
| SETUP-01 | Phase 0 | Setup & Fork Hygiene |
| SETUP-02 | Phase 0 | Setup & Fork Hygiene |
| SETUP-03 | Phase 0 | Setup & Fork Hygiene |
| SETUP-04 | Phase 0 | Setup & Fork Hygiene |
| SETUP-05 | Phase 0 | Setup & Fork Hygiene (day-1 smoke test, Pitfalls 10/14) |
| SETUP-06 | Phase 0 | Setup & Fork Hygiene (day-1 prover benchmark, Pitfall 6) |
| SETUP-07 | Phase 0 | Setup & Fork Hygiene (narrative lock, Pitfall 1) |
| POOL-01 | Phase 1 | Shielded Pool Integration (fresh redeploy as admin) |
| POOL-02 | Phase 1 | Shielded Pool Integration |
| POOL-03 | Phase 1 | Shielded Pool Integration (Model X shared key) |
| POOL-04 | Phase 1 | Shielded Pool Integration (Pitfall 8) |
| POOL-05 | Phase 1 | Shielded Pool Integration (Pitfall 10) |
| POOL-06 | Phase 1 | Shielded Pool Integration (permissionless asp-membership) |
| POOL-07 | Phase 1 | Shielded Pool Integration (empty asp-non-membership) |
| POOL-08 | Phase 0 | Shielded Pool Integration (null-input prover research, day-1 kill switch) |
| ORG-01 | Phase 1 | Org Lifecycle (CLI bootstrap + self-insert) |
| ORG-02 | Phase 1 | Org Lifecycle (off-chain agent enrollment) |
| ORG-03 | Phase 1 | Org Lifecycle |
| ORG-04 | Phase 4 | Org Lifecycle (enrollment freeze, Pitfall 3) |
| ORG-05 | Phase 1 | Org Lifecycle (deterministic blinding=0) |
| FACIL-01 | Phase 2 | Facilitator Bridge |
| ~~FACIL-02~~ | ~~Phase 2~~ | **Cut 2026-04-11** — shielded balance is natural cap; facilitator stateless re orgs |
| FACIL-03 | Phase 2 | Facilitator Bridge (Pitfall 5) |
| FACIL-04 | Phase 2 | Facilitator Bridge (Pitfall 5) |
| FACIL-05 | Phase 2 | Facilitator Bridge |
| FACIL-06 | Phase 2 | Facilitator Bridge (Pitfall 4) |
| FACIL-07 | Phase 2 | Facilitator Bridge (Pitfall 4) |
| FACIL-08 | Phase 2 | Facilitator Bridge (meta-tx gas relayer) |
| SDK-01 | Phase 3 | Agent SDK |
| SDK-02 | Phase 3 | Agent SDK |
| SDK-03 | Phase 3 | Agent SDK |
| SDK-04 | Phase 3 | Agent SDK (Pitfall 6) |
| SDK-05 | Phase 3 | Agent SDK (Pitfall 12) |
| SDK-06 | Phase 3 | Agent SDK (Pitfall 12) |
| SDK-07 | Phase 3 | Agent SDK (Model X shared key for real + null inputs) |
| GATE-01 | Phase 4 | Enclave Gate Middleware |
| GATE-02 | Phase 4 | Enclave Gate Middleware (Pitfall 13) |
| GATE-03 | Phase 4 | Enclave Gate Middleware (Pitfall 13) |
| GATE-04 | Phase 4 | Enclave Gate Middleware |
| DASH-01 | Phase 5 | Local Demo Dashboard |
| DASH-02 | Phase 5 | Local Demo Dashboard |
| DASH-03 | Phase 5 | Local Demo Dashboard (cut 1 preempt) |
| DEMO-01 | Phase 6 | Hackathon Deliverables |
| DEMO-02 | Phase 6 | Hackathon Deliverables |
| DEMO-03 | Phase 6 | Hackathon Deliverables |
| DEMO-04 | Phase 6 | Hackathon Deliverables |
| DEMO-05 | Phase 6 | Hackathon Deliverables (Pitfall 17) |
| DEMO-06 | Phase 6 | Hackathon Deliverables (Pitfall 1 claim hygiene) |
| OPS-01 | Phase 5 | Operational Hardening |
| OPS-02 | Phase 5 | Operational Hardening (Pitfall 10) |
| OPS-03 | Phase 5 | Operational Hardening (cut 5 preempt, Pitfall 17) |
| OPS-04 | Phase 0 | Operational Hardening (Pitfall 12) |
| OPS-05 | Phase 0 | Operational Hardening (cut order discipline) |

**Coverage:**
- v1 requirements total: **54**
- Mapped to phases: **54** ✓
- Unmapped: **0**
- Requirements per phase: Phase 0 = 10, Phase 1 = 12, Phase 2 = 8, Phase 3 = 7, Phase 4 = 5, Phase 5 = 6, Phase 6 = 6 → **54 total ✓**

---

## Exit Criteria — What MUST Be True on 2026-04-17

For the hackathon submission to go out, ALL of the following must be verifiable:

1. **Public GitHub repo** exists as a fork of `NethermindEth/stellar-private-payments`, with README explaining product + architecture ("shared on-chain ASP + per-org policy off-chain"), upstream credit to Nethermind/SDF, Apache 2.0 + LGPL obligations, and a quickstart. (DEMO-01)
2. **Video ≤3 minutes** uploaded to an unlisted YouTube URL showing: (a) orgs coexisting in one pool, (b) an agent paying an x402 endpoint via the facilitator, (c) Stellar Expert showing the USDC settlement, (d) a Enclave Gate-gated endpoint refusing a non-member (or a graceful "coming soon" slide if cut 2 applied). The narration does NOT claim per-org on-chain ASPs, per-org anonymity sets, mainnet readiness, or audit status. (DEMO-02, DEMO-06)
3. **Testnet deployment live** — `scripts/preflight.sh` returns zero errors against the deployed facilitator, demo endpoints, pool contract, and ASPs. TTL >48h, RPC oldest event <6 days, float seeded. (DEMO-03, OPS-01)
4. **DoraHacks writeup submitted** before 2026-04-17 23:59 local time with links to the repo, video, testnet contract addresses, and README. (DEMO-04)
5. **License + upstream hygiene preserved** — `git diff upstream/main -- LICENSE NOTICE circuits/LICENSE` returns empty; per-phase feature branches (`feat/phase-N`) merged into `develop`, never pushed to `NethermindEth/stellar-private-payments`. (SETUP-01, SETUP-03)
6. **No key material in git history** — `git secrets` / manual scan clean. (OPS-04)
7. **Backup recording exists** from day 5 (2026-04-15) and is ready to submit if day-6 final recording fails. (DEMO-05)

If any of the above is false at 2026-04-17 noon, the rescue buffer (day 8 = 2026-04-17 itself) is spent on whichever is missing. The submission does NOT slip past 2026-04-17 under any circumstance.

---

## Progress

**Execution Order:**
Phases execute in numeric order: 0 → 1 → 2 → 3 → 4 → 5 → 6

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 0. Setup & Day-1 De-risking | 5/5 | Complete | 2026-04-11 |
| 1. Pool Integration & Multi-Org Namespace | 1/4 | In Progress | - |
| 2. Facilitator Bridge | 8/8 | Complete | 2026-04-12 |
| 3. Agent SDK (`@enclave/agent`) | 3/5 | In Progress | - |
| 4. Enclave Gate Middleware + Gated Endpoint | 0/2 | Planned | - |
| 5. Dashboard + Ops Hardening | 0/TBD | Not started | - |
| 6. Demo Recording + Submission | 0/4 | Not started | Planned (4 plans) |

---
*Roadmap created: 2026-04-10 from PROJECT.md + REQUIREMENTS.md + PITFALLS.md. Coarse granularity, 7 phases, 54/54 requirements mapped. Updated 2026-04-10 with ASP architectural decisions: Model X (shared org spending key), deterministic blinding=0, fresh contract redeploys with us as admin, permissionless asp-membership via `set_admin_insert_only(false)`, empty asp-non-membership SMT, facilitator gas-relaying for spends (meta-tx model), and Phase-0 verification of upstream prover null-input behavior. Phase 0 planned 2026-04-10: 5 plans with wave structure (wave 1: 00-01 hygiene; wave 2: 00-02 scaffold, 00-03 narrative, 00-04 smoke test; wave 3: 00-05 benchmark). Branch convention locked as per-phase `feat/phase-N` off `develop`.*

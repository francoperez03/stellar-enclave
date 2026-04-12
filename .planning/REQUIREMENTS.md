# Requirements: Enclave — Shielded Organizations for Agentic Commerce

**Defined:** 2026-04-10
**Core Value:** An autonomous agent can consume and pay for APIs with full on-chain privacy (amount, endpoint, org), while the org owner retains internal auditability and compliance control — and the receiving endpoint gets paid in regular testnet USDC via x402 with zero protocol changes.
**Hackathon deadline:** 2026-04-17 (v1 scope = hackathon MVP only)

> **Narrative reconciliation note (from [PITFALLS.md](research/PITFALLS.md) §1):** The shipped architecture is **one shared on-chain ASP + per-org policy enforced by the facilitator off-chain**, NOT per-org on-chain ASPs. This is baked into the requirements below and must match the pitch script, README, and video. Any requirement that mentions "per-org" implies off-chain facilitator enforcement unless explicitly stated otherwise.

## v1 Requirements

Hackathon MVP. Every requirement must be demoable by 2026-04-17. Derived from [PROJECT.md](PROJECT.md) Active requirements + defensive requirements from [PITFALLS.md](research/PITFALLS.md).

### Setup & Fork Hygiene

- [x] **SETUP-01**: Local branch `hackathon/enclave` exists and is never pushed to `NethermindEth/stellar-private-payments`
- [x] **SETUP-02**: All new code lives in net-new directories (`facilitator/`, `treasury/`, `gate/`, `apps/demo/`, SDK packages); upstream directories (`contracts/`, `circuits/`, `app/crates/prover/`) receive zero modifications
- [x] **SETUP-03**: `LICENSE`, `NOTICE`, and `circuits/LICENSE` are preserved byte-identical to upstream; a `git diff upstream/main -- LICENSE NOTICE circuits/LICENSE` returns empty
- [x] **SETUP-04**: `README.md` credits Nethermind and SDF as upstream authors, cites Apache 2.0 and LGPLv3 obligations, and avoids any use of "Nethermind" as a trademark in the project name or pitch
- [x] **SETUP-05**: Day-1 end-to-end smoke test: `stellar contract invoke --id <pool> -- get_root` succeeds against our freshly deployed Enclave pool and confirms TTL has not expired
- [x] **SETUP-06**: Day-1 prover benchmark recorded: proof-generation time for `policy_tx_2_2` measured on the target runtime (browser WASM vs Node WASM vs Playwright), with the result committed to `docs/benchmarks.md`
- [x] **SETUP-07**: Product narrative is locked in writing: `PROJECT.md`, the pitch script, and the README all state "shared ASP, per-org policy off-chain" — no claim of per-org on-chain ASPs

### Shielded Pool Integration

- [x] **POOL-01**: The upstream Soroban contracts (`pool`, `asp-membership`, `asp-non-membership`, `circom-groth16-verifier`) are used as-is — source code unmodified — but **redeployed as fresh instances** on testnet with us as admin of all four. No circuit or prover modifications.
- [x] **POOL-02**: Three fictional orgs (Northfield Capital / Ashford Partners / Bayridge Capital) can coexist as distinct logical namespaces within the same shared shielded pool with zero cross-org visibility on-chain (amounts, counterparties, endpoints hidden)
- [x] **POOL-03**: Org membership is represented off-chain by an org admin key + **one shared per-org spending key** (Model X — single key reused by all agents in the org). Key derivation is deterministic and documented in the SDK.
- [x] **POOL-04**: `org_id` MUST NOT appear in any on-chain field, event, or `encrypted_output` ciphertext length in a way that distinguishes orgs; a ciphertext-length parity test verifies this
- [x] **POOL-05**: Pool + ASP contract TTLs are extended after deployment and the extension routine is documented in `scripts/preflight.sh`
- [x] **POOL-06**: Our `asp-membership` instance is set to permissionless mode at deploy time via `set_admin_insert_only(false)`, so org admins can self-insert their own ASP entries without needing the facilitator. The deploy script verifies the flag is `false` after the call.
- [x] **POOL-07**: Our `asp-non-membership` instance is deployed with us as admin, the SMT starts empty, and stays empty for the duration of the MVP. The empty-tree root is recorded in `deployments.json` and used by every proof (banlist is unused — every publicKey is trivially a non-member of an empty set). Optional revocation demo via admin-only `insert_leaf` is a stretch goal, not a v1 requirement.
- [x] **POOL-08**: Phase 0 research task — verify how the upstream WASM prover constructs null-input witnesses (does it use the depositor's own publicKey, or a hardcoded null publicKey?). If the latter, the deploy script pre-inserts a single `Poseidon2(nullPubKey, 0)` leaf into `asp-membership`. One-time deploy action, not a per-org cost.

### Org Lifecycle

- [x] **ORG-01**: An org admin can bootstrap an org via a single CLI command. Bootstrap performs: (a) generate org admin keypair locally, (b) generate one shared `orgSpendingPubKey` locally, (c) submit **one** on-chain tx — `asp_membership.insert_leaf(Poseidon2(orgSpendingPubKey, 0))` — signed and gas-paid by the org admin, (d) write the org row to the off-chain registry. This is the only on-chain action required for org creation.
- [x] **ORG-02**: An org admin can enroll agent members under an existing org via a CLI command. In Model X, agent enrollment is **purely off-chain**: it generates a per-agent auth keypair (used by the facilitator for audit/rate-limit), shares the existing `orgSpendingPubKey` with the agent, and writes the agent's auth key to the registry. Zero on-chain txs.
- [x] **ORG-03**: An org admin can pre-fund the treasury by depositing testnet USDC into the shielded pool; the deposited notes are bound to the `orgSpendingPubKey` and tagged in the off-chain registry. The deposit tx is signed and gas-paid by the org admin.
- [ ] **ORG-04**: Enrollment is frozen during demo recording to avoid ASP root drift (Pitfall 3); the freeze is enforced by the preflight script and a `REGISTRY_FROZEN=1` env flag
- [x] **ORG-05**: Blinding factor used in all `asp-membership` leaves is the deterministic constant `0` for the v1 MVP. The SDK never generates random blindings for ASP entries. This trade-off is documented in the README as "v2 will introduce random blindings for anti-correlation".

### Facilitator Bridge

- [x] **FACIL-01**: The facilitator accepts a shielded x402 payment proof from an agent, verifies it on-chain via the existing Groth16 verifier, and — on success — forwards a real USDC x402 payment from its own float to the receiving endpoint's `payTo` address
- **FACIL-02** `[CUT 2026-04-11]`: ~~The facilitator enforces per-org spending policy (caps, allowlists) off-chain before settlement; policy violations return 402 with a typed error code and no USDC is moved~~ — **Cut rationale:** the shielded balance of an org is the natural cap (ZK circuit enforces amount conservation; you cannot spend more than what was shielded under the org's spending key). Fine-grained budget control is achieved by creating separate orgs and shielding per-org amounts, not by per-org caps at the facilitator. This removes the need for a shared registry/policy store off-chain and makes the facilitator fully stateless with respect to org identity.
- [x] **FACIL-03**: The facilitator rejects replays: a given nullifier + `X-PAYMENT` header combination can only settle once; a replay test (same proof submitted twice) confirms the second attempt is rejected with HTTP 409
- [x] **FACIL-04**: The facilitator validates that the client's proof commits to the actual `payTo`, `maxAmountRequired`, and `resource` claimed by the endpoint — no mismatch allowed
- [x] **FACIL-05**: The facilitator publishes a `/health` endpoint that reports USDC float balance, last-seen pool root, and readiness for demo (used by `scripts/preflight.sh`)
- [x] **FACIL-06**: The facilitator settles USDC synchronously before returning HTTP 200 to the endpoint — no "200 + silently failed to settle" path (Pitfall 4)
- [x] **FACIL-07**: The facilitator float is seeded with testnet USDC before recording; the seed amount covers at least 3× the expected demo budget
- [x] **FACIL-08**: The facilitator pays the XLM gas for every `pool.transact()` call triggered by an agent spending. Agents do not need their own XLM. The facilitator submits the spend tx to Soroban on the agent's behalf (meta-tx / relayer model). The facilitator's gas float is monitored via `/health` and seeded alongside the USDC float in pre-recording setup.

### Agent SDK (`@enclave/agent`)

- [ ] **SDK-01**: An agent can be instantiated from an org's derived agent key and used as a drop-in HTTP client (e.g., `agent.fetch(url)`) that transparently handles x402 402-challenge → proof-generation → retry
- [x] **SDK-02**: The SDK produces a shielded payment proof compatible with the existing `policy_tx_2_2` circuit layout — no public input layout changes
- [x] **SDK-03**: The SDK loads proving artifacts (proving key, witness calculator) from a configurable local path and never fetches them over the network at runtime
- [x] **SDK-04**: The SDK has a Node-runnable proving path (either Node WASM or Playwright-driven Chromium fallback, as determined by SETUP-06)
- [x] **SDK-05**: Agent private keys are read from environment variables or local files outside the repo; `.gitignore` blocks `*.key`, `.env`, `secrets/`, `wallets/`
- [x] **SDK-06**: The SDK emits structured logs with automatic redaction of keys, nullifiers, and raw payloads; a redaction test confirms no secret survives through the log pipeline
- [ ] **SDK-07**: The SDK constructs proofs using the **shared** `orgSpendingPubKey` as the input keypair for both real and null inputs (Model X). The agent never holds its own spending key — only an auth key for facilitator authentication. The blinding factor for ASP membership proofs is hardcoded to `0` per ORG-05.

### Enclave Gate Middleware

- [ ] **GATE-01**: A `withEnclaveGate({ orgId })` Next.js middleware exists that only serves the wrapped endpoint if the caller presents a valid shielded proof of membership in the given org
- [ ] **GATE-02**: The middleware rejects replayed proofs (nonce + nullifier tracked per-request)
- [ ] **GATE-03**: The middleware verification latency stays under 3 s per request on the demo machine (well below the 10 s Vercel function timeout)
- [ ] **GATE-04**: One demo endpoint in `apps/demo/` is gated by `withEnclaveGate` and accessible only to agents from Northfield Capital; the same endpoint returns 402 to agents from Ashford Partners and Bayridge Capital

### Local Demo Dashboard

- [ ] **DASH-01**: A local-only dashboard (no public hosting) lets an org owner log in with the admin key and view the org's treasury balance, agent roster, and spend history
- [ ] **DASH-02**: A non-admin client (e.g., Ashford Partners admin) viewing Northfield Capital's dashboard sees zero leakage of Northfield Capital's state — treasury, agents, history all hidden
- [ ] **DASH-03**: The dashboard is static (no charts, no filters, no design system) per the scope cut order — a `<table>` is sufficient

### Hackathon Deliverables

- [ ] **DEMO-01**: A public GitHub repository (fork of `NethermindEth/stellar-private-payments`) exists with a README that explains the product, the shielded-ASP-with-off-chain-policy architecture, upstream credit, license obligations, and a quickstart
- [ ] **DEMO-02**: A ≤3-minute video demo shows: (a) three orgs coexisting in one pool, (b) an agent paying an x402 endpoint via the facilitator, (c) Stellar Expert showing the on-chain USDC settlement, (d) one Enclave Gate-gated endpoint refusing a non-member agent
- [ ] **DEMO-03**: A working testnet deployment is reachable at submission time: the facilitator, the demo endpoints, and the shielded pool all respond to `scripts/preflight.sh` with zero errors
- [ ] **DEMO-04**: A submission writeup exists on DoraHacks linking the repo, the video, the testnet contract addresses, and the README
- [ ] **DEMO-05**: Demo rehearsal recorded on day 5 (2026-04-15) as a backup; final recording on day 6 (2026-04-16); submission uploaded no later than 2026-04-17
- [ ] **DEMO-06**: The video narration does not claim per-org on-chain ASPs, per-org anonymity sets, mainnet readiness, or security audit status

### Operational Hardening

- [ ] **OPS-01**: A `scripts/preflight.sh` script exists that checks: pool TTL > 48 h, facilitator `/health` OK, facilitator float > threshold, RPC event window < 6 days, all contract addresses in `deployments.json` are live, and `REGISTRY_FROZEN=1` is set before recording
- [ ] **OPS-02**: A daily `contract extend` cron (or manual routine) keeps Soroban persistent storage TTL fresh for pool + ASPs + verifier during the 7-day window
- [ ] **OPS-03**: Pre-generated proofs for the demo flow are cached under `demo/fixtures/` so the live recording does not depend on real-time proving — the README states clearly that proofs are pre-generated for the video (still honest)
- [x] **OPS-04**: A `git secrets` / manual scan confirms no key material ended up in the commit history before submission
- [x] **OPS-05**: The documented scope cut order lives at the top of `.planning/ROADMAP.md` and is re-read at the start of each working day

## v2 Requirements

Post-hackathon. Acknowledged but not built in the 7-day window. Mapped loosely to [PRODUCT_IDEAS.md](hackathon/PRODUCT_IDEAS.md) Approaches B/C/D.

### Approach B — True Namespaced Notes (contract + circuit changes)

- **APPB-01**: Pool contract supports multiple ASP roots per transaction (one per input), requiring a new `DataKey::ASPMembership(org_id)` scheme
- **APPB-02**: Circuit accepts per-input ASP root selector, requires CRS regeneration
- **APPB-03**: On-chain per-org anonymity set enforced in the circuit constraints

### Approach C — Facilitator Decentralization

- **APPC-01**: Multi-party facilitator (threshold signing) removes single honest-but-curious party
- **APPC-02**: Facilitator reputation / slashing on misbehavior
- **APPC-03**: Plug-in to existing OpenZeppelin Channels facilitator fleet

### Approach D — Autonomous Treasury Policies

- **APPD-01**: On-chain org policy contract enforces spend caps without trusting facilitator
- **APPD-02**: Revocation / rotation of agent member keys
- **APPD-03**: Compliance reporting exports (CSV, cryptographic proof of receipt)

### Operational

- **OPS2-01**: Automated end-to-end test suite (unit + integration + replay + TTL sim)
- **OPS2-02**: Rate limiting, key rotation, member revocation for agent SDK
- **OPS2-03**: Production-grade indexer replacing 7-day RPC retention dependency
- **OPS2-04**: Mainnet deployment path with real USDC + real KYC/ASP integrations
- **OPS2-05**: Security audit of facilitator + SDK + middleware

## Out of Scope

Explicit exclusions for the hackathon window. Derived from [PROJECT.md](PROJECT.md) Out of Scope + cut order from [PITFALLS.md](research/PITFALLS.md) §15.

| Feature | Reason |
|---------|--------|
| New ZK circuits | Approach A doesn't need them; upstream circuits stay untouched |
| New Soroban contracts | Existing `pool` + `asp-membership` + `asp-non-membership` are sufficient |
| Polished UI / design system | Dashboard is a static `<table>`; first scope to cut under pressure |
| Enclave Gate as independent npm package | Collapsed into a gated route inside the Enclave Treasury demo (second cut) |
| Post-paper PDF | Moved to a README section (third cut) |
| Bilingual README | English only (fourth cut) |
| Live proof generation during video recording | Pre-generated proofs used, stated honestly (fifth cut) |
| Third org if time compresses | Two orgs suffice to prove coexistence (sixth cut) |
| Real user onboarding | Fictional Northfield Capital/Ashford Partners/Bayridge Capital only |
| Mainnet compatibility | Testnet only, no mainnet path |
| Mainnet stablecoins | Testnet USDC only |
| Mobile support | Node/Next.js only |
| Wallet integrations (Freighter, etc.) | Derived keys only, no browser wallet flow |
| Rate limiting / key rotation / revocation | Out of scope for MVP |
| Automated test suite | Manual smoke test only |
| Tokenomics / token launch | Infrastructure, not a token |
| Security audit | Inherited PoC status from upstream |
| Post-hackathon features (Approach B/C/D) | Tracked in v2, not built |
| Standalone sWallet / AgentWorks / DarkPool Oracle / Private LLM Gateway | Collapsed into Enclave Treasury + Enclave Gate portfolio |
| Per-org on-chain ASPs | **Technically infeasible** without contract + circuit changes (Pitfall 1); shipped as off-chain policy instead |
| Any push to `NethermindEth/stellar-private-payments` upstream | Upstream hygiene constraint |

## Traceability

Populated 2026-04-10 by `gsd-roadmapper`. Every v1 requirement maps to exactly one phase in [ROADMAP.md](ROADMAP.md).

| Requirement | Phase | Status |
|-------------|-------|--------|
| SETUP-01 | Phase 0 | Complete |
| SETUP-02 | Phase 0 | Complete |
| SETUP-03 | Phase 0 | Complete |
| SETUP-04 | Phase 0 | Complete |
| SETUP-05 | Phase 0 | Complete |
| SETUP-06 | Phase 0 | Complete |
| SETUP-07 | Phase 0 | Complete |
| POOL-01 | Phase 1 | Complete |
| POOL-02 | Phase 1 | Complete |
| POOL-03 | Phase 1 | Complete |
| POOL-04 | Phase 1 | Complete |
| POOL-05 | Phase 1 | Complete |
| POOL-06 | Phase 1 | Complete |
| POOL-07 | Phase 1 | Complete |
| POOL-08 | Phase 0 | Complete |
| ORG-01 | Phase 1 | Complete |
| ORG-02 | Phase 1 | Complete |
| ORG-03 | Phase 1 | Complete |
| ORG-04 | Phase 4 | Pending |
| ORG-05 | Phase 1 | Complete |
| FACIL-01 | Phase 2 | Complete |
| FACIL-02 | Phase 2 | Cut (2026-04-11) |
| FACIL-03 | Phase 2 | Complete |
| FACIL-04 | Phase 2 | Complete |
| FACIL-05 | Phase 2 | Complete |
| FACIL-06 | Phase 2 | Complete |
| FACIL-07 | Phase 2 | Complete |
| FACIL-08 | Phase 2 | Complete |
| SDK-01 | Phase 3 | Pending |
| SDK-02 | Phase 3 | Complete |
| SDK-03 | Phase 3 | Complete |
| SDK-04 | Phase 3 | Complete |
| SDK-05 | Phase 3 | Complete |
| SDK-06 | Phase 3 | Complete |
| SDK-07 | Phase 3 | Pending |
| GATE-01 | Phase 4 | Pending |
| GATE-02 | Phase 4 | Pending |
| GATE-03 | Phase 4 | Pending |
| GATE-04 | Phase 4 | Pending |
| DASH-01 | Phase 5 | Pending |
| DASH-02 | Phase 5 | Pending |
| DASH-03 | Phase 5 | Pending |
| DEMO-01 | Phase 6 | Pending |
| DEMO-02 | Phase 6 | Pending |
| DEMO-03 | Phase 6 | Pending |
| DEMO-04 | Phase 6 | Pending |
| DEMO-05 | Phase 6 | Pending |
| DEMO-06 | Phase 6 | Pending |
| OPS-01 | Phase 5 | Pending |
| OPS-02 | Phase 5 | Pending |
| OPS-03 | Phase 5 | Pending |
| OPS-04 | Phase 0 | Complete |
| OPS-05 | Phase 0 | Complete |

**Coverage:**
- v1 requirements: 54 total
- Mapped to phases: 54 ✓
- Unmapped: 0 ✓

**Phase distribution:** Phase 0 = 10, Phase 1 = 12, Phase 2 = 8, Phase 3 = 7, Phase 4 = 5, Phase 5 = 6, Phase 6 = 6 → 54 total.

---
*Requirements defined: 2026-04-10 from PROJECT.md + PRODUCT_IDEAS.md + PITFALLS.md. Traceability populated: 2026-04-10 by `gsd-roadmapper`. Updated 2026-04-10 with ASP architectural decisions: Model X (shared org spending key), deterministic blinding=0, fresh contract redeploys with us as admin, permissionless asp-membership, facilitator gas-relaying for spends.*

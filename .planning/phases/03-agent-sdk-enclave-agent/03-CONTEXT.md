# Phase 3: Agent SDK (`@enclave/agent`) - Context

**Gathered:** 2026-04-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Ship the Node-runnable `@enclave/agent` SDK that an autonomous agent imports to pay x402 endpoints transparently from org funds. The SDK exposes `agent.fetch(url, init?)` — a drop-in replacement for the native `fetch` global — that internally handles the x402 402-challenge → shielded proof generation → facilitator `/settle` → retry cycle using the org's shared spending key (Model X).

Requirements in scope: **SDK-01, SDK-02, SDK-03, SDK-04, SDK-05, SDK-06, SDK-07**.

Out of scope for Phase 3: the Enclave Gate middleware (Phase 4), the dashboard (Phase 5), pre-recording fixture generation scripts (Phase 5), the `withEnclaveGate` proof verification path. Phase 3 only produces the agent-side client.

</domain>

<decisions>
## Implementation Decisions

### Agent provisioning & key delivery

- **Format**: Agent bundle is a JSON file `<agentName>.enclave.json` downloaded from the Phase 1 browser admin UI. Contents:
  ```json
  { "orgSpendingPrivKey": "<hex>", "agentAuthKey": "<hex>", "orgId": "<slug>", "facilitatorUrl": "http://..." }
  ```
- **`orgSpendingPubKey` derived at runtime** from `orgSpendingPrivKey` using the upstream `derivePublicKey` formula — not stored in the bundle.
- **Load path**: `ENCLAVE_BUNDLE_PATH` env var points to the bundle file. `createAgent()` reads it at startup if individual key params are not passed directly.
- **Security**: bundle file gitignored (`.enclave.json` pattern added to `.gitignore`). Keys never logged (SDK-05, SDK-06 redaction).

### Note/UTXO source and selection

- **Source**: Admin exports a `notes.json` file from the Phase 1 browser UI alongside the bundle. Contains the org's shielded notes (commitments + plaintext witness data needed by the prover).
- **Load path**: `ENCLAVE_NOTES_PATH` env var. SDK reads on startup.
- **Selection strategy**: **Greedy — largest note first** that fully covers `maxAmountRequired`. Minimizes transactions, predictable for demo.
- **Change note**: After spending a note of value V to pay amount A, the remaining change (V − A) comes back as a new output commitment — but tracking this across sessions is Phase 5 / production concern. For MVP, the notes file is treated as read-only; the agent tracks spent notes in-memory only.
- **Spent note tracking**: In-memory `Set<nullifier>` per process lifetime. On restart, reads fresh from `notes.json` (facilitator/pool will reject replayed nullifiers anyway as the safety net).

### fetch() intercept behavior

- **API surface**: `agent.fetch(url: string, init?: RequestInit): Promise<Response>` — minimal drop-in. Supports `method`, `headers`, `body`. Does NOT implement streaming, `AbortController`, `Request` objects, or `ReadableStream`. Sufficient for JSON API payloads in the demo.
- **402 intercept flow**:
  1. Make the original request.
  2. If response status ≠ 402 → return it directly (no payment needed).
  3. If 402 → parse `paymentRequirements` from `WWW-Authenticate` / response body (x402 standard shape).
  4. Select a note, generate shielded proof via Node WASM prover.
  5. `POST /settle` to the facilitator with `{ proof, extData, paymentRequirements }`.
  6. On 200 from facilitator → retry original request with `X-PAYMENT` header containing the settlement receipt.
  7. Return the retried response to the caller.
  - **One retry only.** If the retry still returns 402, throw `EnclavePaymentError`.
- **Error handling**: On proof failure, facilitator rejection (non-200), or retry 402 → throw `EnclavePaymentError`:
  ```ts
  class EnclavePaymentError extends Error {
    reason: string;         // "proof_failed" | "facilitator_rejected" | "no_funds" | "retry_402"
    nullifier?: string;     // hex, if proof was generated before failure
    facilitatorResponse?: unknown; // raw body from facilitator for debugging
  }
  ```
- **No `/verify` pre-call**: Goes directly to `/settle`. Fewer round-trips, latency matters for the demo flow.
- **Auth header**: Attaches `agentAuthKey` as `Authorization: Bearer <authKey>` on `/settle` calls (for facilitator audit trail).

### Fixture mode for demo recording

- **Env var**: `ENCLAVE_FIXTURE_PATH` — path to a JSON fixture file.
- **Format** (indexed by URL):
  ```json
  {
    "https://api.example.com/resource": {
      "proof": { "...": "..." },
      "extData": { "...": "..." },
      "note": { "commitment": "...", "nullifier": "..." }
    }
  }
  ```
- **Behavior**: When `ENCLAVE_FIXTURE_PATH` is set and a matching URL entry exists, the SDK skips the WASM prover and uses the pre-generated proof + extData directly. The `agent.fetch()` call site is **identical** — callers cannot distinguish live from fixture mode.
- **Fallback**: If fixture file is set but no entry matches the URL, falls back to live proving (logs a `WARN` about cache miss).
- **Purpose**: Satisfies OPS-03 (pre-generated proofs for video recording) and cut 5 (live proving dropped from video). The README will state proofs are pre-generated for the video.

### Proving path

- **Node WASM** (Phase 0 benchmark winner, 2753 ms, GREEN). Loads `proving_key.zkey` + witness calculator from `ENCLAVE_PROVING_ARTIFACTS_PATH` (configurable local path, never fetched over the network — SDK-03).
- **Playwright fallback**: Available as `ENCLAVE_PROVER=playwright` if Node WASM regresses. Not the default; committed as regression insurance (Phase 0 decision, benchmarks.md).

### Logging and redaction

- **Library**: `pino` (matches facilitator convention from Phase 2).
- **Redact list**: `orgSpendingPrivKey`, `agentAuthKey`, `inputNullifiers`, `proof.a/b/c`, raw `extData` bytes. Verified by a redaction unit test (SDK-06).
- **Structured fields**: every log includes `{ orgId, url, phase: "prove" | "settle" | "retry" }` at minimum.

### Claude's Discretion
- Exact pino redaction path configuration (paths array vs custom serializer)
- Whether `agentAuthKey` is passed as-is or HMAC-signed per request
- Internal module structure within `packages/agent/src/`
- Exact `policy_tx_2_2` witness construction for null inputs (slot 2) — follows POOL-08 H4 dual-pubkey pattern; planner reads `docs/benchmarks.md` §POOL-08 for the exact formula

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### SDK requirements
- `.planning/REQUIREMENTS.md` — SDK-01 through SDK-07 (full spec for each requirement)
- `.planning/ROADMAP.md` — Phase 3 section (success criteria, cut decision)
- `.planning/PROJECT.md` — Model X key model, agent target description

### Prior phase contexts (carry-forward decisions)
- `.planning/phases/00-setup-day-1-de-risking/00-CONTEXT.md` — Node WASM prover decision, POOL-08 H4 finding, `ENCLAVE_PROVING_ARTIFACTS_PATH` pattern
- `.planning/phases/01-pool-integration-multi-org-namespace/01-CONTEXT.md` — `orgSpendingPubKey` derivation formula, Model X, blinding=0, notes.json / IndexedDB schema
- `.planning/phases/02-facilitator-bridge/02-CONTEXT.md` — `/settle` + `/verify` API shape, `ExtData` construction, `ext_data_hash` formula, `FACILITATOR_URL` convention

### Prover artifacts
- `docs/benchmarks.md` — Node WASM benchmark result, POOL-08 H4 empirical finding (dual-pubkey null-input witness construction)

### Reference implementations
- `app/js/stellar.js` lines ~995–1130 — `submitPoolTransaction` / `buildPoolTransactArgs` (Node port needed for understanding ExtData serialization)
- `app/js/bridge.js` line 777 — `deriveNotePrivateKeyFromSignature` (spending key derivation from Freighter signature)
- `app/js/bridge.js` line 509 — `derivePublicKey` (BN254 pubkey from privkey via Poseidon2)

### On-chain
- `contracts/pool/src/pool.rs` — `transact()` signature, `Proof` and `ExtData` struct layouts (proof serialization must match exactly)

### x402 protocol
- `.planning/research/PITFALLS.md` — Pitfalls 3 (ASP root drift / REGISTRY_FROZEN), 6 (prover-in-Node), 8 (encrypted_output format parity)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/agent/src/index.ts` — Phase 0 stub with `AgentConfig`, `Agent` interface, and `createAgent()` skeleton. Phase 3 replaces the `throw` body; the types are already correct.
- `packages/core/src/types.ts` — `OrgSpendingPubKey`, `AgentAuthKey`, `ShieldedProof`, `PaymentRequest` types already defined. Phase 3 may add `EnclaveNote`, `AgentBundle`, `FixtureIndex`.
- `packages/core/src/constants.ts` — `BN256_MOD`, `TREE_DEPTH`, `SMT_DEPTH` (carry TODO-phase-1/3 markers to replace with confirmed values from docs/benchmarks.md).
- `tools/smoke-fixture-cli/` — Rust crate used in Phase 0 benchmark; contains the witness fixture format reference. Phase 3 may mirror its JSON shape for `notes.json`.

### Established Patterns
- **TypeScript ESM modules** (Phase 2 convention): `"type": "module"` in package.json, `tsc` build, `dist/` output.
- **Pino logging** (Phase 2 convention): structured JSON, redact paths for secrets.
- **Env var config** (Phase 2 convention): static getter class that throws on missing required vars.
- **`FACILITATOR_URL` env var** (Phase 2 decision): agents discover the facilitator this way.
- **Gitignore patterns** (Phase 0): `*.key`, `.env`, `secrets/`, `wallets/` already blocked. Add `*.enclave.json` and `*-notes.json`.

### Integration Points
- `@enclave/core` — imported for shared types; the agent package already declares `"@enclave/core": "*"` in its `package.json`.
- Facilitator `/settle` endpoint — defined in Phase 2 CONTEXT.md `<specifics>` section. The SDK POSTs `{ proof: ShieldedProof, extData: ExtData, paymentRequirements: PaymentRequest }` and receives `{ success, txHash, network, payer }`.
- Node WASM prover — `app/crates/prover` + `app/crates/witness`, built with `wasm-pack --target nodejs`. Artifacts live at a configurable path (`ENCLAVE_PROVING_ARTIFACTS_PATH`). Phase 0 already validated this path is importable under Node 23.6.1 / wasmer.

</code_context>

<specifics>
## Specific Ideas

- The `agent.fetch()` call in the demo script should look exactly like vanilla `fetch` — no extra params visible. The demo narration says "the agent just calls fetch, payment happens transparently."
- The `.enclave.json` bundle concept mirrors what Phase 1's browser UI generates for each enrolled agent — Phase 1 planner should implement the download trigger as part of the enrollment flow (deferred note to Phase 1 plan if not yet done).
- `EnclavePaymentError.nullifier` is important for debug: if the proof was generated but the facilitator rejected it, the nullifier is burned. Logging it lets the admin reconcile which note was consumed.
</specifics>

<deferred>
## Deferred Ideas

- **Change note tracking across restarts** — When an agent spends a large note and gets change back, tracking that new commitment persistently across process restarts requires writing back to `notes.json` or a sidecar DB. Deferred to post-hackathon (notes file is read-only for MVP).
- **Multi-note split payments** — If no single note covers the payment amount, the SDK currently throws `EnclavePaymentError { reason: "no_funds" }`. Splitting across two notes would require a 2-in/2-out where both inputs are real (not null). Deferred — for the demo, pre-funded notes will be large enough.
- **`/verify` pre-call before `/settle`** — Direct to `/settle` chosen for speed. If demo shows unexplained failures, add `/verify` first as a fallback debug mode.
- **`agentAuthKey` HMAC signing** — Currently passed as Bearer token. Per-request HMAC signatures (signing the payload hash) would prevent token replay. Deferred to post-hackathon.
- **Env-var override for individual keys** — Currently only bundle file supported; individual `ENCLAVE_SPENDING_KEY` / `ENCLAVE_AUTH_KEY` vars would give ops flexibility. Deferred.
- **Multi-facilitator switching via registry** — Currently a single `FACILITATOR_URL`. Deferred to Phase 5 or post-hackathon.

</deferred>

---

*Phase: 03-agent-sdk-enclave-agent*
*Context gathered: 2026-04-11*

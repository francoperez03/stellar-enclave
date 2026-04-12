# Phase 3: Agent SDK (`@enclave/agent`) - Research

**Researched:** 2026-04-11
**Domain:** TypeScript Node.js SDK — x402 client, Node WASM proving, shielded witness construction, pino logging with redaction
**Confidence:** HIGH — all critical findings are verified against local codebase artifacts from Phases 0-2

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Agent provisioning & key delivery**
- Bundle format: `<agentName>.enclave.json` — `{ orgSpendingPrivKey, agentAuthKey, orgId, facilitatorUrl }`
- `orgSpendingPubKey` derived at runtime from `orgSpendingPrivKey` via upstream `derivePublicKey`
- `ENCLAVE_BUNDLE_PATH` env var points to the bundle file
- Security: bundle gitignored (`.enclave.json` pattern)

**Note/UTXO source and selection**
- `notes.json` file, loaded via `ENCLAVE_NOTES_PATH` env var
- Selection: greedy largest-first that fully covers `maxAmountRequired`
- Spent note tracking: in-memory `Set<nullifier>` only; notes file is read-only for MVP
- Change note tracking deferred to Phase 5

**fetch() intercept behavior**
- `agent.fetch(url: string, init?: RequestInit): Promise<Response>`
- Does NOT implement streaming, `AbortController`, `Request` objects, or `ReadableStream`
- Flow: original request -> if 402 -> parse paymentRequirements -> select note -> prove -> POST /settle -> retry with `X-PAYMENT` header -> return
- One retry only; if retry is 402, throw `EnclavePaymentError`
- No `/verify` pre-call; goes directly to `/settle`
- Auth: `Authorization: Bearer <authKey>` on `/settle` calls

**Error type:**
```ts
class EnclavePaymentError extends Error {
  reason: string; // "proof_failed" | "facilitator_rejected" | "no_funds" | "retry_402"
  nullifier?: string;
  facilitatorResponse?: unknown;
}
```

**Fixture mode**
- `ENCLAVE_FIXTURE_PATH` env var; JSON indexed by URL
- When set and matching URL found, skips WASM prover, uses pre-generated proof + extData
- Fallback to live proving on cache miss (logs WARN)
- Call site identical — callers cannot distinguish live from fixture mode

**Proving path**
- Node WASM (Phase 0 benchmark winner: 2753 ms, GREEN)
- Artifacts from `ENCLAVE_PROVING_ARTIFACTS_PATH` — never fetched over network (SDK-03)
- Playwright fallback: `ENCLAVE_PROVER=playwright` as regression insurance

**Logging and redaction**
- Library: `pino` (matches facilitator)
- Redact list: `orgSpendingPrivKey`, `agentAuthKey`, `inputNullifiers`, `proof.a/b/c`, raw `extData` bytes
- Structured fields: `{ orgId, url, phase: "prove" | "settle" | "retry" }` minimum
- Verified by a redaction unit test (SDK-06)

### Claude's Discretion
- Exact pino redaction path configuration (paths array vs custom serializer)
- Whether `agentAuthKey` is passed as-is or HMAC-signed per request
- Internal module structure within `packages/agent/src/`
- Exact `policy_tx_2_2` witness construction for null inputs (slot 2) — follows POOL-08 H4 dual-pubkey pattern; planner reads `docs/benchmarks.md` §POOL-08 for the exact formula

### Deferred Ideas (OUT OF SCOPE)
- Change note tracking across restarts
- Multi-note split payments
- `/verify` pre-call before `/settle`
- `agentAuthKey` HMAC signing
- Env-var override for individual keys
- Multi-facilitator switching via registry
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SDK-01 | Drop-in `agent.fetch(url)` transparently handles x402 402-challenge -> proof -> retry | fetch intercept flow pattern documented; EnclavePaymentError shape locked |
| SDK-02 | Proof compatible with existing `policy_tx_2_2` circuit layout — no public input changes | Prover API verified from `target/wasm-prover-nodejs/prover.d.ts`; compressed 128-byte output confirmed |
| SDK-03 | Proving artifacts loaded from configurable local path, never over network | `ENCLAVE_PROVING_ARTIFACTS_PATH` pattern; `fs.readFile` load strategy documented |
| SDK-04 | Node-runnable proving path (Node WASM, Phase 0 winner) | Concrete API: `new Prover(pk, r1cs).prove_bytes(witness)` verified in benchmarks.md |
| SDK-05 | Agent private keys from env vars / local files; `.gitignore` blocks `*.key`, `.env`, `secrets/`, `wallets/` | Bundle file pattern; gitignore already has base patterns, need `.enclave.json` and `*-notes.json` additions |
| SDK-06 | Structured logs with automatic redaction; redaction test verifies no secret survives | Pino redact paths strategy; test pattern modeled after Phase 1 jest tests |
| SDK-07 | Proofs use shared `orgSpendingPubKey` for both real and null inputs (Model X); blinding=0 for ASP membership; unit test verifies two agents from same org share input keypair material | POOL-08 H4: dual-pubkey per input slot, both inserted into ASP; witness construction formula verified |
</phase_requirements>

---

## Summary

Phase 3 replaces the Phase 0 stub in `packages/agent/src/index.ts` with a complete Node.js TypeScript implementation. The package already has the correct `package.json` scaffold (`"type": "module"`, `tsc` build, `dist/` output), `AgentConfig` types, and the `Agent` interface. What Phase 3 adds is the real body of `createAgent()` plus all supporting modules.

The critical technical finding is that **all proving APIs are already verified working from Phase 0**. The `target/wasm-prover-nodejs/prover.js` and `target/wasm-witness-nodejs/witness.js` artifacts exist on disk. The concrete API is: `new WitnessCalculator(circuitWasm, r1cs).compute_witness(JSON.stringify(inputs))` returns a `Uint8Array` witness, then `new Prover(pk, r1cs).prove_bytes(witness)` returns a 128-byte compressed Groth16 proof. These calls have been confirmed working at 2753 ms wall-clock under Node 23.6.1.

The witness construction for Model X (shared `orgSpendingPubKey`) follows POOL-08 H4: each input slot (`inPrivateKey[0]`, `inPrivateKey[1]`) receives a distinct caller-managed private key, both derived public keys must already be in the asp-membership contract. For Model X, both slots use the org's single shared spending key hierarchy — the "null" slot uses the same `orgSpendingPrivKey` as the real slot, which was pre-inserted into ASP at org bootstrap. The witness JSON shape is exactly the fields in `scripts/bench-fixtures/witness-1real-1null.json`.

**Primary recommendation:** Build `@enclave/agent` as a single-file TypeScript ESM module with four internal concerns — bundle loader, note selector, prover wrapper, and fetch interceptor — wired by `createAgent()`. Use pino with a `redact.paths` array for the logger. Write three focused unit test files: witness construction, fetch intercept flow (mocked facilitator), and log redaction.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | 5.6.3 | Language — already pinned in workspace devDeps | Already in workspace |
| pino | 10.3.1 | Structured JSON logging with redact paths | Phase 2 convention, matched by reference facilitator |
| `@enclave/core` | `*` (workspace) | Shared types: `ShieldedProof`, `PaymentRequest`, `OrgSpendingPubKey`, `AgentAuthKey` | Already declared as dep in agent package.json |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Node built-ins (`fs`, `node:fs/promises`, `node:crypto`) | Node 22+ | Bundle/notes file I/O, hex utilities | No extra dep needed |
| `target/wasm-prover-nodejs/prover.js` | Phase 0 build | Groth16 prover WASM (nodejs target) | Always — the only proving path |
| `target/wasm-witness-nodejs/witness.js` | Phase 0 build | Witness calculator WASM (nodejs target) | Always — feeds prover |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| pino | winston / console | pino has native `redact` option; winston requires custom format |
| `require()` CJS interop | dynamic `import()` for WASM modules | benchmarks.mjs uses `createRequire` to load CJS WASM output; same pattern must be used in ESM agent package |

**Installation (only new dep needed):**
```bash
npm install pino -w @enclave/agent
```

**Version verified:** `pino@10.3.1` — confirmed via `node -e "require('.../pino/package.json').version"` against the x402-stellar reference facilitator.

---

## Architecture Patterns

### Recommended Module Structure
```
packages/agent/src/
├── index.ts            # createAgent(), EnclavePaymentError, exports
├── config.ts           # loadBundle() + loadNotes() + env var parsing
├── prover.ts           # loadProverArtifacts(), buildWitness(), prove()
├── fetch-interceptor.ts # agent.fetch() implementation: 402 detect -> prove -> settle -> retry
├── note-selector.ts    # greedy largest-first note selection, in-memory spent tracking
├── logger.ts           # pino instance with redact paths
└── types.ts            # EnclaveNote, AgentBundle, FixtureIndex (additions to @enclave/core)
```

### Pattern 1: Node WASM Prover Loading (ESM + CJS interop)

**What:** The wasm-pack `--target nodejs` output is a CommonJS module. In the ESM `"type": "module"` package, it must be loaded via `createRequire`.

**When to use:** Every time the prover artifacts are loaded at startup.

**Example:**
```typescript
// Source: verified against scripts/prover-bench.mjs (Phase 0) + target/wasm-prover-nodejs/prover.d.ts
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const require = createRequire(import.meta.url);

export async function loadProverArtifacts(artifactsPath: string) {
  const { Prover } = require(path.join(artifactsPath, 'prover.js'));
  const { WitnessCalculator } = require(path.join(artifactsPath, 'witness.js'));

  const [pkBytes, r1csBytes, circuitWasm] = await Promise.all([
    readFile(path.join(artifactsPath, 'policy_tx_2_2_proving_key.bin')),
    readFile(path.join(artifactsPath, 'policy_tx_2_2.r1cs')),
    readFile(path.join(artifactsPath, 'policy_tx_2_2.wasm')),
  ]);

  const prover = new Prover(pkBytes, r1csBytes);
  const witnessCalc = new WitnessCalculator(circuitWasm, r1csBytes);

  return { prover, witnessCalc };
}
```

### Pattern 2: Witness Construction for Model X (POOL-08 H4)

**What:** The `policy_tx_2_2` circuit takes 2-in/2-out. Both `inPrivateKey` slots must receive a key whose public key is in ASP membership. For Model X, both slots use `orgSpendingPrivKey`. The null slot has `inAmount=0`, and `inBlinding` must be a valid field element (not random — Phase 3 uses the deterministic blinding stored with the note; for the null slot, use the same `inBlinding` as stored in the note file for the dummy note).

**Key POOL-08 H4 insight:** The circuit derives `inPublicKey[i]` internally from `inPrivateKey[i]` via `Keypair()`. There is no separate `inPublicKey` circuit input. The prover's `compute_witness()` JSON must include `inPrivateKey` (not `inPublicKey`) for both slots.

**Witness JSON shape** (from `scripts/bench-fixtures/witness-1real-1null.json`):
```typescript
// Source: scripts/bench-fixtures/witness-1real-1null.json + docs/benchmarks.md POOL-08
const witnessInputs = {
  inAmount: ["0", realAmount.toString()],          // null slot=0, real slot=amount
  inBlinding: [nullNote.blinding, realNote.blinding], // string decimals
  inPrivateKey: [orgSpendingPrivKey, orgSpendingPrivKey], // same key for both slots (Model X)
  inPathElements: [nullNote.pathElements, realNote.pathElements], // Merkle proofs
  inPathIndices: [nullNote.pathIndex.toString(), realNote.pathIndex.toString()],
  // Membership proofs for ASP (both slots use same pubkey in Model X)
  membershipProofs: [
    { blinding: "0", leaf: nullNote.aspLeaf, pathElements: [...], pathIndices: "0" },
    { blinding: "0", leaf: realNote.aspLeaf, pathElements: [...], pathIndices: "0" },
  ],
  // Non-membership proofs (empty banlist — POOL-07)
  nonMembershipProofs: [ /* SMT proofs of non-membership in empty tree */ ],
  // ExtData hash (computed from recipient + amount + encrypted outputs)
  extDataHash: extDataHashDecimalString,
  // Output commitments
  outAmount: [changeAmount.toString(), "0"],
  outBlinding: [changeBlinding, "0"],
  outPubKey: [orgSpendingPrivKey, orgSpendingPrivKey], // recipient is org
};
```

**Note:** For the MVP null slot, use a pre-inserted "null note" with amount=0 that was deposited at org bootstrap (same `orgSpendingPrivKey`). The notes.json file must contain both real notes and the zero-amount dummy note.

### Pattern 3: fetch() Intercept Flow

**What:** The 402 intercept is a linear pipeline with one retry.

```typescript
// Source: 03-CONTEXT.md fetch() intercept behavior (locked decision)
async function interceptingFetch(url: string, init?: RequestInit): Promise<Response> {
  const resp1 = await fetch(url, init);

  if (resp1.status !== 402) return resp1;

  // Parse x402 payment requirements from 402 body or WWW-Authenticate
  const payReqs = parsePaymentRequirements(await resp1.json());

  // Select note (greedy largest-first)
  const note = selectNote(notes, payReqs.maxAmountRequired);
  if (!note) throw new EnclavePaymentError({ reason: 'no_funds' });

  // Generate proof
  let proof, extData, nullifier;
  try {
    ({ proof, extData, nullifier } = await generateProof(note, payReqs, config));
    spentNullifiers.add(nullifier);
  } catch (e) {
    throw new EnclavePaymentError({ reason: 'proof_failed' });
  }

  // POST /settle
  const settleResp = await fetch(`${config.facilitatorUrl}/settle`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.agentAuthKey}`,
    },
    body: JSON.stringify({ proof, extData, paymentRequirements: payReqs }),
  });

  if (!settleResp.ok) {
    const body = await settleResp.json().catch(() => null);
    throw new EnclavePaymentError({
      reason: 'facilitator_rejected',
      nullifier,
      facilitatorResponse: body,
    });
  }

  const { txHash } = await settleResp.json();

  // Retry original request with X-PAYMENT header
  const resp2 = await fetch(url, {
    ...init,
    headers: { ...(init?.headers ?? {}), 'X-PAYMENT': txHash },
  });

  if (resp2.status === 402) {
    throw new EnclavePaymentError({ reason: 'retry_402', nullifier });
  }

  return resp2;
}
```

### Pattern 4: Pino Logger with Redact Paths

**What:** Pino's `redact.paths` accepts dot-notation + bracket notation paths to auto-replace with `[Redacted]`.

**Example:**
```typescript
// Source: pino docs + reference facilitator logger.ts pattern (pocs/x402-stellar)
import pino from 'pino';

export const logger = pino({
  level: process.env['LOG_LEVEL'] ?? 'info',
  redact: {
    paths: [
      'orgSpendingPrivKey',
      'agentAuthKey',
      '*.orgSpendingPrivKey',
      '*.agentAuthKey',
      'proof.a',
      'proof.b',
      'proof.c',
      'inputNullifiers',
      'extData',
    ],
    censor: '[Redacted]',
  },
});
```

**Redaction test pattern** (follows Phase 1 jest convention):
```typescript
// Test: capture pino output, assert no key hex appears in the log string
const chunks: string[] = [];
const stream = new Writable({ write(chunk) { chunks.push(chunk.toString()); } });
const testLogger = pino({ redact: { paths: [...] } }, stream);

testLogger.info({ orgSpendingPrivKey: '0xdeadbeef', url: 'https://example.com' }, 'settling');
const output = chunks.join('');
expect(output).not.toContain('deadbeef');
expect(output).toContain('[Redacted]');
```

### Pattern 5: Fixture Mode (OPS-03)

**What:** When `ENCLAVE_FIXTURE_PATH` is set, load JSON indexed by URL and bypass WASM prover.

```typescript
// Source: 03-CONTEXT.md fixture mode (locked decision)
type FixtureEntry = {
  proof: ShieldedProof;
  extData: ExtData;
  note: { commitment: string; nullifier: string };
};
type FixtureIndex = Record<string, FixtureEntry>;

async function resolveProof(url: string, note: EnclaveNote, payReqs: PaymentRequest) {
  if (fixtureIndex) {
    const entry = fixtureIndex[url];
    if (entry) {
      logger.info({ url, phase: 'prove' }, 'fixture cache hit');
      return entry;
    }
    logger.warn({ url, phase: 'prove' }, 'fixture cache miss — falling back to live proving');
  }
  return await liveProve(note, payReqs);
}
```

### Anti-Patterns to Avoid

- **Loading WASM artifacts with `import` (ESM):** The wasm-pack nodejs output is CJS. Use `createRequire(import.meta.url)` as in `scripts/prover-bench.mjs`. Direct `import` will fail with module format error.
- **Caching prover at module level before `ENCLAVE_PROVING_ARTIFACTS_PATH` is read:** Load artifacts lazily inside `createAgent()` after config is validated.
- **Using `inPublicKey` as a circuit witness input:** The `policy_tx_2_2` circuit derives `publicKey` internally from `inPrivateKey` via `Keypair()`. The `inPublicKey` fields in the fixture JSON are documentation metadata added by `smoke-fixture-cli`, not circuit inputs.
- **Logging the proof object directly before redaction is applied:** Any `logger.info({ proof })` without redact paths on `proof.a/b/c` leaks the Groth16 proof bytes.
- **Sharing a single `Prover` instance across concurrent calls:** `prove_bytes()` is synchronous CPU-bound WASM. For the hackathon (single-agent demo) this is fine; do not add concurrency wrappers.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Structured log redaction | Custom log wrapper stripping keys with regex | `pino` `redact.paths` option | Pino's redact is path-aware, handles nested fields, runs before serialization |
| WASM prove/verify | Custom JS Groth16 | `target/wasm-prover-nodejs/prover.js` | Phase 0 already validated these artifacts work at 2753 ms on Node 23.6.1 |
| ext_data_hash computation | Custom keccak implementation | Import from `@enclave/core` or replicate upstream `app/js/stellar.js` formula exactly | Formula is `keccak256(recipient || ext_amount_i256 || encrypted_output0 || encrypted_output1)` — must match what the circuit and pool contract expect |
| x402 payment requirements parsing | Custom 402 body parser | Adapt upstream shape from `@enclave/core::PaymentRequest` | Shape is already locked; don't add a new parsing library |

**Key insight:** The WASM build artifacts are the single most complex piece. They were built and validated in Phase 0. Phase 3 must not rebuild them — just load them via `require()` from `ENCLAVE_PROVING_ARTIFACTS_PATH`. Rebuilding risks the `--no-opt` flag being forgotten, which breaks the bulk-memory ops in arkworks.

---

## Common Pitfalls

### Pitfall 1: ESM vs CJS Module Format for WASM Artifacts
**What goes wrong:** `import { Prover } from '...prover.js'` throws `ERR_REQUIRE_ESM` or silently loads wrong module. The wasm-pack `--target nodejs` output is CommonJS (uses `require` and `module.exports`). The agent package has `"type": "module"` in package.json, so all `.js` files are treated as ESM by default.
**Why it happens:** `wasm-pack --target nodejs` predates the ESM era and outputs CJS.
**How to avoid:** Use `createRequire(import.meta.url)` from `node:module` (exactly as `scripts/prover-bench.mjs` does). This is the confirmed working pattern from Phase 0.
**Warning signs:** `SyntaxError: Cannot use import statement in a module` or `ReferenceError: module is not defined` when loading prover.js.

### Pitfall 2: Witness Input Key Name Confusion
**What goes wrong:** Agent constructs witness with `inPublicKey` as an input field. The circuit rejects the witness or the proof fails circuit constraints.
**Why it happens:** The `scripts/bench-fixtures/witness-1real-1null.json` file contains an `inPublicKey` field, but this is metadata added by `smoke-fixture-cli` for POOL-08 investigation — it is NOT a circuit input. The `policy_tx_2_2` Circom template uses `inPrivateKey` only; public keys are derived internally via `Keypair()`.
**How to avoid:** Verify witness inputs against `e2e-tests/src/tests/e2e_pool_2_in_2_out.rs` TxCase construction, not the fixture JSON metadata. Strip `_pool08_evidence` and `inPublicKey` before passing to `compute_witness()`.
**Warning signs:** `WitnessCalculator.compute_witness` throws with constraint unsatisfied errors.

### Pitfall 3: ASP Root Staleness (Pitfall 3 from PITFALLS.md)
**What goes wrong:** Agent generates a proof against `asp_membership_root = R1`. Between proof generation and `/settle`, a new org is bootstrapped (inserting a new leaf into ASP membership). The pool rejects with `InvalidProof` because the root has changed.
**Why it happens:** ASP membership contract stores a single current root; unlike the pool's merkle tree which keeps 90-root history, the ASP has no root history.
**How to avoid:** The CONTEXT.md mandates `REGISTRY_FROZEN=1` env flag during demo. The agent SDK does NOT need to handle ASP root staleness internally — the facilitator maps `InvalidProof` to `ASP_ROOT_STALE` (Phase 2 concern). The agent throws `EnclavePaymentError { reason: 'facilitator_rejected' }`.
**Warning signs:** Facilitator returns 4xx with `invalidReason: "ASP_ROOT_STALE"` in the response body — log via `facilitatorResponse` field of `EnclavePaymentError`.

### Pitfall 4: Note Nullifier Burned Before Facilitator Confirms
**What goes wrong:** Agent generates proof (nullifier burned on-chain inside `pool.transact`), but then facilitator returns non-200 for an unrelated reason (network timeout, float depleted, etc.). The nullifier is now spent on-chain. The note is lost.
**Why it happens:** The pool's nullifier spend is atomic with `pool.transact`; if the facilitator submits the tx and it lands but then a network hiccup prevents the HTTP response from reaching the agent, the agent thinks the payment failed.
**How to avoid:** Log `nullifier` BEFORE calling `/settle`. The `EnclavePaymentError.nullifier` field is specifically for this case — it allows the admin to reconcile which note was consumed. The MVP accepts this as an acknowledged limitation.
**Warning signs:** `EnclavePaymentError.reason === 'facilitator_rejected'` with a non-null `nullifier` — the note may still have been spent on-chain.

### Pitfall 5: Secret Key Hex Appearing in pino Output
**What goes wrong:** `logger.info(bundle, 'agent loaded')` logs the entire bundle including `orgSpendingPrivKey` in cleartext JSON.
**Why it happens:** Pino's `redact` only applies to the fields named in the `paths` array. If the bundle object is logged at top level without the correct path prefix, the redact doesn't trigger.
**How to avoid:** (a) Never log the bundle object directly; log only `{ orgId, facilitatorUrl }`. (b) Use path wildcards in pino redact: `'*.orgSpendingPrivKey'` catches nested occurrences. (c) Redaction unit test (SDK-06) verifies no hex ≥32 chars matching the key material appears in logged output.

### Pitfall 6: `ENCLAVE_PROVING_ARTIFACTS_PATH` Points to Browser WASM Artifacts
**What goes wrong:** Agent loads `app/crates/prover` WASM built for `--target bundler` or `--target web`. These fail under Node with `TextDecoder is not defined` or `crypto.subtle` errors.
**Why it happens:** The repo contains WASM built for multiple targets. The browser-target build lives at a different path than the nodejs-target build.
**How to avoid:** `ENCLAVE_PROVING_ARTIFACTS_PATH` must point to `target/wasm-prover-nodejs/` and `target/wasm-witness-nodejs/` — or a directory that copies these. The Phase 0 benchmark used these exact paths. Document this in the README env-vars section.
**Warning signs:** `ReferenceError: TextDecoder is not defined` or `getrandom: this target is not supported`.

---

## Code Examples

Verified patterns from codebase:

### WASM Prover Invocation (Confirmed Working — Phase 0)
```typescript
// Source: docs/benchmarks.md Winner Decision Box + scripts/prover-bench.mjs
// Confirmed: 2753 ms wall-clock, 150 MB peak RSS, Node 23.6.1

import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const require = createRequire(import.meta.url);

const artifactsPath = process.env['ENCLAVE_PROVING_ARTIFACTS_PATH']!;

// Load CJS WASM modules
const { Prover } = require(path.join(artifactsPath, 'prover.js'));
const { WitnessCalculator } = require(path.join(artifactsPath, 'witness.js'));

// Load binary artifacts
const [pkBytes, r1csBytes, circuitWasm] = await Promise.all([
  readFile(path.join(artifactsPath, 'policy_tx_2_2_proving_key.bin')),
  readFile(path.join(artifactsPath, 'policy_tx_2_2.r1cs')),
  readFile(path.join(artifactsPath, 'policy_tx_2_2.wasm')),
]);

// Compute witness
const wc = new WitnessCalculator(circuitWasm, r1csBytes);
const witnessBytes: Uint8Array = wc.compute_witness(JSON.stringify(inputs));

// Generate proof
const prover = new Prover(pkBytes, r1csBytes);
const proofBytes: Uint8Array = prover.prove_bytes(witnessBytes); // 128 bytes compressed
```

### Proof Bytes to Uncompressed (for Soroban serialization)
```typescript
// Source: target/wasm-prover-nodejs/prover.d.ts
// Method: proof_bytes_to_uncompressed(proof_bytes: Uint8Array): Uint8Array
// Input: 128-byte compressed proof
// Output: 256-byte uncompressed [A(64) || B(128) || C(64)] for pool.transact

const uncompressed = prover.proof_bytes_to_uncompressed(proofBytes);
const proofA = uncompressed.slice(0, 64);
const proofB = uncompressed.slice(64, 192);
const proofC = uncompressed.slice(192, 256);
```

### Extract Public Inputs from Witness (for ShieldedProof fields)
```typescript
// Source: target/wasm-prover-nodejs/prover.d.ts
// prover.extract_public_inputs(witness_bytes) → Uint8Array
// 11 public inputs x 32 bytes = 352 bytes total
// Layout matches policy_tx_2_2 circuit: root, nullifiers[2], commitments[2],
// public_amount, ext_data_hash, asp_membership_root, asp_non_membership_root

const publicInputBytes = prover.extract_public_inputs(witnessBytes);
```

### Bundle Loading
```typescript
// Source: 03-CONTEXT.md locked decision — bundle format
import { readFile } from 'node:fs/promises';

type AgentBundle = {
  orgSpendingPrivKey: string; // hex
  agentAuthKey: string;       // hex
  orgId: string;
  facilitatorUrl: string;
};

async function loadBundle(): Promise<AgentBundle> {
  const bundlePath = process.env['ENCLAVE_BUNDLE_PATH'];
  if (!bundlePath) throw new Error('ENCLAVE_BUNDLE_PATH is required');
  const raw = await readFile(bundlePath, 'utf-8');
  return JSON.parse(raw) as AgentBundle;
}
```

### derivePublicKey at Runtime (from orgSpendingPrivKey)
```typescript
// Source: 03-CONTEXT.md — "orgSpendingPubKey derived at runtime from orgSpendingPrivKey
//         using the upstream derivePublicKey formula"
// Source: app/js/bridge.js line 509 — Poseidon2(priv, 0, domain=0x03)
// In Node WASM: available as poseidon2_hash2 from prover.js exports

const { poseidon2_hash2 } = require(path.join(artifactsPath, 'prover.js'));

function derivePublicKey(privKeyBytes: Uint8Array): Uint8Array {
  // domain separation 3 matches upstream bridge.js::derive_public_key
  const zeroes = new Uint8Array(32);
  return poseidon2_hash2(privKeyBytes, zeroes, 3);
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Separate `@enclave/agent` + `@enclave/crypto` packages | Single `@enclave/agent` package | Phase 0 decision (YAGNI, 7-day window) | Simpler build, one tsc target |
| Browser WASM proving (Playwright fallback) | Node WASM proving (winner) | Phase 0 benchmark, 2026-04-11 | No Chromium dependency, 150 MB RSS vs ~450 MB |
| Per-org ASPs for identity | Shared ASP + Model X shared spending key | Phase 0 narrative lock | Agent holds no org-specific ASP identity; orgSpendingPubKey is the identity anchor |
| Random blinding for ASP membership proofs | Deterministic blinding = 0 | ORG-05 decision | Simplifies witness construction; documented as v2 improvement |
| CLI-based treasury with `wallets/` directory | Browser-derived keys via Freighter, exported as `.enclave.json` bundle | Phase 1 pivot (2026-04-11) | Agent receives bundle file instead of env-var key material |

**Deprecated/outdated:**
- `PHASE_0_STUB = true` export in `packages/agent/src/index.ts`: Phase 3 removes this; the `throw` body of `createAgent()` is replaced with real implementation.
- Any reference to a Node CLI `@enclave/treasury-cli` generating wallets: Phase 1 pivot to browser-first replaced this — agent gets a `.enclave.json` bundle downloaded from the browser admin UI.

---

## Open Questions

1. **Notes.json format — how does it encode Merkle path data?**
   - What we know: `03-CONTEXT.md` says notes.json is exported from the Phase 1 browser UI, containing "commitments + plaintext witness data needed by the prover".
   - What's unclear: The exact JSON schema has not been pinned in Phase 1 CONTEXT or plans yet. The witness fixture (`scripts/bench-fixtures/witness-1real-1null.json`) shows the prover expects `inPathElements[i][]` as arrays of decimal strings, `inPathIndices[i]` as decimal strings, and `membershipProofs[i].pathElements[]` and `nonMembershipProofs[i]` for SMT proofs.
   - Recommendation: Phase 3 planner must define the `EnclaveNote` type and `notes.json` schema in Wave 0 before building the witness construction. The schema should map to the exact witness inputs.

2. **Non-membership proof construction for the empty SMT**
   - What we know: POOL-07 says the SMT is empty for MVP; the empty-tree root is recorded in `deployments.json`. POOL-07 says "every publicKey is trivially a non-member of an empty set."
   - What's unclear: What witness data does the circuit need for non-membership proofs against an empty tree? The `witness-1real-1null.json` fixture has `nonMembershipProofs` entries — Phase 3 needs to reproduce these from a deterministic empty-tree proof generator.
   - Recommendation: Read `e2e-tests/src/tests/e2e_pool_2_in_2_out.rs` `build_non_membership_tree()` for the exact non-membership witness shape. The Phase 3 prover wrapper must generate these proofs using the SMT depth (32) and the fixed empty root.

3. **Dual-note requirement for Model X null slot**
   - What we know: POOL-08 H4 confirmed both input slots need their own public key pre-inserted in ASP membership. For Model X both slots use `orgSpendingPrivKey`, so the same pubkey is in ASP membership once (inserted at org bootstrap). But the circuit has two separate merkle path proofs for `inPrivateKey[0]` and `inPrivateKey[1]`.
   - What's unclear: In the notes.json, the "null slot" note — does it need a distinct commitment in the pool merkle tree (a real zero-amount note that was deposited), or can the circuit accept path indices pointing to the same leaf position used twice?
   - Recommendation: Phase 3 planner should clarify this with Phase 1 CONTEXT.md §deposit flow. The null note should be a real zero-amount commitment deposited at org bootstrap (bound to `orgSpendingPubKey`), with its own valid Merkle path. This is the safest interpretation consistent with the circuit.

---

## Validation Architecture

`workflow.nyquist_validation` is `true` in `.planning/config.json` — include this section.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 29.7.0 (from `app/package.json`) |
| Config file | `app/package.json` (`"scripts": { "test": "jest" }`) — same framework as Phase 1 |
| Quick run command | `cd app && npx jest js/__tests__/enclave/agent/ --no-coverage` |
| Full suite command | `cd app && npx jest --no-coverage` |

**Note on test placement:** Phase 1 established the pattern of placing enclave unit tests under `app/js/__tests__/enclave/`. However, Phase 3's `@enclave/agent` is a TypeScript ESM package under `packages/agent/`, not a browser module. There are two options:
1. Add Jest to `packages/agent/` with TypeScript transform (ts-jest or babel-jest with TypeScript preset) — isolated, no cross-pollution
2. Place tests in `app/js/__tests__/enclave/` using the existing Jest + Babel setup, but mock the Node WASM require paths

**Recommendation:** Use option 1 — add Jest + ts-jest to `packages/agent/` since the code is TypeScript ESM. The existing `app/jest` setup uses Babel (not tsc) and is optimized for browser CJS modules. The Phase 2 facilitator should have established this pattern.

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SDK-01 | `agent.fetch()` returns original response when no 402 | unit | `npx jest packages/agent/src/__tests__/fetch-interceptor.test.ts -x` | Wave 0 |
| SDK-01 | `agent.fetch()` completes 402 -> prove -> settle -> retry cycle | unit (mocked facilitator) | same | Wave 0 |
| SDK-01 | `agent.fetch()` throws `EnclavePaymentError` on retry 402 | unit | same | Wave 0 |
| SDK-02 | `prove()` returns 128-byte compressed Groth16 output | unit (real WASM or mock) | `npx jest packages/agent/src/__tests__/prover.test.ts -x` | Wave 0 |
| SDK-03 | Artifacts loaded from local path — no network calls | unit (fs mock asserting no fetch) | same | Wave 0 |
| SDK-04 | Node WASM prover path works end-to-end | smoke (real WASM, real witness inputs) | `npx jest packages/agent/src/__tests__/prover.test.ts --testNamePattern="live"` | Wave 0 |
| SDK-05 | `.enclave.json` and `*-notes.json` are gitignored | manual / shell assertion | `git check-ignore -v test.enclave.json` | Wave 0 |
| SDK-06 | No secret hex survives pino log pipeline | unit | `npx jest packages/agent/src/__tests__/logger.test.ts -x` | Wave 0 |
| SDK-07 | Two agents from same org produce proofs with same input keypair material | unit | `npx jest packages/agent/src/__tests__/witness.test.ts --testNamePattern="model-x"` | Wave 0 |

### Sampling Rate
- **Per task commit:** `npx jest packages/agent/src/__tests__/ --no-coverage`
- **Per wave merge:** `cd app && npx jest --no-coverage` (full app suite, 36+ tests green)
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `packages/agent/src/__tests__/fetch-interceptor.test.ts` — covers SDK-01
- [ ] `packages/agent/src/__tests__/prover.test.ts` — covers SDK-02, SDK-03, SDK-04
- [ ] `packages/agent/src/__tests__/logger.test.ts` — covers SDK-06
- [ ] `packages/agent/src/__tests__/witness.test.ts` — covers SDK-07
- [ ] `packages/agent/jest.config.js` — Jest + ts-jest config for the agent package
- [ ] `packages/agent/package.json` additions: `jest`, `ts-jest`, `@types/jest` as devDeps
- [ ] `packages/agent/src/` module files (config, prover, fetch-interceptor, note-selector, logger, types, index)

---

## Sources

### Primary (HIGH confidence)
- `docs/benchmarks.md` — Node WASM API, artifact paths, Prover/WitnessCalculator constructors, 2753 ms benchmark result
- `target/wasm-prover-nodejs/prover.d.ts` — Prover class signature: `constructor(pk_bytes, r1cs_bytes)`, `prove_bytes(witness)`, `proof_bytes_to_uncompressed()`, `extract_public_inputs()`
- `target/wasm-witness-nodejs/witness.d.ts` — WitnessCalculator class: `constructor(circuit_wasm, r1cs_bytes)`, `compute_witness(inputs_json: string): Uint8Array`
- `.planning/phases/03-agent-sdk-enclave-agent/03-CONTEXT.md` — All locked implementation decisions
- `scripts/prover-bench.mjs` — Working CJS-in-ESM loading pattern via `createRequire`
- `scripts/bench-fixtures/witness-1real-1null.json` — Exact witness JSON field names and shapes
- `packages/agent/src/index.ts` — Phase 0 stub with correct `AgentConfig`, `Agent` interface, `createAgent()` skeleton
- `packages/agent/package.json` — Confirmed `"type": "module"`, TypeScript 5.6.3, deps on `@enclave/core`
- `packages/core/src/types.ts` — `ShieldedProof`, `OrgSpendingPubKey`, `AgentAuthKey`, `PaymentRequest` types
- `app/js/bridge.js` lines 509, 777 — `derivePublicKey` and `deriveNotePrivateKeyFromSignature` formulas
- `app/js/stellar.js` lines 995-1130 — `submitPoolTransaction` / ExtData serialization shape
- `app/js/__tests__/enclave/keys.test.js` — Phase 1 jest test pattern (createRequire-less CJS mock pattern)

### Secondary (MEDIUM confidence)
- `pocs/x402-stellar/examples/facilitator/src/utils/logger.ts` — Reference pino logger with `redact` paths pattern; confirmed pino@10.3.1
- `.planning/phases/02-facilitator-bridge/02-CONTEXT.md` — `/settle` endpoint shape, `SettleResponse { success, txHash, network, payer }`, `Authorization: Bearer` convention
- `.planning/phases/01-pool-integration-multi-org-namespace/01-CONTEXT.md` — orgSpendingPubKey derivation formula, Model X description, blinding=0, notes.json/IndexedDB schema

### Tertiary (LOW confidence)
- Pino `redact.paths` wildcard syntax (`'*.field'`) — documented in pino README; not verified via Context7 but consistent with Phase 2 facilitator intent

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — pino version verified against local node_modules; TypeScript version from workspace; WASM APIs from generated .d.ts files
- Architecture: HIGH — all patterns grounded in Phase 0 working code (benchmarks.mjs) or locked CONTEXT.md decisions
- Pitfalls: HIGH — Pitfall 1 (ESM/CJS) and Pitfall 2 (inPublicKey confusion) are grounded in local artifacts; Pitfalls 3-6 are grounded in PITFALLS.md empirical analysis

**Research date:** 2026-04-11
**Valid until:** 2026-04-17 (hackathon deadline; all findings tied to local artifacts that don't change)

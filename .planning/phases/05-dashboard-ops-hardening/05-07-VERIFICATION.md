# Phase 5 Verification Report

Date: 2026-04-13
Status: **PARTIAL** — automated checks PASS, live checks DEFERRED to human validation.

---

## Honest Coverage Statement

This phase ships with **automated coverage only**. The three live-environment
checks (Tasks 1–3 of Plan 05-07) are **deferred to a recording-day pre-flight**
that Franco will run manually outside the GSD flow before the 2026-04-16
recording session.

Nothing here claims Tasks 1–3 passed. They were not executed. The fixture file
`demo/fixtures/demo-endpoint.json` is **not** committed by this plan — it will
be produced by Franco's live capture-mode run.

This file is the checklist Franco works from on pre-flight day.

---

## Task 1 — SDK capture-mode dry run (OPS-03)

**Status:** DEFERRED — commands documented; nothing executed; no artifact committed.

**Outstanding artifact:** `demo/fixtures/demo-endpoint.json` (not yet created).

**Pre-flight commands:**

```bash
# 1. Preconditions
export REGISTRY_FROZEN=1
./scripts/preflight.sh full-check --ttl-min 48 --float-min 10 --event-window-max 6

# 2. Start services (two terminals)
# Terminal A
cd facilitator && npm run dev
# Terminal B
cd apps/demo && npm run dev

# 3. Capture-mode run
mkdir -p demo/fixtures
export ENCLAVE_FIXTURE_CAPTURE=1
export ENCLAVE_FIXTURE_PATH="$(pwd)/demo/fixtures/demo-endpoint.json"
export ENCLAVE_BUNDLE_PATH=/path/to/<org>.enclave.json
export ENCLAVE_NOTES_PATH=/path/to/<org>-notes.json
export ENCLAVE_PROVING_ARTIFACTS_PATH=/path/to/prover/artifacts
export DEMO_URL=http://localhost:4000/treasury/exchange-rate   # confirm from Plan 04-02 SUMMARY
node -e "(async () => {
  const { createAgent } = await import('@enclave/agent');
  const agent = await createAgent();
  const r = await agent.fetch(process.env.DEMO_URL);
  console.log('status', r.status);
})();"

# 4. Shape checks
test -f demo/fixtures/demo-endpoint.json
jq -r 'keys[0]' demo/fixtures/demo-endpoint.json                                    # equals DEMO_URL
jq -e 'to_entries | .[0].value | .publicInputs | length == 704' demo/fixtures/demo-endpoint.json
jq -e 'to_entries | .[0].value | .note.nullifier | test("^[0-9]+$")' demo/fixtures/demo-endpoint.json

# 5. Replay check (WITHOUT capture)
unset ENCLAVE_FIXTURE_CAPTURE
node -e "<same script as step 3>"
# Expect log line: "fixture cache hit — using pre-generated proof"

# 6. Commit the fixture
git add demo/fixtures/demo-endpoint.json
git commit -m "feat(05-07): commit demo-endpoint fixture via SDK capture mode (OPS-03)"
```

**Pass condition:** All six sub-steps succeed; replay prints "fixture cache hit"; 2xx response in both runs.

---

## Task 2 — Live preflight full-check (OPS-01)

**Status:** DEFERRED — human will run before recording day.

**Pre-flight commands:**

```bash
# 1. Facilitator up
cd facilitator && npm run dev

# 2. Freeze env + point at facilitator
export REGISTRY_FROZEN=1
export FACILITATOR_URL=http://localhost:4021

# 3. Run full-check
./scripts/preflight.sh full-check
echo "exit=$?"
```

**Pass condition:** stdout contains the literal line `6 passed, 0 failed`, exit code is 0, all six check labels show PASS:

```
pool-ttl>48h               PASS  pool=<N>h aspM=<N>h aspNM=<N>h verifier=<N>h
facilitator /health        PASS  http://localhost:4021/health
float>10USDC               PASS  usdc_balance=<N> base units (min 10 USDC = 100000000 base units)
rpc-event-window<6d        PASS  rpc ok
deployments.json live      PASS  4/4 live
REGISTRY_FROZEN=1          PASS  REGISTRY_FROZEN=1
---
6 passed, 0 failed
```

**Remediation map** (if any row FAILs):

| Row                  | Remediation                                         |
| -------------------- | --------------------------------------------------- |
| pool-ttl             | `./scripts/preflight.sh pool-ttl-bump`              |
| facilitator /health  | start facilitator (`cd facilitator && npm run dev`) |
| float                | seed USDC via Phase 2 bootstrap CLI                 |
| rpc-event-window     | check RPC URL reachable                             |
| deployments.json     | contract no longer resolves — re-deploy             |
| REGISTRY_FROZEN      | `export REGISTRY_FROZEN=1`                          |

---

## Task 3 — DASH-02 cross-org isolation (manual)

**Status:** DEFERRED — human will verify through the dashboard UI.

**Pre-flight steps (browser):**

1. Serve the admin UI: `cd app && npm run dev` (or Trunk).
2. Connect Freighter as **Northfield admin** (account A) → Create Org → deposit 10 USDC → enroll 1 agent.
3. Switch Freighter to **Ashford admin** (account B) → Create Org → deposit 5 USDC → enroll 1 agent.
4. Scroll to Dashboard section.
5. Paste **Northfield admin's** `S...` secret → Load Dashboard.
   - Expect: balance ≈ 100000000 USDC base units, agents table shows 1 row (Northfield's agent), history empty or Northfield-only.
6. Clear input. Paste **Ashford admin's** `S...` secret → Load Dashboard.
   - Expect: balance ≈ 50000000 base units, agents shows ONLY Ashford's agent, history empty or Ashford-only.
   - **ZERO Northfield entries anywhere.**
7. Paste a random valid `S...` secret (fresh `Keypair.random()` never registered) → Load Dashboard.
   - Expect: error banner "No org found for this admin key." All three tables cleared.

**Optional deep check:** open DevTools → IndexedDB `poolstellar` → `enclave_note_tags`. Confirm both orgs' rows coexist in the same store AND the `by_nullifier` index is present (proves isolation is UI-layer filtering, not storage separation — the honest DASH-02 guarantee).

**Pass condition:** step 6 shows zero Northfield rows; step 7 shows empty tables + error banner.

---

## Task 4 — README claim-hygiene (OPS-02 + OPS-03)

**Status:** PASS — all five grep checks green.

| Check                                                     | Result |
| --------------------------------------------------------- | ------ |
| `grep -qE "pre-generated\|pre generated" README.md`       | PASS   |
| `grep -qE "^## Operations" README.md`                     | PASS   |
| `grep -q "RUNBOOK.md" README.md`                          | PASS   |
| `grep -q "2026-04-17" README.md`                          | PASS   |
| `grep -q "2026-04-17" RUNBOOK.md`                         | PASS   |

README was **not modified** — the OPS-03 pre-generated-proofs sentence was already present (README.md line 74: "The recorded demo uses pre-generated proofs from `demo/fixtures/`…"). The OPS-02 deadline and RUNBOOK link were wired in by Plan 05-05.

---

## Phase 5 Overall Status

**GAPS_OPEN** — automated coverage is complete; live verification is a documented recording-day pre-flight, explicitly deferred by user request (not skipped silently). Phase 5 is operationally ready to ship; Franco must close Tasks 1–3 manually before recording on 2026-04-16.

---
phase: 05-dashboard-ops-hardening
plan: 07
subsystem: testing
tags: [verification, preflight, fixtures, ops-hardening, phase-closeout]

# Dependency graph
requires:
  - phase: 05-dashboard-ops-hardening
    provides: settlements log, nullifier precompute, SDK capture mode, preflight full-check, ops docs, dashboard UI (Plans 05-01 to 05-06)
  - phase: 04-enclave-gate-middleware-gated-endpoint
    provides: gated demo endpoint + enrollment freeze (target of OPS-03 capture)
provides:
  - Recording-day pre-flight checklist (05-07-VERIFICATION.md) covering Tasks 1–3 deferred commands
  - Task 4 automated README/RUNBOOK claim-hygiene PASS (OPS-02 + OPS-03 narrative locked)
  - Phase 5 closeout decision: PARTIAL ship — automated coverage done, live checks deferred to human
affects:
  - phase-06-demo-recording (Franco must close Tasks 1–3 before recording day 2026-04-16)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Explicit-deferral pattern: plans with live-environment human-verify tasks can close as PARTIAL with deferred commands captured in VERIFICATION.md, so the recording-day operator has a single self-contained checklist to work from."

key-files:
  created:
    - .planning/phases/05-dashboard-ops-hardening/05-07-VERIFICATION.md
    - .planning/phases/05-dashboard-ops-hardening/05-07-SUMMARY.md
  modified: []

key-decisions:
  - "Tasks 1–3 (SDK capture-mode dry run, live preflight full-check, DASH-02 cross-org isolation) DEFERRED by user request — not skipped silently. Franco will close them manually outside the GSD flow as the recording-day pre-flight before 2026-04-16."
  - "demo/fixtures/demo-endpoint.json NOT created by this plan — it is the live-run output of Task 1's capture-mode dry run that Franco will produce and commit during pre-flight."
  - "README.md not edited — OPS-03 pre-generated-proofs sentence was already present (line 74, from Plan 05-05); all 5 grep checks pass without changes."
  - "Phase 5 overall status recorded as GAPS_OPEN in VERIFICATION.md (honest label). Automated coverage is complete; live verification is gated on human pre-flight."

patterns-established:
  - "Deferred-live-check pattern: when live-environment tasks cannot be safely auto-executed (live testnet, Freighter, two browsers), close the plan as PARTIAL with a self-contained command checklist in VERIFICATION.md rather than fabricating PASS signals."

requirements-completed: []  # No requirements fully closed by this plan — DASH-01/02/03 + OPS-01/02/03 remain gated on Tasks 1–3 human validation. Plan closes as partial verification coverage.

# Metrics
duration: ~4min
completed: 2026-04-13
---

# Phase 5 Plan 07: E2E Verification Summary

**Phase 5 closeout plan: Task 4 (README/RUNBOOK claim hygiene) auto-verified PASS; Tasks 1–3 (SDK capture-mode dry run, live preflight full-check, DASH-02 cross-org isolation) deferred to Franco's recording-day pre-flight by explicit user request.**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-04-13T01:23:22Z
- **Completed:** 2026-04-13T01:32:00Z (approx)
- **Tasks:** 1/4 executed (Task 4); 3/4 deferred (Tasks 1–3)
- **Files modified:** 0 (no code/doc edits needed — README already compliant)
- **Files created:** 2 (VERIFICATION.md, SUMMARY.md — both under .planning/)

## Accomplishments

- **Task 4 (OPS-02 + OPS-03 narrative lock):** Verified all five README/RUNBOOK grep checks pass — pre-generated-proofs sentence present, Operations section present, RUNBOOK.md linked, 2026-04-17 deadline present in both README and RUNBOOK. No edits required.
- **Recording-day pre-flight checklist:** `05-07-VERIFICATION.md` now contains the exact commands Franco needs to close Tasks 1–3 outside the GSD flow, plus pass conditions and remediation maps.
- **Honest status labeling:** Phase 5 closeout recorded as PARTIAL / GAPS_OPEN rather than PASS — the three live checks are explicitly deferred, not silently skipped.

## Task Commits

1. **Task 4: README/RUNBOOK claim-hygiene check** — no code commit (README unchanged; VERIFICATION.md written to `.planning/`).
2. **VERIFICATION.md** — `38e5d06` (docs: e2e verification — task 4 auto PASS, tasks 1-3 deferred to human validation)
3. **SUMMARY.md + phase metadata** — (this commit) docs(05-07): complete e2e verification plan — live checks deferred

_Tasks 1–3 have no commits in this plan run — they are deferred to the recording-day pre-flight._

## Files Created/Modified

- `.planning/phases/05-dashboard-ops-hardening/05-07-VERIFICATION.md` — pre-flight checklist with Tasks 1–3 commands, pass conditions, and remediation maps; Task 4 PASS table.
- `.planning/phases/05-dashboard-ops-hardening/05-07-SUMMARY.md` — this file.

**Not created by this plan (deferred to human):**

- `demo/fixtures/demo-endpoint.json` — output of Task 1's live capture-mode run. Franco produces and commits during pre-flight.

## Recording-Day Pre-Flight Commands (self-contained)

Franco runs these outside the GSD flow before 2026-04-16 recording:

### Task 1 — Capture-mode dry run (OPS-03)

```bash
# Preconditions
export REGISTRY_FROZEN=1
./scripts/preflight.sh full-check --ttl-min 48 --float-min 10 --event-window-max 6

# Services (two terminals)
cd facilitator && npm run dev    # terminal A
cd apps/demo && npm run dev      # terminal B

# Capture run
mkdir -p demo/fixtures
export ENCLAVE_FIXTURE_CAPTURE=1
export ENCLAVE_FIXTURE_PATH="$(pwd)/demo/fixtures/demo-endpoint.json"
export ENCLAVE_BUNDLE_PATH=/path/to/<org>.enclave.json
export ENCLAVE_NOTES_PATH=/path/to/<org>-notes.json
export ENCLAVE_PROVING_ARTIFACTS_PATH=/path/to/prover/artifacts
export DEMO_URL=http://localhost:4000/treasury/exchange-rate
node -e "(async () => {
  const { createAgent } = await import('@enclave/agent');
  const agent = await createAgent();
  const r = await agent.fetch(process.env.DEMO_URL);
  console.log('status', r.status);
})();"

# Shape checks
jq -e 'to_entries | .[0].value | .publicInputs | length == 704' demo/fixtures/demo-endpoint.json
jq -e 'to_entries | .[0].value | .note.nullifier | test("^[0-9]+$")' demo/fixtures/demo-endpoint.json

# Replay (no capture)
unset ENCLAVE_FIXTURE_CAPTURE
node -e "<same script>"   # expect "fixture cache hit — using pre-generated proof"

# Commit the fixture
git add demo/fixtures/demo-endpoint.json
git commit -m "feat(05-07): commit demo-endpoint fixture via SDK capture mode (OPS-03)"
```

### Task 2 — Live preflight full-check (OPS-01)

```bash
cd facilitator && npm run dev   # keep running

export REGISTRY_FROZEN=1
export FACILITATOR_URL=http://localhost:4021
./scripts/preflight.sh full-check
echo "exit=$?"   # expect 0; expect stdout line "6 passed, 0 failed"
```

### Task 3 — DASH-02 cross-org isolation (browser)

1. `cd app && npm run dev`
2. Freighter account A → Create Org "Northfield" → deposit 10 USDC → enroll 1 agent
3. Freighter account B → Create Org "Ashford" → deposit 5 USDC → enroll 1 agent
4. Dashboard: paste Northfield admin key → expect Northfield-only rows
5. Clear, paste Ashford admin key → expect Ashford-only rows, ZERO Northfield data
6. Clear, paste random `Keypair.random()` secret → expect "No org found for this admin key" banner + cleared tables

## Decisions Made

- **Plan closed as PARTIAL by explicit user request.** The user chose not to approve the Task 1 checkpoint during this execution cycle and asked to close the plan with Tasks 1–3 deferred to the recording-day pre-flight. This is captured as the phase's closeout decision; it preserves honesty (no fabricated PASS signals) and produces a single self-contained checklist Franco can work from under pressure.
- **No `demo/fixtures/` directory created.** The user was explicit: "Do NOT create `demo/fixtures/demo-endpoint.json` — that's the live-run output Franco will produce." The plan respects that.
- **README not edited.** All four README checks and the one RUNBOOK check already pass. Editing README would be a noop with diff noise.

## Deviations from Plan

### Rule 4 — Architectural deferral (user-directed)

**1. Tasks 1–3 deferred to manual pre-flight instead of executed as in-plan human-verify checkpoints**
- **Found during:** Task 1 checkpoint presentation
- **Issue:** Plan structure assumed Franco would close each human-verify checkpoint interactively in the GSD flow. User indicated live-environment checks will be closed outside GSD as part of the recording-day pre-flight.
- **Fix:** Converted Tasks 1–3 from in-flow human-verify checkpoints to a deferred-pre-flight checklist inside `05-07-VERIFICATION.md`. Status changed from PASS to PARTIAL.
- **Files modified:** `.planning/phases/05-dashboard-ops-hardening/05-07-VERIFICATION.md` (re-written to reflect PARTIAL status + deferred-task commands)
- **Verification:** VERIFICATION.md states `Status: PARTIAL`; each deferred task is labeled `DEFERRED` with its pass condition and commands; phase status is `GAPS_OPEN`.
- **Committed in:** `38e5d06` (VERIFICATION.md commit)

---

**Total deviations:** 1 (Rule 4 — user-directed deferral)
**Impact on plan:** Plan closes with partial coverage rather than full closure. Phase 5 ships operationally ready but gates Tasks 1–3 outcomes on the recording-day pre-flight. No scope creep; the deferral is explicit, traceable in VERIFICATION.md and STATE.md, and carries the exact commands forward.

## Issues Encountered

None — Task 4 automated checks all passed on first run; deferral of Tasks 1–3 was a clean user-directed decision, not a blocker.

## User Setup Required

**Pre-recording-day manual steps** (outside GSD flow):

- Close Task 1 (SDK capture-mode dry run) — see commands above.
- Close Task 2 (live preflight full-check) — see commands above.
- Close Task 3 (DASH-02 cross-org isolation) — see browser steps above.

All three are documented in `.planning/phases/05-dashboard-ops-hardening/05-07-VERIFICATION.md` as a self-contained checklist.

## Next Phase Readiness

**Ready for Phase 6 (demo recording)** with caveats:

- Phase 5 automated coverage is complete. The dashboard UI, settlements log, nullifier precompute, SDK capture mode, preflight full-check, and ops docs are all in place (Plans 05-01 to 05-06).
- **Gate on pre-flight:** Franco must close Tasks 1–3 from 05-07-VERIFICATION.md before recording on 2026-04-16. If any of the three fails, it blocks Phase 6.
- `demo/fixtures/demo-endpoint.json` (required by the recorded video per the pre-generated-proofs posture) will land in Franco's pre-flight Task 1 commit, not from this plan.

---
*Phase: 05-dashboard-ops-hardening*
*Completed: 2026-04-13*

## Self-Check: PASSED

- `.planning/phases/05-dashboard-ops-hardening/05-07-VERIFICATION.md` — FOUND
- `.planning/phases/05-dashboard-ops-hardening/05-07-SUMMARY.md` — FOUND
- Commit `38e5d06` (VERIFICATION.md) — FOUND in git log
- `demo/fixtures/demo-endpoint.json` — **NOT CREATED** (intentional — deferred to Franco's pre-flight Task 1 run, per user directive; this is an expected absence, not a failure).

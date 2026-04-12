---
phase: 3
slug: agent-sdk-enclave-agent
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-11
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 29.7.0 + ts-jest (to be installed in `packages/agent/` — Wave 0) |
| **Config file** | `packages/agent/jest.config.js` — none yet, Wave 0 installs |
| **Quick run command** | `npx jest packages/agent/src/__tests__/ --no-coverage` |
| **Full suite command** | `cd app && npx jest --no-coverage` |
| **Estimated runtime** | ~15 seconds (unit tests only; live prover test ~5–10 s) |

---

## Sampling Rate

- **After every task commit:** Run `npx jest packages/agent/src/__tests__/ --no-coverage`
- **After every plan wave:** Run `cd app && npx jest --no-coverage`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 3-01-01 | 01 | 0 | SDK-01..07 | setup | `npx jest packages/agent/src/__tests__/ --no-coverage` | ❌ W0 | ⬜ pending |
| 3-02-01 | 02 | 1 | SDK-05 | manual/shell | `git check-ignore -v test.enclave.json` | ❌ W0 | ⬜ pending |
| 3-02-02 | 02 | 1 | SDK-06 | unit | `npx jest packages/agent/src/__tests__/logger.test.ts -x` | ❌ W0 | ⬜ pending |
| 3-03-01 | 03 | 1 | SDK-02, SDK-03, SDK-04 | unit + smoke | `npx jest packages/agent/src/__tests__/prover.test.ts -x` | ❌ W0 | ⬜ pending |
| 3-04-01 | 04 | 2 | SDK-07 | unit | `npx jest packages/agent/src/__tests__/witness.test.ts --testNamePattern="model-x"` | ❌ W0 | ⬜ pending |
| 3-05-01 | 05 | 3 | SDK-01 | unit (mocked) | `npx jest packages/agent/src/__tests__/fetch-interceptor.test.ts -x` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/agent/jest.config.js` — Jest + ts-jest config for ESM TypeScript agent package
- [ ] `packages/agent/package.json` — add `jest`, `ts-jest`, `@types/jest` as devDeps
- [ ] `packages/agent/src/__tests__/fetch-interceptor.test.ts` — stubs for SDK-01
- [ ] `packages/agent/src/__tests__/prover.test.ts` — stubs for SDK-02, SDK-03, SDK-04
- [ ] `packages/agent/src/__tests__/logger.test.ts` — stubs for SDK-06
- [ ] `packages/agent/src/__tests__/witness.test.ts` — stubs for SDK-07

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `.enclave.json` and `*-notes.json` files are gitignored | SDK-05 | git check-ignore requires actual file | Run `touch test.enclave.json && git check-ignore -v test.enclave.json && rm test.enclave.json`; must output the matching pattern |
| `agent.fetch()` completes end-to-end against live facilitator + real pool | SDK-01, SDK-04 | Requires live facilitator (Phase 2) and funded notes | Run the demo agent script against a local facilitator instance; verify HTTP 200 returned after 402 intercept |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

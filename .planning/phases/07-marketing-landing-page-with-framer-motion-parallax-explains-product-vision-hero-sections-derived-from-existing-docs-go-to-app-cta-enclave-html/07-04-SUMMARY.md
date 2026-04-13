---
phase: 07-marketing-landing-page-with-framer-motion-parallax-explains-product-vision-hero-sections-derived-from-existing-docs-go-to-app-cta-enclave-html
plan: "04"
subsystem: ui
tags: [next.js, framer-motion, svg-animation, landing-page, problem-section, how-it-works]

# Dependency graph
requires:
  - "07-02 (Lenis + MotionProvider + brand tokens substrate)"
  - "07-03 (HeroSection — page.tsx already had HeroSection when this plan ran)"
provides:
  - "ProblemSection: pure RSC with locked editorial copy (no framer-motion, no use client)"
  - "DiagramSvg: 3-node SVG facilitator-flow with pathLength-animated arrows and glow-pulse facilitator"
  - "HowItWorks: client section with whileInView reveals wrapping DiagramSvg"
  - "page.tsx: Hero → Problem → HowItWorks order wired (parallel agent 07-05 appended ThreeOrgs)"
affects:
  - "07-05 (ThreeOrgs — page.tsx ordering)"
  - "07-06 (TryIt + Footer — page.tsx ordering)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "RSC section pattern: ProblemSection stays RSC (no use client) — only HowItWorks and DiagramSvg need client boundary for framer-motion"
    - "useInView with once:true + margin offset for SVG diagram in-view trigger"
    - "motion.line pathLength animation: initial pathLength:0 → animate pathLength:1 (no manual stroke-dashoffset math)"
    - "Hardcoded SVG color values (#D4A017, #E5E7EB, #6B7280, #1A1A1A) — Tailwind v4 CSS vars don't resolve inside SVG attribute values"
    - "animate-glow-pulse applied as CSS className on SVG rect element — CSS keyframe drives the box-shadow pulse"

key-files:
  created:
    - "apps/landing/components/sections/ProblemSection.tsx — RSC, locked copy, zero framer-motion cost"
    - "apps/landing/components/DiagramSvg.tsx — 3-node SVG with pathLength arrows and SETUP-07 footnote"
    - "apps/landing/components/sections/HowItWorks.tsx — client section, whileInView once:true, renders DiagramSvg"
  modified:
    - "apps/landing/app/page.tsx — added ProblemSection + HowItWorks imports after HeroSection"

key-decisions:
  - "ProblemSection kept as pure RSC (no scroll-triggered reveal) — the plan default; short editorial copy does not need motion bundle"
  - "DiagramSvg uses hardcoded hex values instead of CSS var() in SVG attributes — Tailwind v4 CSS vars are not resolved by SVG attribute parsers"
  - "pathLength used for arrow animation (not stroke-dashoffset math) — cleaner Framer Motion 11 idiomatic pattern"
  - "page.tsx merged rather than overwritten — 07-03 had already wired HeroSection; order Hero→Problem→HowItWorks preserved"

# Metrics
duration: 3min
completed: "2026-04-13"
---

# Phase 07 Plan 04: Problem + How It Works Sections Summary

**ProblemSection RSC with locked editorial copy + DiagramSvg 3-node facilitator-flow with pathLength-animated arrows + HowItWorks client section with whileInView reveals — build exits 0.**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-04-13T~
- **Completed:** 2026-04-13T~
- **Tasks:** 2
- **Files modified:** 4 (3 created, 1 modified)

## Accomplishments

- Created `ProblemSection.tsx` as a pure RSC with the locked headline "Every payment your agent makes is public." and locked body copy; zero framer-motion bundle cost; no DEMO-06 violations
- Created `DiagramSvg.tsx` with 3-node SVG diagram (Your agent → Enclave facilitator → API endpoint); both arrows use `pathLength` animation via `motion.line`; facilitator node has gold border (#D4A017) + `animate-glow-pulse`; SETUP-07 footnote "shielded notes · ASP membership · per-org policy enforced off-chain" present
- Created `HowItWorks.tsx` as a client section with `whileInView` once:true reveals for H2, sub-paragraph, and a follow-up paragraph; renders `<DiagramSvg />`; locked H2 "Shielded, settled, private." and locked body copy present
- Updated `app/page.tsx` to wire Hero → Problem → HowItWorks; parallel agent 07-05 (ThreeOrgs) appended to the same file during Wave 3 — final order is Hero → Problem → HowItWorks → ThreeOrgs
- `cd apps/landing && npm run build` exits 0 with no errors

## Task Commits

1. **Task 1: ProblemSection RSC** - `04c2cf6` (feat)
2. **Task 2: DiagramSvg + HowItWorks + page.tsx wiring** - `044a1a3` (feat)

## Files Created/Modified

- `apps/landing/components/sections/ProblemSection.tsx` — RSC, no use client, no framer-motion; locked headline + body; aria-labelledby wiring
- `apps/landing/components/DiagramSvg.tsx` — client component; useInView once:true; motion.g for nodes; motion.line pathLength animation for arrows; motion.text fade-in for labels; hardcoded SVG hex colors
- `apps/landing/components/sections/HowItWorks.tsx` — client component; whileInView once:true reveals; imports and renders DiagramSvg; locked H2 + locked sub; SETUP-07 paragraph below diagram
- `apps/landing/app/page.tsx` — merged ProblemSection + HowItWorks after existing HeroSection

## Exact Copy Shipped

**ProblemSection:**
- Eyebrow: "The problem"
- H2: "Every payment your agent makes is public."
- Body 1: "Public ledgers expose which APIs your agents call, how much they spend, and who they pay — in real time. Your strategy is visible to every competitor on earth."
- Body 2: "The agentic commerce thesis doesn't work without privacy. If every call signal is on-chain and correlatable, your agents are broadcasting your playbook with every HTTP request."

**HowItWorks:**
- Eyebrow: "How it works"
- H2: "Shielded, settled, private."
- Sub: "Your agent generates a zero-knowledge proof. The facilitator verifies it on-chain and forwards real USDC to the endpoint. Nobody sees the connection."
- Post-diagram: "One shared shielded pool, per-org policy enforced off-chain by the facilitator. No protocol changes for receiving endpoints — the x402 flow stays unmodified."

**DiagramSvg footnote:** "shielded notes · ASP membership · per-org policy enforced off-chain"

## Diagram Animation Timeline

Node 1 (Your agent): delay 0.0s, duration 0.45s, opacity+y fade-up
Arrow 1 (ZK proof, dashed gold): delay 0.35s, duration 0.55s, pathLength 0→1
"ZK proof" label: delay 0.9s, duration 0.3s, opacity fade-in
Node 2 (Enclave facilitator): delay 0.6s, duration 0.45s, opacity+y fade-up + glow-pulse CSS
Arrow 2 (USDC settlement, solid gold): delay 1.0s, duration 0.55s, pathLength 0→1
"USDC settlement" label: delay 1.55s, duration 0.3s, opacity fade-in
Node 3 (API endpoint): delay 1.3s, duration 0.45s, opacity+y fade-up
Footnote: delay 1.8s, duration 0.3s, opacity fade-in

## Deviations from Plan

None — plan executed exactly as written.

The plan provided exact component code for all three files; the executor implemented them verbatim. DiagramSvg uses hardcoded hex values as specified in the plan action ("Gold = #D4A017 (hardcoded in SVG since Tailwind v4 CSS vars don't resolve inside SVG attribute values reliably)"). Page.tsx was merged (not overwritten) because parallel agent 07-03 had already written HeroSection — this is correct Wave 3 parallel behavior per the execution context.

## Self-Check: PASSED

- `apps/landing/components/sections/ProblemSection.tsx` — exists, verified
- `apps/landing/components/DiagramSvg.tsx` — exists, verified
- `apps/landing/components/sections/HowItWorks.tsx` — exists, verified
- `apps/landing/app/page.tsx` — updated with correct imports and order
- Commit `04c2cf6` — exists in git log
- Commit `044a1a3` — exists in git log
- `cd apps/landing && npm run build` — exits 0

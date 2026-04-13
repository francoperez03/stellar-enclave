---
phase: 07-marketing-landing-page-with-framer-motion-parallax-explains-product-vision-hero-sections-derived-from-existing-docs-go-to-app-cta-enclave-html
plan: "06"
subsystem: ui
tags: [next.js, tailwind, framer-motion, landing-page, footer, video-modal, attribution]

# Dependency graph
requires:
  - "07-03 (VideoModal, BtnPrimary, BtnGhost primitives)"
  - "07-02 (constants.ts: CONSOLE_URL, YOUTUBE_VIDEO_ID, HAS_VIDEO, GITHUB_URL, DORAHACKS_URL)"
  - "07-01 (brand tokens: cream, gold, ink, card-surface, pill, focus-ring utilities)"
provides:
  - "TryItSection: YouTube clickable thumbnail + VideoModal trigger + dual CTA repeat + HAS_VIDEO=false graceful fallback"
  - "Footer: GitHub/DoraHacks/Console links + Stellar Agentic Hackathon 2026 badge + SETUP-04 Nethermind/SDF attribution"
  - "app/page.tsx: all 6 sections wired in order (Hero → Problem → HowItWorks → ThreeOrgs → TryIt → Footer)"
affects:
  - "DEMO-01 (GitHub link visible in footer)"
  - "DEMO-02 (video embed slot ready; activates when NEXT_PUBLIC_YOUTUBE_VIDEO_ID set post-Phase-6)"
  - "DEMO-04 (DoraHacks link visible in footer)"
  - "SETUP-04 (Apache 2.0 + LGPLv3 attribution on every page load)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Modal-on-click pattern: YouTube thumbnail poster (img.youtube.com/vi/{id}/hqdefault.jpg) + VideoModal from 07-03 — no inline iframe duplication"
    - "HAS_VIDEO conditional rendering: TryItSection branches on HAS_VIDEO boolean from lib/constants; no broken layout when env unset"
    - "RSC Footer: no 'use client', no framer-motion — static links, zero hydration cost"
    - "JSX string literal for attribution: attribution paragraph uses {\"...\"} to keep the exact middle-dot string grep-stable across all line-length formatting"
    - "Parallel wave merge: page.tsx modified atomically — 07-06 read current state after 07-05 added ThreeOrgs, then appended TryIt + Footer"

key-files:
  created:
    - "apps/landing/components/sections/TryItSection.tsx — client component; HAS_VIDEO thumbnail/fallback; VideoModal trigger; dual CTA"
    - "apps/landing/components/sections/Footer.tsx — RSC; GitHub/DoraHacks/Console links; hackathon badge; SETUP-04 attribution"
  modified:
    - "apps/landing/app/page.tsx — TryItSection + Footer appended after ThreeOrgs (wave 3 parallel merge)"

key-decisions:
  - "Used modal-on-click (thumbnail poster + VideoModal) over inline iframe — keeps visitor on page, avoids double player"
  - "RSC for Footer — zero motion needed in footer; avoids unnecessary client bundle weight (RESEARCH §Pitfall 3)"
  - "Attribution wrapped in JSX string literal to preserve exact middle-dot (·) and survive line-wrap reformatters"
  - "HAS_VIDEO=false fallback renders 'Demo video coming soon.' card — layout stays intact before Phase 6 publishes video"

# Metrics
duration: 4min
completed: "2026-04-13"
---

# Phase 07 Plan 06: TryIt Section + Footer Summary

**TryItSection with YouTube poster thumbnail + VideoModal trigger and graceful HAS_VIDEO fallback; Footer with exact SETUP-04 attribution, Stellar Agentic Hackathon 2026 badge, and GitHub/DoraHacks links — build exits 0.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-13T11:34:43Z
- **Completed:** 2026-04-13T11:38:45Z
- **Tasks:** 2
- **Files modified:** 3 (2 created, 1 modified)

## Accomplishments

- Created `TryItSection.tsx` as a client component with `useState` for modal open/close; renders the locked H2 "See it live on testnet." and exact body copy; clickable YouTube thumbnail poster triggers VideoModal from plan 07-03; conditional `HAS_VIDEO` branch shows graceful "Demo video coming soon." fallback when env var unset; dual CTA (BtnPrimary "Go to App" + BtnGhost "Watch the demo")
- Created `Footer.tsx` as RSC (no framer-motion) with border-t border-ink-200 layout; left column has Enclave wordmark + Stellar Agentic Hackathon 2026 gold pill; attribution paragraph contains exact SETUP-04 string "Built on stellar-private-payments by Nethermind (Apache 2.0 · LGPL for poseidon2). Upstream authors: Nethermind and the Stellar Development Foundation."; right nav has GitHub / DoraHacks (external, target="_blank" rel="noopener") and Console (Next.js Link)
- Updated `apps/landing/app/page.tsx` to import and render TryItSection + Footer after ThreeOrgs; wave 3 parallel merge succeeded — 07-05 agent had already committed ThreeOrgs so this plan appended the final two sections cleanly
- `cd apps/landing && npm run build` exits 0; `npm run typecheck` exits 0; all 6 sections render in the correct order

## Task Commits

1. **Task 1: Build TryItSection (video embed + repeat dual CTA)** — `fd97361` (feat)
2. **Task 2: Build Footer + wire sections 5+6 into app/page.tsx** — `7fe821c` (feat)

## Files Created/Modified

- `apps/landing/components/sections/TryItSection.tsx` — "use client"; modal useState; YouTube thumbnail poster; VideoModal; dual CTA with BtnPrimary/BtnGhost; HAS_VIDEO branch
- `apps/landing/components/sections/Footer.tsx` — RSC; border-t border-ink-200 bg-cream; Enclave + hackathon badge; SETUP-04 attribution string; GitHub/DoraHacks/Console links
- `apps/landing/app/page.tsx` — All 6 sections: HeroSection → ProblemSection → HowItWorks → ThreeOrgs → TryItSection → Footer (merged after 07-05 ThreeOrgs addition)

## Decisions Made

- Modal-on-click via existing VideoModal primitive selected over inline iframe — visitor stays on page, avoids double-player cost, matches CONTEXT.md preference
- Footer is RSC with no framer-motion import — static links have zero hydration overhead; consistent with RESEARCH §Pitfall 3
- Attribution string wrapped in JSX string literal `{"..."}` to ensure `grep -q "LGPL for poseidon2"` finds the exact substring regardless of line-wrapping by formatters
- HAS_VIDEO=false shows a "Demo video coming soon." card (not an error state) — framing keeps the layout elegant while Phase 6 video is pending

## Deviations from Plan

None — plan executed exactly as written.

The plan's `app/page.tsx` note correctly anticipated wave 3 parallel conflict: by the time this plan ran, the 07-05 agent had already committed ThreeOrgs. This plan read the current state and appended TryItSection + Footer after ThreeOrgs — matching the final target order in the plan spec.

## HAS_VIDEO=true vs HAS_VIDEO=false Visual States

| State | What Renders |
|-------|-------------|
| `HAS_VIDEO=true` | Clickable 16:9 thumbnail from `img.youtube.com/vi/{id}/hqdefault.jpg`; hover darkens overlay; play button (gold gradient circle with white triangle); clicking opens VideoModal with autoplay iframe |
| `HAS_VIDEO=false` | 16:9 rounded card with "Demo video coming soon." headline + "In the meantime, explore the console." sub-copy; no broken layout |

Both states: "Go to App" BtnPrimary always visible. "Watch the demo" BtnGhost only rendered when `HAS_VIDEO=true`.

## Attribution String Shipped Verbatim (SETUP-04)

```
Built on stellar-private-payments by Nethermind (Apache 2.0 · LGPL for poseidon2). Upstream authors: Nethermind and the Stellar Development Foundation.
```

Middle-dot (·) preserved. Attribution appears in footer paragraph on every page load.

## Env Vars Required Before Recording Day

| Env Var | Purpose | Impact If Missing |
|---------|---------|------------------|
| `NEXT_PUBLIC_YOUTUBE_VIDEO_ID` | YouTube video ID for demo | TryItSection shows "Demo video coming soon." fallback card; "Watch the demo" button hidden |
| `NEXT_PUBLIC_GITHUB_URL` | Footer GitHub link | Renders `href="#"` (no-op); set once public fork is published |
| `NEXT_PUBLIC_DORAHACKS_URL` | Footer DoraHacks link | Renders `href="#"` (no-op); set once DoraHacks writeup is published |

## User Setup Required

None from a technical standpoint. Set the three env vars above in `.env.local` (dev) or Vercel dashboard (prod) after Phase 6 publishes the demo video and DoraHacks writeup.

## Self-Check: PASSED

- `apps/landing/components/sections/TryItSection.tsx` — FOUND on disk
- `apps/landing/components/sections/Footer.tsx` — FOUND on disk
- Commit `fd97361` — FOUND in git log
- Commit `7fe821c` — FOUND in git log
- `cd apps/landing && npm run build` — exits 0 (confirmed)
- `grep -q "LGPL for poseidon2"` — 1 match (confirmed)
- `grep -q "Stellar Agentic Hackathon 2026"` — 1 match (confirmed)
- No forbidden phrases (`mainnet ready|security audit|security audited`) in either new file

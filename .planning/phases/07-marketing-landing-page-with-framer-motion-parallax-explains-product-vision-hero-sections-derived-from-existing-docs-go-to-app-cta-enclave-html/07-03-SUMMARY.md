---
phase: 07-marketing-landing-page-with-framer-motion-parallax-explains-product-vision-hero-sections-derived-from-existing-docs-go-to-app-cta-enclave-html
plan: "03"
subsystem: ui
tags: [next.js, framer-motion, parallax, hero-section, ui-primitives, landing-page]

# Dependency graph
requires:
  - "07-01 (apps/landing/ scaffold + brand tokens + utility classes)"
  - "07-02 (Lenis + MotionProvider + constants module)"
provides:
  - "HeroSection: parallax-driven hero with sacred slogan, dual CTA, VideoModal integration"
  - "BtnPrimary: gold-filled CTA matching enclave.html .btn-primary"
  - "BtnGhost: ghost CTA with onClick support for modal triggers"
  - "Pill: status badge with pill-dot and optional animate-pulse-dot"
  - "VideoModal: YouTube iframe modal with AnimatePresence, Escape key, body scroll lock"
affects:
  - "07-04 (ProblemSection — imports BtnPrimary, Pill from @/components/ui)"
  - "07-05 (ThreeOrgs — imports BtnPrimary, Pill from @/components/ui)"
  - "07-06 (TryItSection — imports BtnPrimary, BtnGhost, VideoModal from @/components/ui)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Framer Motion useScroll() with no target reads window.scrollY — compatible with Lenis (RESEARCH §Pitfall 2)"
    - "Parallax orbs via useTransform: gold-top y [0,500]→[0,-120], gold-bottom y [0,500]→[0,80], grid y [0,500]→[0,-30]"
    - "Slogan rendered at full opacity on load (not faded-in) — SEO and reduced-motion accessibility"
    - "HAS_VIDEO guard: secondary CTA hidden when YOUTUBE_VIDEO_ID is empty string"
    - "BtnPrimary: server component using next/link for internal, <a> for external hrefs"
    - "BtnGhost: 'use client' component for onClick modal trigger support"
    - "VideoModal: AnimatePresence for enter/exit; Escape key + body overflow lock"

key-files:
  created:
    - "apps/landing/components/ui/BtnPrimary.tsx — gold-filled CTA; server component; next/link + <a> branching"
    - "apps/landing/components/ui/BtnGhost.tsx — ghost CTA; use client; onClick + href modes"
    - "apps/landing/components/ui/Pill.tsx — status badge; pill + pill-dot classes; animated option"
    - "apps/landing/components/ui/VideoModal.tsx — YouTube embed modal; AnimatePresence; Escape + scroll lock"
    - "apps/landing/components/sections/HeroSection.tsx — hero section; use client; parallax orbs + slogan + dual CTA"
  modified:
    - "apps/landing/app/page.tsx — wired HeroSection (parallel Wave 3 agents also added ProblemSection + HowItWorks)"

key-decisions:
  - "Slogan rendered at full opacity on load (not faded-in per UI-SPEC §Parallax slogan) — preserves SEO and reduced-motion accessibility; parallax orbs carry the atmosphere"
  - "BtnPrimary is a server component (no 'use client') — pure Tailwind class composition; next/link handles internal navigation without client hydration overhead"
  - "BtnGhost is 'use client' — accepts onClick for modal triggers; this is intentional, caller must use it within a client boundary"
  - "VideoModal uses AnimatePresence entry/exit at scale 0.94 for smooth modal feel matching UI-SPEC animate-scale-in"

# Metrics
duration: 2min
completed: "2026-04-13"
---

# Phase 07 Plan 03: Hero Section Summary

**Parallax hero with three-beat sacred slogan in DM Serif Display, dual CTA (Go to App / Watch the demo), and four reusable UI primitives (BtnPrimary, BtnGhost, Pill, VideoModal) — build exits 0.**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-13T11:33:50Z
- **Completed:** 2026-04-13T11:35:50Z
- **Tasks:** 2
- **Files modified:** 5 created + 1 modified (page.tsx)

## Accomplishments

- Created `BtnPrimary` (server component) with exact class string `"btn-primary focus-ring inline-flex items-center gap-2 text-white font-semibold text-sm rounded-md px-5 py-2.5"` — uses `next/link` for internal hrefs and `<a target="_blank">` for external hrefs
- Created `BtnGhost` (client component) with exact class string `"btn-ghost focus-ring inline-flex items-center gap-2 border border-ink-300 text-ink-900 text-sm font-semibold rounded-md px-5 py-2.5"` — supports `onClick` for modal triggers
- Created `Pill` (server component) rendering `<span className="pill">` with `pill-dot` child and optional `animate-pulse-dot`
- Created `VideoModal` (client component) with `AnimatePresence` entry/exit, YouTube iframe embed, Escape key handler, and body scroll lock
- Built `HeroSection` with Framer Motion parallax: gold orb top-left y 0→-120px, gold orb bottom-right y 0→80px, dotted grid y 0→-30px, all driven by `useScroll()` + `useTransform()`
- Sacred slogan "Your agents. / Your rules. / Out of sight." rendered as three separate `<span className="block">` elements inside an H1 with `font-headline` (DM Serif Display)
- Primary CTA "Go to App" links to `CONSOLE_URL` (default `/enclave.html`); secondary CTA "Watch the demo" guarded by `HAS_VIDEO` boolean from constants
- Eyebrow pill "Stellar Agentic Hackathon 2026" with animated gold dot
- `cd apps/landing && npm run build` exits 0; `npm run typecheck` exits 0

## Task Commits

1. **Task 1: Create reusable UI primitives (BtnPrimary, BtnGhost, Pill, VideoModal)** - `1c61dde` (feat)
2. **Task 2: Build HeroSection with Framer Motion parallax + slogan + dual CTA, wire into app/page.tsx** - `1100061` (feat)

## Files Created/Modified

- `apps/landing/components/ui/BtnPrimary.tsx` — server component; exact class string; next/link for internal, `<a>` for external
- `apps/landing/components/ui/BtnGhost.tsx` — `"use client"` component; exact class string; onClick + href branching
- `apps/landing/components/ui/Pill.tsx` — server component; pill + pill-dot; animated prop
- `apps/landing/components/ui/VideoModal.tsx` — `"use client"` component; AnimatePresence; role="dialog"; Escape key; body overflow lock
- `apps/landing/components/sections/HeroSection.tsx` — `"use client"` component; parallax orbs; three-beat slogan; dual CTA; VideoModal integration
- `apps/landing/app/page.tsx` — updated to import and render HeroSection (Wave 3 parallel agents also added ProblemSection + HowItWorks)

## Decisions Made

- **Slogan at full opacity on load** — UI-SPEC specified `opacity: 0→1` over scrollY [200, 400] for the slogan reveal. Plan notes explicitly authorize resolving this tradeoff by rendering at `opacity: 1` throughout to preserve SEO and reduced-motion accessibility. The parallax orbs and grid carry the atmospheric "earned" feel instead.
- **BtnPrimary as server component** — No `onClick` needed for primary CTAs (they are anchors/links). Keeping it server-rendered avoids unnecessary client hydration.
- **BtnGhost as client component** — The modal trigger pattern requires `onClick`, which mandates a client boundary. Downstream plans consuming this for link-only usage still work because the component detects `href` presence.

## Visual State Notes

- With `NEXT_PUBLIC_YOUTUBE_VIDEO_ID` unset (default): "Watch the demo" CTA is hidden; only "Go to App" CTA is shown
- With `NEXT_PUBLIC_YOUTUBE_VIDEO_ID` set: both CTAs visible; clicking "Watch the demo" opens VideoModal with YouTube iframe and `autoplay=1`
- Parallax orbs and grid drift activate on first scroll — orbs move at differential rates creating depth

## Verification Results

- `grep -E "OrgVault|GuildGate|s402|\bAcme\b|Globex|Initech" HeroSection.tsx` → 0 matches (PASS)
- `grep -c "Your agents\.\|Your rules\.\|Out of sight\." HeroSection.tsx` → 4 matches (PASS — 3 spans + 1 aria-label)
- `grep -c 'href={CONSOLE_URL}' HeroSection.tsx` → 1 match (PASS)
- `cd apps/landing && npm run build` → exits 0 (PASS)
- `cd apps/landing && npm run typecheck` → exits 0 (PASS)

## Deviations from Plan

### Auto-fixed Issues

None.

### Design Tradeoffs Applied

**1. [Plan Guidance] Slogan opacity kept at 1 throughout**
- **Documented in:** Plan Task 2 action block, "Note on slogan parallax timing"
- **Issue:** UI-SPEC specified slogan fade-in from `opacity: 0` at scrollY 0, but this breaks SEO and reduced-motion accessibility
- **Resolution:** Plan explicitly authorizes rendering at `opacity: 1` and using parallax orbs to carry atmosphere
- **No user checkpoint needed** — plan pre-authorized this decision

## Self-Check: PASSED

All created files verified to exist on disk. Both task commit hashes (`1c61dde`, `1100061`) found in git log.

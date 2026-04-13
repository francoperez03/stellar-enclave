---
phase: 07-marketing-landing-page-with-framer-motion-parallax-explains-product-vision-hero-sections-derived-from-existing-docs-go-to-app-cta-enclave-html
plan: "02"
subsystem: ui
tags: [next.js, lenis, framer-motion, next-font, og-image, brand-tokens, providers]

# Dependency graph
requires:
  - "07-01 (apps/landing/ scaffold + brand tokens + utility classes)"
provides:
  - "LenisProvider: client-only Lenis smooth-scroll with prefers-reduced-motion guard (duration 1.2, easing exponential decay)"
  - "MotionProvider: thin client wrapper around MotionConfig reducedMotion='user'"
  - "lib/constants.ts: typed env-var surface for CONSOLE_URL, YOUTUBE_VIDEO_ID, GITHUB_URL, DORAHACKS_URL with /enclave.html fallback"
  - "Root layout: DM Serif Display + Outfit + JetBrains Mono via next/font/google with CSS variable injection"
  - "Root layout: LenisProvider (outermost) + MotionProvider wrapping all children"
  - "opengraph-image.tsx: edge-rendered 1200x630 OG with cream/ink/gold palette and three-line slogan"
  - "icon.tsx: 32x32 gold gradient favicon with E lettermark"
affects:
  - "07-03 through 07-06 (Hero, Problem, HowItWorks, ThreeOrgs, TryIt, Footer — all inherit Lenis + MotionConfig + font vars)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Client provider boundary: LenisProvider + MotionProvider as 'use client' wrappers imported from RSC root layout"
    - "next/font/google with CSS variable assignment: DM_Serif_Display variable='--font-headline', Outfit variable='--font-sans', JetBrains_Mono variable='--font-mono'"
    - "Lenis init pattern: useEffect + useRef + requestAnimationFrame loop + cancelAnimationFrame cleanup + lenis.destroy()"
    - "prefers-reduced-motion guard: window.matchMedia check before Lenis init — returns early if reduced motion preferred"
    - "Edge runtime for OG image: export const runtime = 'edge' in opengraph-image.tsx — no external deps, ImageResponse from next/og"
    - "Single env-var constants module: lib/constants.ts exports typed constants with NEXT_PUBLIC_* env fallbacks"

key-files:
  created:
    - "apps/landing/components/providers/LenisProvider.tsx — client-only Lenis smooth scroll with reduced-motion guard"
    - "apps/landing/components/providers/MotionProvider.tsx — client wrapper around MotionConfig reducedMotion='user'"
    - "apps/landing/lib/constants.ts — typed env-var surface: CONSOLE_URL, YOUTUBE_VIDEO_ID, GITHUB_URL, DORAHACKS_URL, HAS_VIDEO"
    - "apps/landing/.env.example — documented NEXT_PUBLIC_* var names for dev and Vercel prod"
    - "apps/landing/app/opengraph-image.tsx — edge-rendered 1200x630 OG image with brand palette and slogan"
    - "apps/landing/app/icon.tsx — 32x32 gold gradient favicon"
  modified:
    - "apps/landing/app/layout.tsx — replaced placeholder with font wiring, providers, full metadata"
    - "apps/landing/app/page.tsx — updated placeholder using brand fonts and pill component"

key-decisions:
  - "LenisProvider is outermost wrapper, MotionProvider is inner — ensures Lenis scroll loop is active before Framer Motion hooks fire"
  - "Lenis config locked to duration 1.2 + exponential-decay easing (Math.min(1, 1.001 - Math.pow(2, -10 * t))) — tuned for Awwwards-feel per plan spec"
  - "prefers-reduced-motion guard returns early from useEffect — Lenis is a complete no-op for users with that OS preference (accessibility contract from UI-SPEC)"
  - "CONSOLE_URL fallback is /enclave.html (same-origin) — works for local dev and same-Vercel-project deploys"
  - "YOUTUBE_VIDEO_ID fallback is empty string; HAS_VIDEO boolean derived from length check — section plans use HAS_VIDEO to hide/show demo CTA"
  - "OG image uses edge runtime (no external font dep needed — fontFamily: 'serif' suffices for the slogan layout)"

# Metrics
duration: 8min
completed: "2026-04-13"
---

# Phase 07 Plan 02: Lenis Provider + Layout Wiring Summary

**Lenis smooth-scroll + Framer Motion MotionConfig wired into root layout with next/font/google for DM Serif Display/Outfit/JetBrains Mono, edge OG image, and typed env-var constants module — build exits 0.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-04-13T11:28:04Z
- **Completed:** 2026-04-13T11:36:00Z
- **Tasks:** 2
- **Files modified:** 8 (6 created, 2 modified)

## Accomplishments

- Created `LenisProvider` with Lenis 1.3 config (duration 1.2, exponential-decay easing, smoothWheel: true) and prefers-reduced-motion guard that skips initialization entirely for users with that OS preference
- Created `MotionProvider` as a minimal client wrapper around `MotionConfig reducedMotion="user"` — keeps server/client RSC boundary clean (root layout is RSC; Framer Motion is client-only)
- Wired root layout with all three brand fonts via next/font/google, each assigned to its CSS variable (--font-headline, --font-sans, --font-mono) matching the globals.css @theme block from Plan 07-01
- Created `lib/constants.ts` as the single typed env-var source of truth — all 4 NEXT_PUBLIC_* variables with correct fallbacks; `HAS_VIDEO` derived boolean for conditional CTA rendering
- Created edge-rendered opengraph-image.tsx (1200x630) with cream background (#F5F0E8), ink text (#1A1A1A), and gold radial gradient orbs; three-line slogan "Your agents. / Your rules. / Out of sight." on separate spans as specified
- Created 32x32 icon.tsx with gold gradient (#D4A017 → #B8890F) and "E" lettermark
- `cd apps/landing && npm run build` exits 0 with no errors; typecheck exits 0 with no errors

## Task Commits

1. **Task 1: LenisProvider + MotionProvider + constants module** - `f5a6c05` (feat)
2. **Task 2: Wire fonts + metadata + providers into layout + OG image + favicon** - `9dfac2d` (feat)

## Files Created/Modified

- `apps/landing/components/providers/LenisProvider.tsx` — Lenis init with RAF loop, prefers-reduced-motion guard, destroy on unmount
- `apps/landing/components/providers/MotionProvider.tsx` — `"use client"` wrapper around `MotionConfig reducedMotion="user"`
- `apps/landing/lib/constants.ts` — CONSOLE_URL (fallback /enclave.html), YOUTUBE_VIDEO_ID (fallback ""), GITHUB_URL (fallback #), DORAHACKS_URL (fallback #), HAS_VIDEO
- `apps/landing/.env.example` — all 4 NEXT_PUBLIC_* var names documented with example values
- `apps/landing/app/layout.tsx` — DM_Serif_Display + Outfit + JetBrains_Mono via next/font/google; LenisProvider (outer) + MotionProvider; metadata with openGraph + twitter
- `apps/landing/app/opengraph-image.tsx` — edge runtime, 1200x630, cream/ink/gold palette, three-span slogan
- `apps/landing/app/icon.tsx` — 32x32, gold gradient, "E" lettermark
- `apps/landing/app/page.tsx` — placeholder updated with font-headline, pill component, brand classes

## Decisions Made

- Lenis config values locked as specified in plan (duration: 1.2, exponential-decay easing) — these are the "Awwwards feel" tuned values; no deviation
- LenisProvider is outermost, MotionProvider is inner — ensures Lenis RAF loop starts before any Framer Motion scroll hooks are registered
- OG image uses edge runtime with built-in `serif` font family — avoids fetching external font assets at edge, sufficient for layout accuracy
- CONSOLE_URL fallback `/enclave.html` serves local dev and same-Vercel-project deployments (no external URL required for the default case)

## Lenis Configuration Details

```
duration: 1.2
easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t))  // exponential ease-out
orientation: "vertical"
smoothWheel: true
```

## Env-var Surface Snapshot

| Export | Env var | Fallback |
|--------|---------|---------|
| CONSOLE_URL | NEXT_PUBLIC_CONSOLE_URL | /enclave.html |
| YOUTUBE_VIDEO_ID | NEXT_PUBLIC_YOUTUBE_VIDEO_ID | "" |
| GITHUB_URL | NEXT_PUBLIC_GITHUB_URL | # |
| DORAHACKS_URL | NEXT_PUBLIC_DORAHACKS_URL | # |
| HAS_VIDEO | (derived) | false |

## Visual Regressions vs Plan 07-01 Placeholder

None. The `page.tsx` placeholder from 07-01 rendered "Enclave landing — scaffolded" in a centered h1. The updated placeholder renders "Scaffold ready" pill + "Enclave" in DM Serif Display 5xl on cream, which is the correct brand baseline. Fonts are now loaded via next/font/google rather than CSS imports, so the --font-headline CSS variable resolves to the actual Google Font rather than the Outfit fallback.

## Deviations from Plan

None - plan executed exactly as written.

## Visual Smoke Test (Manual — Not Automated)

`npm run dev` serves `http://localhost:3000` with:
- "Enclave" renders in DM Serif Display (serif) headline
- Cream `#F5F0E8` page background with gold radial gradient orbs visible in background
- "Scaffold ready" pill with green pulse dot
- Mouse-wheel scroll produces Lenis smooth scroll (eased, not native browser behavior)
- prefers-reduced-motion: reduce → Lenis skips init, native scroll remains

## Self-Check: PASSED

All created files verified to exist on disk. All task commit hashes found in git log.

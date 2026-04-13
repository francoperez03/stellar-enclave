---
phase: 07-marketing-landing-page-with-framer-motion-parallax-explains-product-vision-hero-sections-derived-from-existing-docs-go-to-app-cta-enclave-html
plan: "05"
subsystem: ui
tags: [next.js, framer-motion, scroll-animation, three-orgs, landing-page, brand-tokens]

# Dependency graph
requires:
  - "07-02 (LenisProvider + MotionProvider + globals.css utilities)"
  - "07-01 (brand token substrate: action-card, card-surface, card-lift, animate-glow-pulse)"
provides:
  - "OrgCard RSC primitive: action-card/card-surface/card-lift + font-headline h3 + archetype p + icon slot"
  - "PoolIcon RSC primitive: gold gradient shield with animate-glow-pulse, aria-label, shield SVG mark"
  - "ThreeOrgs client section: scroll-linked card convergence via useScroll offset [start 0.8, end 0.3]"
  - "Three dashed gold SVG lines + three staggered payment dots traveling card→pool"
  - "H2: 'Three rival funds. One pool. Zero cross-visibility.' — verbatim copy contract"
  - "Locked persona names: Northfield Capital / Ashford Partners / Bayridge Capital (POOL-02)"
affects:
  - "apps/landing/app/page.tsx (ThreeOrgs added after HowItWorks)"
  - "07-06 (TryIt + Footer — append to page.tsx after ThreeOrgs)"
  - "07-07 (deploy/smoke tests)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "RSC primitives for static card/icon, motion wrapping in client parent (OrgCard/PoolIcon are server, ThreeOrgs is client)"
    - "useScroll({ target: sectionRef, offset: ['start 0.8', 'end 0.3'] }) — long scroll window per RESEARCH Example 5"
    - "useTransform hoisted to const before JSX return — rules-of-hooks safe, avoids hook-in-JSX lint errors"
    - "SVG motion.line + motion.circle for convergence lines + payment dots driven by MotionValues"
    - "Staggered dot opacity offsets (0, 0.15, 0.3 start thresholds) simulate 400ms stagger at scrollYProgress pace"

key-files:
  created:
    - "apps/landing/components/ui/OrgCard.tsx — RSC org card with action-card brand classes + icon slot"
    - "apps/landing/components/ui/PoolIcon.tsx — RSC gold shield icon with glow-pulse"
    - "apps/landing/components/sections/ThreeOrgs.tsx — scroll-linked convergence section (client)"
  modified:
    - "apps/landing/app/page.tsx — ThreeOrgs imported and rendered after HowItWorks (parallel merge)"

key-decisions:
  - "OrgCard and PoolIcon are RSC (no use client) — motion wrapping happens in ThreeOrgs.tsx parent, keeping static card/icon renderable without JS"
  - "All useTransform calls hoisted to const in component body — prevents rules-of-hooks violation from hooks inside JSX"
  - "Stagger via scrollYProgress opacity offsets rather than CSS animation-delay — synchronized with actual scroll position for correct feel"
  - "page.tsx merge strategy: append import + JSX node after HowItWorks — preserves other parallel agents' additions"

requirements-completed:
  - POOL-02
  - DEMO-06

# Metrics
duration: 3min
completed: "2026-04-13"
---

# Phase 07 Plan 05: Three Orgs Section Summary

**Scroll-linked OrgCard convergence section with three rival quant funds converging toward a central gold PoolIcon — dashed gold lines + staggered payment dots visualize shared pool anonymity. Build exits 0.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-13T11:34:50Z
- **Completed:** 2026-04-13T11:37:24Z
- **Tasks:** 2
- **Files modified:** 4 (3 created, 1 modified)

## Accomplishments

- Created `OrgCard.tsx` as a pure RSC with the exact brand class composition `action-card card-surface card-lift border border-ink-200 rounded-xl p-6` per UI-SPEC §Component Inventory. Font-headline h3 for org name, xs/ink-500 p for archetype, optional icon slot.
- Created `PoolIcon.tsx` as a pure RSC with gold gradient (`--color-gold-500` → `--color-gold-600`), shield SVG path `M12 22s8-4 8-10V5`, and `animate-glow-pulse` class. aria-label + role="img" for accessibility.
- Built `ThreeOrgs.tsx` as a client component using `useScroll({ target: sectionRef, offset: ["start 0.8", "end 0.3"] })` — the long scroll window gives an unhurried, cinematic convergence per RESEARCH §Example 5.
- Implemented exact translateX/Y values per UI-SPEC §Three-Orgs Animation Spec: Northfield `[-120, 0]` X + `[-40, 0]` Y; Ashford `[-60, 0]` Y; Bayridge `[120, 0]` X + `[-40, 0]` Y.
- SVG layer with three `motion.line` convergence lines (dashed gold, opacity driven by `scrollYProgress` 0.45→0.75 range) and three `motion.circle` payment dots traveling along each line (staggered via opacity thresholds at 0/0.15/0.30).
- All `useTransform` calls hoisted to `const` declarations before JSX return to satisfy React rules-of-hooks.
- Merged ThreeOrgs into `apps/landing/app/page.tsx` after HowItWorks — page now includes Hero → Problem → HowItWorks → ThreeOrgs. Other wave 3 agents (07-06) subsequently added TryItSection and Footer.
- `cd apps/landing && npm run build` exits 0 in ~1.4s (compiled + static pages generated).

## Task Commits

1. **Task 1: Create OrgCard + PoolIcon UI primitives** - `a7aaaf6` (feat)
2. **Task 2: Build ThreeOrgs scroll-linked convergence + wire into page.tsx** - `93869d6` (feat)

## Files Created/Modified

- `apps/landing/components/ui/OrgCard.tsx` — RSC with action-card/card-surface/card-lift, font-headline h3, archetype p, icon slot (no use client)
- `apps/landing/components/ui/PoolIcon.tsx` — gold gradient shield, animate-glow-pulse, aria-label="Enclave shielded pool", shield path M12 22s8-4 (no use client)
- `apps/landing/components/sections/ThreeOrgs.tsx` — useScroll + 5 card-position useTransforms + 6 dot useTransforms + SVG motion layer; three locked persona names; locked H2 copy; final beat with middle-dot character
- `apps/landing/app/page.tsx` — ThreeOrgs import + JSX render added (append merge; other wave 3 agents also added TryItSection + Footer)

## Decisions Made

- RSC split: OrgCard and PoolIcon have no motion themselves — they are pure display primitives. The scroll-linked motion lives exclusively in ThreeOrgs. This keeps the card/icon renderable without JS hydration for static SSR rendering.
- Hoisted all `useTransform` to const before JSX — the plan noted the risk of `useTransform` called inline in `motion.circle cx={...}` JSX triggering rules-of-hooks lint. Hoisting is semantically identical and avoids the lint error entirely.
- Stagger approach: used opacity offset thresholds (0/0.15/0.30 scrollYProgress fractions within the 0.7→1 dotProgress range) rather than CSS `animation-delay` — keeps dot travel synchronized with actual scroll speed regardless of how fast the user scrolls.
- page.tsx parallel merge: appended import and JSX node after HowItWorks — did not overwrite the file, per parallel context instructions.

## Scroll Window Behavior

- **At scrollYProgress = 0:** All three cards at initial spread positions (Northfield: -120px left + -40px up; Ashford: -60px up; Bayridge: +120px right + -40px up). Lines invisible. Dots invisible.
- **At scrollYProgress = 0.25:** Cards 25% converged toward center. Lines still invisible (start at 0.45).
- **At scrollYProgress = 0.50:** Cards 50% converged. Lines at ~17% opacity (opacity mapped 0.45→0.75).
- **At scrollYProgress = 0.75:** Cards 75% converged. Lines at 100% opacity. Dots begin appearing (dotProgress 0.7→1 range starts).
- **At scrollYProgress = 1.00:** Cards fully at center (0,0). Lines fully visible. All three dots have traveled their full paths and faded out.

## Deviations from Plan

None - plan executed exactly as written. The `useTransform`-in-JSX note in the plan was preemptively applied: all transforms were hoisted to const declarations from the start.

## Self-Check: PASSED

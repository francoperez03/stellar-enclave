# Enclave Landing (`apps/landing/`)

Marketing landing page for Enclave — Next.js 15 App Router + Framer Motion 11 + Lenis + Tailwind v4.

**Status:** Phase 7 deliverable. Funnels visitors to the Treasury console at `/enclave.html` (the vanilla `app/enclave.html` surface).

---

## Quick start

From the repo root (`stellar-enclave/`):

```bash
# Install all workspace deps (first time only)
npm install

# Start the landing dev server
npm run -w @enclave/landing dev
# → http://localhost:3000
```

## Build + production

```bash
npm run -w @enclave/landing build
npm run -w @enclave/landing start
```

## Test

Uses Playwright for smoke + claim-hygiene specs.

```bash
# From apps/landing/:
cd apps/landing
npx playwright install chromium   # first run only
npm test                          # runs all specs (auto-starts dev server)
npm run test:smoke                # smoke only (fast)
```

## Environment variables

All four `NEXT_PUBLIC_*` variables are inlined into the client bundle. Set locally in `apps/landing/.env.local` (copy from `.env.example`), and in the Vercel dashboard for production.

| Variable | Purpose | Fallback if unset |
|----------|---------|-------------------|
| `NEXT_PUBLIC_CONSOLE_URL` | "Go to App" CTA destination (where `app/enclave.html` is hosted). | `/enclave.html` (same-origin) |
| `NEXT_PUBLIC_YOUTUBE_VIDEO_ID` | 11-char YouTube video ID for the 3-min demo. | `""` (hides the "Watch the demo" CTA; shows "coming soon" fallback card in TryIt section) |
| `NEXT_PUBLIC_GITHUB_URL` | Footer GitHub link. | `#` |
| `NEXT_PUBLIC_DORAHACKS_URL` | Footer DoraHacks writeup link. | `#` |

## Deploy to Vercel

1. From the Vercel dashboard, "Import project" pointing at this repo, **Root Directory = `apps/landing`**.
2. Framework preset: Next.js (auto-detected).
3. Build command: `npm run build` (or leave auto).
4. Output directory: `.next` (auto).
5. Install command: `npm install` run from repo root (Vercel handles this automatically when Root Directory is set and workspaces are detected).
6. In **Project Settings → Environment Variables**, set the four `NEXT_PUBLIC_*` variables from the table above.

### CTA resolution strategy

The "Go to App" CTA points to `NEXT_PUBLIC_CONSOLE_URL` when set, otherwise to `/enclave.html` on the same origin. Two supported deploy topologies:

- **Two separate Vercel projects (recommended for hackathon):** Landing at `https://enclave.vercel.app/`, console at `https://enclave-console.vercel.app/enclave.html`. Set `NEXT_PUBLIC_CONSOLE_URL=https://enclave-console.vercel.app/enclave.html`.
- **Single Vercel project (stretch):** The console's asset tree (`app/css/`, `app/js/`, etc.) is copied into `apps/landing/public/enclave-static/` and served via a Next.js rewrite. Not recommended — requires rewriting relative imports in vanilla JS. See `.planning/phases/07-.../07-RESEARCH.md` §Vercel Deploy for details.

## Project structure

```
apps/landing/
├── app/
│   ├── layout.tsx                # Root layout: fonts, metadata, LenisProvider, MotionProvider
│   ├── page.tsx                  # Home route: Hero → Problem → HowItWorks → ThreeOrgs → TryIt → Footer
│   ├── globals.css               # Tailwind v4 @theme + ported utilities from app/css/tailwind.src.css
│   ├── opengraph-image.tsx       # Dynamic OG image (edge runtime)
│   └── icon.tsx                  # Dynamic favicon
├── components/
│   ├── providers/                # LenisProvider, MotionProvider
│   ├── sections/                 # HeroSection, ProblemSection, HowItWorks, ThreeOrgs, TryItSection, Footer
│   ├── ui/                       # BtnPrimary, BtnGhost, Pill, VideoModal, OrgCard, PoolIcon
│   └── DiagramSvg.tsx            # Facilitator-flow SVG with pathLength animations
├── lib/
│   └── constants.ts              # Env-driven URL constants
├── e2e/
│   ├── smoke.spec.ts             # 9 layout + CTA + persona tests
│   └── claim-hygiene.spec.ts     # DEMO-06 + SETUP-07 forbidden-phrase scanner
├── playwright.config.ts
├── vercel.json
├── next.config.ts
├── postcss.config.mjs
├── tsconfig.json
└── package.json
```

## Copy locks

The following strings are sacred — do NOT edit without coordinating with the planning docs:

- **Slogan (H1):** "Your agents. Your rules. Out of sight." — three-line stack. Source: `DEMO-SCRIPT.md:118`.
- **Persona names (POOL-02):** Northfield Capital · Ashford Partners · Bayridge Capital.
- **Upstream attribution (SETUP-04):** "Built on stellar-private-payments by Nethermind (Apache 2.0 · LGPL for poseidon2)".
- **Hackathon badge:** "Stellar Agentic Hackathon 2026".

See `.planning/phases/07-.../07-UI-SPEC.md` §Copywriting Contract for the full list.

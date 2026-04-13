/**
 * Environment-driven URLs for the landing page.
 * Set in apps/landing/.env.local for dev, Vercel dashboard for prod.
 *
 * NEXT_PUBLIC_CONSOLE_URL      — "Go to App" CTA target. Fallback: /enclave.html.
 * NEXT_PUBLIC_YOUTUBE_VIDEO_ID — 11-char YouTube ID. Fallback: "" (hides "Watch the demo" CTA).
 * NEXT_PUBLIC_GITHUB_URL       — Footer GitHub link. Fallback: "#".
 * NEXT_PUBLIC_DORAHACKS_URL    — Footer DoraHacks link. Fallback: "#".
 */
export const CONSOLE_URL: string =
  process.env.NEXT_PUBLIC_CONSOLE_URL ?? "/enclave.html";

export const YOUTUBE_VIDEO_ID: string =
  process.env.NEXT_PUBLIC_YOUTUBE_VIDEO_ID ?? "";

export const GITHUB_URL: string =
  process.env.NEXT_PUBLIC_GITHUB_URL ?? "#";

export const DORAHACKS_URL: string =
  process.env.NEXT_PUBLIC_DORAHACKS_URL ?? "#";

export const HAS_VIDEO: boolean = YOUTUBE_VIDEO_ID.length > 0;

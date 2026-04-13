import Link from "next/link";
import { GITHUB_URL, DORAHACKS_URL } from "@/lib/constants";

export function Footer() {
  return (
    <footer className="border-t border-ink-200 bg-cream">
      <div className="max-w-5xl mx-auto px-6 py-10 flex flex-col md:flex-row items-start md:items-center gap-8 md:gap-6 justify-between text-sm">
        {/* Left: brand + hackathon badge */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="font-headline text-lg text-ink-900 leading-none">
              Enclave
            </span>
            <span className="pill">
              <span
                className="pill-dot bg-gold-500 animate-pulse-dot"
                aria-hidden="true"
              />
              Stellar Agentic Hackathon 2026
            </span>
          </div>
          <p className="text-ink-500 text-xs leading-relaxed max-w-sm">
            {"Built on stellar-private-payments by Nethermind (Apache 2.0 · LGPL for poseidon2). Upstream authors: Nethermind and the Stellar Development Foundation."}
          </p>
        </div>

        {/* Right: link cluster */}
        <nav
          aria-label="External links"
          className="flex flex-wrap items-center gap-6 text-ink-700"
        >
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="focus-ring inline-flex items-center gap-1.5 hover:text-ink-900 transition-colors"
            aria-label="Enclave GitHub repository"
          >
            <svg
              className="w-4 h-4"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M12 .5A11.5 11.5 0 0 0 .5 12a11.5 11.5 0 0 0 7.86 10.93c.57.1.78-.25.78-.55 0-.27 0-1-.02-1.96-3.2.69-3.87-1.54-3.87-1.54-.52-1.32-1.27-1.67-1.27-1.67-1.04-.71.08-.7.08-.7 1.15.08 1.75 1.18 1.75 1.18 1.02 1.75 2.68 1.25 3.33.95.1-.74.4-1.25.72-1.54-2.55-.29-5.24-1.28-5.24-5.68 0-1.25.45-2.27 1.18-3.07-.12-.3-.51-1.48.11-3.08 0 0 .97-.31 3.17 1.17a11 11 0 0 1 5.78 0c2.2-1.48 3.17-1.17 3.17-1.17.62 1.6.23 2.78.11 3.08.73.8 1.18 1.82 1.18 3.07 0 4.41-2.7 5.39-5.26 5.67.41.35.78 1.05.78 2.12 0 1.53-.01 2.77-.01 3.15 0 .3.21.66.79.54A11.5 11.5 0 0 0 23.5 12 11.5 11.5 0 0 0 12 .5z" />
            </svg>
            GitHub
          </a>
          <a
            href={DORAHACKS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="focus-ring inline-flex items-center gap-1.5 hover:text-ink-900 transition-colors"
            aria-label="Enclave DoraHacks submission"
          >
            DoraHacks
            <svg
              className="w-3.5 h-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M14 5h5v5M19 5l-8 8M9 5H5v14h14v-4"
              />
            </svg>
          </a>
          <Link
            href="/enclave.html"
            className="focus-ring inline-flex items-center gap-1.5 hover:text-ink-900 transition-colors"
            aria-label="Enclave Treasury console"
          >
            Console
          </Link>
        </nav>
      </div>
    </footer>
  );
}

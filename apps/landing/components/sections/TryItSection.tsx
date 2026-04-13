"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { BtnPrimary } from "@/components/ui/BtnPrimary";
import { BtnGhost } from "@/components/ui/BtnGhost";
import { VideoModal } from "@/components/ui/VideoModal";
import { CONSOLE_URL, YOUTUBE_VIDEO_ID, HAS_VIDEO } from "@/lib/constants";

export function TryItSection() {
  const [videoOpen, setVideoOpen] = useState(false);

  const thumbnailSrc = HAS_VIDEO
    ? `https://img.youtube.com/vi/${YOUTUBE_VIDEO_ID}/hqdefault.jpg`
    : "";

  return (
    <section
      className="relative py-24 md:py-32 px-6"
      aria-labelledby="try-it-heading"
    >
      <div className="max-w-4xl mx-auto flex flex-col gap-10 items-center text-center">
        <p className="text-xs tracking-[0.14em] uppercase text-ink-500 font-semibold">
          Try it
        </p>

        <motion.h2
          id="try-it-heading"
          className="font-headline text-ink-900 text-4xl md:text-5xl leading-[1.1]"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          See it live on testnet.
        </motion.h2>

        <motion.p
          className="text-ink-700 text-lg md:text-xl leading-relaxed max-w-2xl"
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          Built on Stellar, verifiable on Stellar Expert. Every proof, every
          payment, every settlement — on-chain.
        </motion.p>

        {/* Video card — either clickable thumbnail or graceful fallback */}
        {HAS_VIDEO ? (
          <motion.button
            type="button"
            onClick={() => setVideoOpen(true)}
            className="group relative w-full max-w-3xl aspect-video rounded-2xl overflow-hidden card-surface border border-ink-200 focus-ring"
            aria-label="Play the 3-minute Enclave demo video"
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.5, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
          >
            <img
              src={thumbnailSrc}
              alt="Enclave demo video thumbnail"
              className="w-full h-full object-cover"
            />
            <span className="absolute inset-0 flex items-center justify-center bg-ink-900/30 group-hover:bg-ink-900/40 transition-colors">
              <span
                className="w-20 h-20 rounded-full flex items-center justify-center shadow-lg shadow-gold-500/40"
                style={{
                  backgroundImage:
                    "linear-gradient(135deg, var(--color-gold-500) 0%, var(--color-gold-600) 100%)",
                }}
              >
                <svg
                  className="w-9 h-9 text-white drop-shadow-sm ml-1"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M6.5 5.5v13l11-6.5z" />
                </svg>
              </span>
            </span>
          </motion.button>
        ) : (
          <motion.div
            className="w-full max-w-3xl aspect-video rounded-2xl card-surface border border-ink-200 flex flex-col items-center justify-center gap-3 text-center px-6"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.5 }}
          >
            <p className="font-headline text-ink-900 text-2xl">
              Demo video coming soon.
            </p>
            <p className="text-ink-500 text-sm max-w-md">
              The 3-minute walkthrough will land here once Phase 6 publishes it.
              In the meantime, explore the console.
            </p>
          </motion.div>
        )}

        {/* Dual CTA repeat */}
        <div className="flex flex-col sm:flex-row gap-3 items-center mt-4">
          <BtnPrimary
            href={CONSOLE_URL}
            ariaLabel="Go to the Enclave Treasury console"
          >
            Go to App
            <svg
              className="w-4 h-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M14 5l7 7m0 0l-7 7m7-7H3"
              />
            </svg>
          </BtnPrimary>
          {HAS_VIDEO && (
            <BtnGhost
              onClick={() => setVideoOpen(true)}
              ariaLabel="Watch the 3-minute demo video"
            >
              <svg
                className="w-4 h-4"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M6.5 5.5v13l11-6.5z" />
              </svg>
              Watch the demo
            </BtnGhost>
          )}
        </div>
      </div>

      <VideoModal
        isOpen={videoOpen}
        onClose={() => setVideoOpen(false)}
        videoId={YOUTUBE_VIDEO_ID}
      />
    </section>
  );
}

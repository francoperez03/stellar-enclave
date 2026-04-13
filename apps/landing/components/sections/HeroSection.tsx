"use client";

import { useRef, useState } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { BtnPrimary } from "@/components/ui/BtnPrimary";
import { BtnGhost } from "@/components/ui/BtnGhost";
import { Pill } from "@/components/ui/Pill";
import { VideoModal } from "@/components/ui/VideoModal";
import { EnclaveShield3D } from "@/components/ui/EnclaveShield3D";
import { CONSOLE_URL, HAS_VIDEO, YOUTUBE_VIDEO_ID } from "@/lib/constants";

export function HeroSection() {
  const ref = useRef<HTMLElement>(null);
  const [videoOpen, setVideoOpen] = useState(false);

  // Global scrollY — useScroll() with no target reads window.scrollY, compatible with Lenis per RESEARCH §Pitfall 2.
  const { scrollY } = useScroll();

  // Parallax transforms — exact values from UI-SPEC §Animation Contract / Parallax table.
  const orbTopY = useTransform(scrollY, [0, 500], [0, -120]);
  const orbBottomY = useTransform(scrollY, [0, 500], [0, 80]);
  const gridY = useTransform(scrollY, [0, 500], [0, -30]);

  // Slogan: rendered at full opacity on load (SEO + reduced-motion users always see the slogan).
  // Parallax orbs and grid carry the "earned" atmospheric feel.
  const sloganOpacity = useTransform(scrollY, [0, 120, 320], [1, 1, 1]);
  const sloganY = useTransform(scrollY, [0, 500], [0, 0]);

  return (
    <section
      ref={ref}
      className="relative min-h-screen overflow-hidden flex items-center justify-center"
      aria-label="Enclave hero — Your agents. Your rules. Out of sight."
    >
      {/* Ambient gold orb top-left (decorative — aria-hidden). Parallax via motion.div. */}
      <motion.div
        style={{ y: orbTopY }}
        className="pointer-events-none absolute top-[8%] left-[6%] w-[28rem] h-[28rem] rounded-full"
        aria-hidden="true"
      >
        <div
          className="w-full h-full rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(212,160,23,0.18) 0%, transparent 62%)",
          }}
        />
      </motion.div>

      {/* Ambient gold orb bottom-right. */}
      <motion.div
        style={{ y: orbBottomY }}
        className="pointer-events-none absolute bottom-[6%] right-[4%] w-[24rem] h-[24rem] rounded-full"
        aria-hidden="true"
      >
        <div
          className="w-full h-full rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(212,160,23,0.13) 0%, transparent 60%)",
          }}
        />
      </motion.div>

      {/* Dotted grid drift layer — subtle vertical drift per UI-SPEC. */}
      <motion.div
        style={{ y: gridY }}
        className="pointer-events-none absolute inset-0"
        aria-hidden="true"
      >
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(rgba(26,26,26,0.035) 1px, transparent 1px)",
            backgroundSize: "22px 22px",
          }}
        />
      </motion.div>

      <EnclaveShield3D className="absolute inset-0 z-0" />

      {/* Content — slogan + sub-line + dual CTA. */}
      <motion.div
        style={{ opacity: sloganOpacity, y: sloganY }}
        className="relative z-10 flex flex-col items-center gap-14 text-center px-6 max-w-3xl"
      >
        <Pill dotColor="bg-gold-500" animated>
          <span className="text-xs tracking-[0.12em] uppercase">
            Stellar Agentic Hackathon 2026
          </span>
        </Pill>

        <div className="text-xs md:text-sm tracking-[0.18em] uppercase text-ink-600 font-mono">
          Enclave
        </div>

        {/* SACRED SLOGAN — three-line stack. No edits. Source: DEMO-SCRIPT.md:118. */}
        <h1 className="font-headline text-ink-900 leading-[1.05] text-[clamp(3rem,8vw,5rem)]">
          <span className="block">Your agents.</span>
          <span className="block">Your rules.</span>
          <span className="block">Out of sight.</span>
        </h1>

        <p className="text-ink-500 text-lg md:text-xl max-w-xl leading-relaxed">
          Enclave is the shielded organization layer for autonomous agents on Stellar.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 items-center">
          <BtnPrimary href={CONSOLE_URL} ariaLabel="Go to the Enclave Treasury console">
            Launch Enclave
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </BtnPrimary>
          {HAS_VIDEO && (
            <BtnGhost onClick={() => setVideoOpen(true)} ariaLabel="Watch the 3-minute demo video">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M6.5 5.5v13l11-6.5z" />
              </svg>
              Watch the demo
            </BtnGhost>
          )}
        </div>
      </motion.div>

      <VideoModal
        isOpen={videoOpen}
        onClose={() => setVideoOpen(false)}
        videoId={YOUTUBE_VIDEO_ID}
      />
    </section>
  );
}

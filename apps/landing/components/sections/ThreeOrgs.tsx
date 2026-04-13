"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { OrgCard } from "@/components/ui/OrgCard";
import { PoolIcon } from "@/components/ui/PoolIcon";

const GOLD = "#D4A017";

// Locked persona names — POOL-02 + naming conventions. Never substitute.
const ORGS = [
  { name: "Northfield Capital", archetype: "Quant fund · New York" },
  { name: "Ashford Partners", archetype: "Quant fund · London" },
  { name: "Bayridge Capital", archetype: "Quant fund · Singapore" },
] as const;

export function ThreeOrgs() {
  const sectionRef = useRef<HTMLElement>(null);

  // Scroll progress scoped to this section — starts when top is 80% down viewport,
  // reaches 1 when bottom is 30% up viewport. Long window for unhurried convergence.
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start 0.8", "end 0.3"],
  });

  // Card convergence — exact values from UI-SPEC §Three-Orgs Animation Spec.
  const northfieldX = useTransform(scrollYProgress, [0, 1], [-120, 0]);
  const northfieldY = useTransform(scrollYProgress, [0, 1], [-40, 0]);
  const ashfordY = useTransform(scrollYProgress, [0, 1], [-60, 0]);
  const bayridgeX = useTransform(scrollYProgress, [0, 1], [120, 0]);
  const bayridgeY = useTransform(scrollYProgress, [0, 1], [-40, 0]);

  // Convergence-line opacity — lines appear as cards get close to the pool.
  const linesOpacity = useTransform(scrollYProgress, [0.45, 0.75], [0, 1]);

  // Payment-dot travel — dots travel along the lines at end of convergence.
  const dotProgress = useTransform(scrollYProgress, [0.7, 1], [0, 1]);

  // Hoisted useTransform for each payment dot position and opacity to avoid
  // calling hooks inside JSX (React rules-of-hooks constraint).
  const dot1Cx = useTransform(dotProgress, [0, 1], [140, 400]);
  const dot1Opacity = useTransform(dotProgress, [0, 0.1, 0.95, 1], [0, 1, 1, 0]);

  const dot2Cy = useTransform(dotProgress, [0, 1], [120, 240]);
  const dot2Opacity = useTransform(dotProgress, [0.15, 0.25, 0.95, 1], [0, 1, 1, 0]);

  const dot3Cx = useTransform(dotProgress, [0, 1], [660, 400]);
  const dot3Opacity = useTransform(dotProgress, [0.3, 0.4, 0.95, 1], [0, 1, 1, 0]);

  return (
    <section
      ref={sectionRef}
      className="relative py-28 md:py-40 px-6"
      aria-labelledby="three-orgs-heading"
    >
      <div className="max-w-5xl mx-auto flex flex-col gap-16 items-center text-center">
        <p className="text-xs tracking-[0.14em] uppercase text-ink-500 font-semibold">
          The big idea
        </p>

        <motion.h2
          id="three-orgs-heading"
          className="font-headline text-ink-900 text-4xl md:text-5xl leading-[1.1] max-w-3xl"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          Three rival funds. One pool. Zero cross-visibility.
        </motion.h2>

        <motion.p
          className="text-ink-500 text-base md:text-lg max-w-2xl leading-relaxed"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          Each fund pre-funds its shielded treasury. Each sends agents to pay
          the same APIs. On-chain, every payment looks identical — same pool,
          same contract, no way to tell which fund moved which dollar.
        </motion.p>

        {/* Convergence stage — 3 cards + central pool + lines */}
        <div className="relative w-full max-w-4xl h-[420px] md:h-[480px] flex items-center justify-center">
          {/* SVG layer: lines from each card to pool + traveling payment dots */}
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none"
            viewBox="0 0 800 480"
            preserveAspectRatio="xMidYMid meet"
            aria-hidden="true"
          >
            {/* Line: Northfield (left) → pool */}
            <motion.line
              x1="140"
              y1="240"
              x2="400"
              y2="240"
              stroke={GOLD}
              strokeWidth="1.5"
              strokeDasharray="5 4"
              strokeLinecap="round"
              style={{ opacity: linesOpacity }}
            />
            {/* Line: Ashford (center-above) → pool */}
            <motion.line
              x1="400"
              y1="120"
              x2="400"
              y2="240"
              stroke={GOLD}
              strokeWidth="1.5"
              strokeDasharray="5 4"
              strokeLinecap="round"
              style={{ opacity: linesOpacity }}
            />
            {/* Line: Bayridge (right) → pool */}
            <motion.line
              x1="660"
              y1="240"
              x2="400"
              y2="240"
              stroke={GOLD}
              strokeWidth="1.5"
              strokeDasharray="5 4"
              strokeLinecap="round"
              style={{ opacity: linesOpacity }}
            />

            {/* Payment dot 1 — Northfield → pool */}
            <motion.circle
              r="5"
              fill={GOLD}
              cy="240"
              cx={dot1Cx}
              style={{ opacity: dot1Opacity }}
            />
            {/* Payment dot 2 — Ashford → pool (staggered 400ms via opacity offset) */}
            <motion.circle
              r="5"
              fill={GOLD}
              cx="400"
              cy={dot2Cy}
              style={{ opacity: dot2Opacity }}
            />
            {/* Payment dot 3 — Bayridge → pool (staggered 800ms via opacity offset) */}
            <motion.circle
              r="5"
              fill={GOLD}
              cy="240"
              cx={dot3Cx}
              style={{ opacity: dot3Opacity }}
            />
          </svg>

          {/* Card layer: 3 cards positioned with CSS absolute, each wrapped in motion for x/y drive */}
          <motion.div
            className="absolute left-0 top-1/2 -translate-y-1/2"
            style={{ x: northfieldX, y: northfieldY }}
          >
            <OrgCard name="Northfield Capital" archetype={ORGS[0].archetype} />
          </motion.div>

          <motion.div
            className="absolute left-1/2 top-0 -translate-x-1/2"
            style={{ y: ashfordY }}
          >
            <OrgCard name="Ashford Partners" archetype={ORGS[1].archetype} />
          </motion.div>

          <motion.div
            className="absolute right-0 top-1/2 -translate-y-1/2"
            style={{ x: bayridgeX, y: bayridgeY }}
          >
            <OrgCard name="Bayridge Capital" archetype={ORGS[2].archetype} />
          </motion.div>

          {/* Central pool — always at center */}
          <div className="relative z-10">
            <PoolIcon />
          </div>
        </div>

        <p className="text-ink-500 text-sm max-w-xl leading-relaxed">
          1 pool · 3 funds · 0 cross-visibility.
        </p>
      </div>
    </section>
  );
}

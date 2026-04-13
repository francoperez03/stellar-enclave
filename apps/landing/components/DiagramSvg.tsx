"use client";

import { motion, useInView } from "framer-motion";
import { useRef } from "react";

const GOLD = "#D4A017";
const INK_200 = "#E5E7EB";
const INK_500 = "#6B7280";
const INK_900 = "#1A1A1A";

export function DiagramSvg() {
  const ref = useRef<SVGSVGElement>(null);
  const inView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <svg
      ref={ref}
      viewBox="0 0 720 180"
      className="w-full max-w-3xl mx-auto"
      role="img"
      aria-label="Enclave facilitator flow: agent generates a shielded proof, facilitator verifies it on-chain and forwards USDC to the API endpoint."
    >
      {/* Node 1: Agent */}
      <motion.g
        initial={{ opacity: 0, y: 8 }}
        animate={inView ? { opacity: 1, y: 0 } : undefined}
        transition={{ duration: 0.45, delay: 0, ease: [0.16, 1, 0.3, 1] }}
      >
        <rect x="20" y="45" width="160" height="60" rx="12" fill="#FFFFFF" stroke={INK_200} strokeWidth="1" />
        <text x="100" y="72" textAnchor="middle" fontFamily="Outfit, sans-serif" fontSize="14" fontWeight="600" fill={INK_900}>Your agent</text>
        <text x="100" y="92" textAnchor="middle" fontFamily="Outfit, sans-serif" fontSize="11" fill={INK_500}>holds shielded notes</text>
      </motion.g>

      {/* Arrow 1: Agent → Facilitator (dashed gold, ZK proof) */}
      <motion.line
        x1="182" y1="75" x2="278" y2="75"
        stroke={GOLD} strokeWidth="2" strokeDasharray="6 4" strokeLinecap="round"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={inView ? { pathLength: 1, opacity: 1 } : undefined}
        transition={{ duration: 0.55, delay: 0.35, ease: "easeOut" }}
      />
      <motion.text
        x="230" y="60" textAnchor="middle"
        fontFamily="Outfit, sans-serif" fontSize="11" fontWeight="600" fill={GOLD}
        initial={{ opacity: 0 }}
        animate={inView ? { opacity: 1 } : undefined}
        transition={{ duration: 0.3, delay: 0.9 }}
      >
        ZK proof
      </motion.text>

      {/* Node 2: Facilitator — gold border + glow-pulse on the group via CSS class */}
      <motion.g
        initial={{ opacity: 0, y: 8 }}
        animate={inView ? { opacity: 1, y: 0 } : undefined}
        transition={{ duration: 0.45, delay: 0.6, ease: [0.16, 1, 0.3, 1] }}
      >
        <rect x="280" y="45" width="160" height="60" rx="12" fill="#FFFFFF" stroke={GOLD} strokeWidth="2" className="animate-glow-pulse" />
        <text x="360" y="72" textAnchor="middle" fontFamily="Outfit, sans-serif" fontSize="14" fontWeight="600" fill={INK_900}>Enclave facilitator</text>
        <text x="360" y="92" textAnchor="middle" fontFamily="Outfit, sans-serif" fontSize="11" fill={INK_500}>verifies proof on-chain</text>
      </motion.g>

      {/* Arrow 2: Facilitator → Endpoint (solid gold, USDC) */}
      <motion.line
        x1="442" y1="75" x2="538" y2="75"
        stroke={GOLD} strokeWidth="2" strokeLinecap="round"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={inView ? { pathLength: 1, opacity: 1 } : undefined}
        transition={{ duration: 0.55, delay: 1.0, ease: "easeOut" }}
      />
      <motion.text
        x="490" y="60" textAnchor="middle"
        fontFamily="Outfit, sans-serif" fontSize="11" fontWeight="600" fill={GOLD}
        initial={{ opacity: 0 }}
        animate={inView ? { opacity: 1 } : undefined}
        transition={{ duration: 0.3, delay: 1.55 }}
      >
        USDC settlement
      </motion.text>

      {/* Node 3: Endpoint */}
      <motion.g
        initial={{ opacity: 0, y: 8 }}
        animate={inView ? { opacity: 1, y: 0 } : undefined}
        transition={{ duration: 0.45, delay: 1.3, ease: [0.16, 1, 0.3, 1] }}
      >
        <rect x="540" y="45" width="160" height="60" rx="12" fill="#FFFFFF" stroke={INK_200} strokeWidth="1" />
        <text x="620" y="72" textAnchor="middle" fontFamily="Outfit, sans-serif" fontSize="14" fontWeight="600" fill={INK_900}>API endpoint</text>
        <text x="620" y="92" textAnchor="middle" fontFamily="Outfit, sans-serif" fontSize="11" fill={INK_500}>receives real USDC</text>
      </motion.g>

      {/* Footnote — shielded notes + ASP annotation */}
      <motion.text
        x="360" y="160" textAnchor="middle"
        fontFamily="Outfit, sans-serif" fontSize="11" fill={INK_500}
        initial={{ opacity: 0 }}
        animate={inView ? { opacity: 1 } : undefined}
        transition={{ duration: 0.3, delay: 1.8 }}
      >
        shielded notes · ASP membership · per-org policy enforced off-chain
      </motion.text>
    </svg>
  );
}

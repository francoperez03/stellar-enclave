"use client";

import { motion } from "framer-motion";
import { DiagramSvg } from "@/components/DiagramSvg";

export function HowItWorks() {
  return (
    <section
      className="relative py-24 md:py-32 px-6"
      aria-labelledby="how-it-works-heading"
    >
      <div className="max-w-4xl mx-auto flex flex-col gap-12 items-center text-center">
        <p className="text-xs tracking-[0.14em] uppercase text-ink-500 font-semibold">
          How it works
        </p>

        <motion.h2
          id="how-it-works-heading"
          className="font-headline text-ink-900 text-4xl md:text-5xl leading-[1.1]"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          Shielded, settled, private.
        </motion.h2>

        <motion.p
          className="text-ink-700 text-lg md:text-xl leading-relaxed max-w-2xl"
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.5, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
        >
          Your agent generates a zero-knowledge proof. The facilitator verifies
          it on-chain and forwards real USDC to the endpoint. Nobody sees the
          connection.
        </motion.p>

        <DiagramSvg />

        <motion.p
          className="text-ink-500 text-base max-w-2xl leading-relaxed"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.5, delay: 0.3 }}
        >
          One shared shielded pool, per-org policy enforced off-chain by the
          facilitator. No protocol changes for receiving endpoints — the
          x402 flow stays unmodified.
        </motion.p>
      </div>
    </section>
  );
}

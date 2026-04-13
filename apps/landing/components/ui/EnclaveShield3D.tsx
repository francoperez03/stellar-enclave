"use client";

import { useEffect, useRef } from "react";
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from "framer-motion";

type Layer = {
  z: number;
  strokeWidth: number;
  color: string;
  opacity: number;
  blur: number;
  isCenter: boolean;
};

const LAYERS: Layer[] = [
  { z: -80, strokeWidth: 1.5, color: "var(--color-ink-500)", opacity: 0.15, blur: 1, isCenter: false },
  { z: -40, strokeWidth: 2, color: "var(--color-ink-500)", opacity: 0.25, blur: 0.5, isCenter: false },
  { z: 0, strokeWidth: 3, color: "var(--color-gold-500)", opacity: 1.0, blur: 0, isCenter: true },
  { z: 40, strokeWidth: 2, color: "var(--color-gold-500)", opacity: 0.75, blur: 0, isCenter: false },
  { z: 80, strokeWidth: 1.5, color: "var(--color-gold-500)", opacity: 0.4, blur: 0, isCenter: false },
];

const SHIELD_PATH = "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z";

type Props = {
  className?: string;
};

export function EnclaveShield3D({ className = "" }: Props) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const staticMode = useReducedMotion() === true;

  const { scrollY } = useScroll();
  const scrollRotX = useTransform(scrollY, [0, 500], [0, -6]);
  const scrollRotY = useTransform(scrollY, [0, 500], [0, 8]);
  const scale = useTransform(scrollY, [0, 500], [1, 1.04]);
  const opacity = useTransform(scrollY, [0, 500], [1, 0.6]);

  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const mouseRotY = useTransform(mouseX, [-1, 1], [-4, 4]);
  const mouseRotX = useTransform(mouseY, [-1, 1], [3, -3]);

  const rotXRaw = useTransform(
    () => scrollRotX.get() + (staticMode ? 0 : mouseRotX.get())
  );
  const rotYRaw = useTransform(
    () => scrollRotY.get() + (staticMode ? 0 : mouseRotY.get())
  );

  const rotX = useSpring(rotXRaw, { stiffness: 90, damping: 18 });
  const rotY = useSpring(rotYRaw, { stiffness: 90, damping: 18 });

  useEffect(() => {
    if (staticMode) return;
    if (typeof window === "undefined") return;
    if (!window.matchMedia("(pointer: fine)").matches) return;

    const parent = wrapperRef.current?.parentElement;
    if (!parent) return;

    const onMove = (e: MouseEvent) => {
      const rect = parent.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ny = ((e.clientY - rect.top) / rect.height) * 2 - 1;
      mouseX.set(Math.max(-1, Math.min(1, nx)));
      mouseY.set(Math.max(-1, Math.min(1, ny)));
    };
    const onLeave = () => {
      mouseX.set(0);
      mouseY.set(0);
    };
    parent.addEventListener("mousemove", onMove);
    parent.addEventListener("mouseleave", onLeave);
    return () => {
      parent.removeEventListener("mousemove", onMove);
      parent.removeEventListener("mouseleave", onLeave);
    };
  }, [staticMode, mouseX, mouseY]);

  return (
    <div
      ref={wrapperRef}
      data-enclave-shield-3d=""
      aria-hidden="true"
      className={`pointer-events-none grid place-items-center ${className}`}
      style={{ perspective: "1600px" }}
    >
      <motion.div
        className="relative"
        style={{
          width: "clamp(240px, 32vw, 420px)",
          aspectRatio: "1 / 1.1",
          transformStyle: "preserve-3d",
          willChange: "transform",
          rotateX: staticMode ? 0 : rotX,
          rotateY: staticMode ? 0 : rotY,
          scale: staticMode ? 1 : scale,
          opacity: staticMode ? 1 : opacity,
        }}
      >
        {LAYERS.map((layer, i) => (
          <motion.svg
            key={i}
            viewBox="0 0 24 24"
            fill="none"
            preserveAspectRatio="xMidYMid meet"
            className="absolute inset-0 w-full h-full"
            style={{
              transform: `translateZ(${layer.z}px)`,
              opacity: layer.opacity,
              filter: layer.blur > 0 ? `blur(${layer.blur}px)` : undefined,
            }}
            animate={
              layer.isCenter && !staticMode
                ? {
                    filter: [
                      "drop-shadow(0 0 12px rgba(212,160,23,0.25))",
                      "drop-shadow(0 0 28px rgba(212,160,23,0.45))",
                      "drop-shadow(0 0 12px rgba(212,160,23,0.25))",
                    ],
                  }
                : undefined
            }
            transition={
              layer.isCenter && !staticMode
                ? { duration: 2.4, repeat: Infinity, ease: "easeInOut" }
                : undefined
            }
          >
            {layer.isCenter && (
              <defs>
                <linearGradient id="enclave-shield-3d-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-cream)" stopOpacity="0.1" />
                  <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
                </linearGradient>
              </defs>
            )}
            <path
              d={SHIELD_PATH}
              stroke={layer.color}
              strokeWidth={layer.strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill={layer.isCenter ? "url(#enclave-shield-3d-fill)" : "none"}
              vectorEffect="non-scaling-stroke"
            />
          </motion.svg>
        ))}
      </motion.div>
    </div>
  );
}

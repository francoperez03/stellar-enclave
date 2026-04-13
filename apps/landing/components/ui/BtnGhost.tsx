"use client";

import type { ReactNode, MouseEvent } from "react";

type BtnGhostProps = {
  children: ReactNode;
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
  href?: string;
  ariaLabel?: string;
};

const CLASS_STRING =
  "btn-ghost focus-ring inline-flex items-center gap-2 border border-ink-300 text-ink-900 text-sm font-semibold rounded-md px-5 py-2.5";

export function BtnGhost({ children, onClick, href, ariaLabel }: BtnGhostProps) {
  if (href) {
    return (
      <a href={href} className={CLASS_STRING} aria-label={ariaLabel}>
        {children}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} className={CLASS_STRING} aria-label={ariaLabel}>
      {children}
    </button>
  );
}

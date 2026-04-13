import Link from "next/link";
import type { ReactNode } from "react";

type BtnPrimaryProps = {
  href: string;
  children: ReactNode;
  external?: boolean;
  ariaLabel?: string;
};

const CLASS_STRING =
  "btn-primary focus-ring inline-flex items-center gap-2 text-white font-semibold text-sm rounded-md px-5 py-2.5";

export function BtnPrimary({ href, children, external, ariaLabel }: BtnPrimaryProps) {
  if (external || href.startsWith("http")) {
    return (
      <a
        href={href}
        className={CLASS_STRING}
        aria-label={ariaLabel}
        target="_blank"
        rel="noopener noreferrer"
      >
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={CLASS_STRING} aria-label={ariaLabel}>
      {children}
    </Link>
  );
}

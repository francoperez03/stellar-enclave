import type { ReactNode } from "react";

type PillProps = {
  children: ReactNode;
  dotColor?: string;
  animated?: boolean;
};

export function Pill({ children, dotColor = "bg-emerald-500", animated = false }: PillProps) {
  return (
    <span className="pill">
      <span
        className={`pill-dot ${dotColor} ${animated ? "animate-pulse-dot" : ""}`}
        aria-hidden="true"
      />
      {children}
    </span>
  );
}

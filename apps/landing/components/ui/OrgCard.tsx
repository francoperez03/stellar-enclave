import type { ReactNode } from "react";

type OrgCardProps = {
  name: string;
  archetype: string;
  icon?: ReactNode;
};

export function OrgCard({ name, archetype, icon }: OrgCardProps) {
  return (
    <div
      className="action-card card-surface card-lift border border-ink-200 rounded-xl p-6 w-56 flex flex-col gap-3 items-start"
      role="group"
      aria-label={name}
    >
      <div
        className="w-9 h-9 flex items-center justify-center rounded-lg bg-ink-50 border border-ink-200 text-ink-700"
        aria-hidden="true"
      >
        {icon ?? (
          <svg
            className="w-4 h-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 21V7l9-4 9 4v14M3 21h18M9 21v-6h6v6"
            />
          </svg>
        )}
      </div>
      <h3 className="font-headline text-xl text-ink-900 leading-tight">{name}</h3>
      <p className="text-xs text-ink-500 leading-snug">{archetype}</p>
    </div>
  );
}

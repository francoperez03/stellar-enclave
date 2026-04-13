export function PoolIcon() {
  return (
    <div
      className="w-20 h-20 flex items-center justify-center rounded-2xl shadow-lg shadow-gold-500/30 animate-glow-pulse"
      style={{
        backgroundImage:
          "linear-gradient(135deg, var(--color-gold-500) 0%, var(--color-gold-600) 100%)",
      }}
      aria-label="Enclave shielded pool"
      role="img"
    >
      <svg
        className="w-10 h-10 text-white drop-shadow-sm"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"
        />
      </svg>
    </div>
  );
}

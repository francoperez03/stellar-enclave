export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-4 px-6">
      <p className="pill">
        <span className="pill-dot bg-emerald-500 animate-pulse-dot" aria-hidden="true" />
        Scaffold ready
      </p>
      <h1 className="font-headline text-5xl text-ink-900 text-center leading-[1.05]">
        Enclave
      </h1>
      <p className="text-ink-500 text-center max-w-md">
        Sections incoming in Wave 3.
      </p>
    </main>
  );
}

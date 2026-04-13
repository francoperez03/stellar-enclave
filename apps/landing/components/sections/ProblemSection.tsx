export function ProblemSection() {
  return (
    <section
      className="relative py-24 md:py-32 px-6"
      aria-labelledby="problem-heading"
    >
      <div className="max-w-3xl mx-auto flex flex-col gap-10">
        <div className="divider-gradient mb-4" aria-hidden="true" />

        <p className="text-xs tracking-[0.14em] uppercase text-ink-500 font-semibold">
          The problem
        </p>

        <h2
          id="problem-heading"
          className="font-headline text-ink-900 text-4xl md:text-5xl leading-[1.1]"
        >
          Every payment your agent makes is public.
        </h2>

        <p className="text-ink-700 text-lg md:text-xl leading-relaxed">
          Public ledgers expose which APIs your agents call, how much they
          spend, and who they pay — in real time. Your strategy is visible to
          every competitor on earth.
        </p>

        <p className="text-ink-500 text-base leading-relaxed max-w-2xl">
          The agentic commerce thesis doesn&apos;t work without privacy. If
          every call signal is on-chain and correlatable, your agents are
          broadcasting your playbook with every HTTP request.
        </p>
      </div>
    </section>
  );
}

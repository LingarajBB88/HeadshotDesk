// Marketing landing page placeholder.
// We'll flesh this out properly once brand direction and pricing are locked.

export default function HomePage() {
  return (
    <main className="min-h-dvh">
      <section className="mx-auto max-w-[var(--max-content)] px-6 pt-24 pb-16">
        <p className="text-sm font-medium text-accent uppercase tracking-wider">
          HeadshotDesk · v0.1 in progress
        </p>
        <h1 className="mt-3 font-display text-5xl md:text-6xl font-semibold tracking-tight">
          Run team headshot shoots <br className="hidden md:inline" />
          without the spreadsheet chaos.
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-muted-600">
          Auto-rename every shot. Auto-deliver branded galleries. AI retouching built in.
          Pause your subscription during slow seasons — your data stays put.
        </p>
        <div className="mt-10 flex gap-3">
          <a className="btn-primary" href="/signup">Start free trial</a>
          <a className="btn-secondary" href="/pricing">See pricing</a>
        </div>
      </section>
    </main>
  );
}

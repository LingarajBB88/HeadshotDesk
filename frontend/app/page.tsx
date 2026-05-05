// Marketing landing page placeholder.
// We'll flesh this out properly once brand direction and pricing are locked.

import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-dvh">
      <header className="mx-auto max-w-[var(--max-content)] px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <span className="inline-flex items-center justify-center h-7 w-7 rounded-md bg-ink text-paper text-xs font-display font-semibold">
            HD
          </span>
          <span className="font-medium text-sm tracking-tight">
            <span className="text-accent">Headshot</span>
            <span className="text-ink">Desk</span>
          </span>
        </Link>
        <Link href="/login" className="text-sm text-muted-600 hover:text-ink transition">
          Sign in
        </Link>
      </header>

      <section className="mx-auto max-w-[var(--max-content)] px-6 pt-16 pb-16">
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
          <Link className="btn-primary" href="/signup">Start free trial</Link>
          <Link className="btn-secondary" href="/login">Sign in</Link>
        </div>
      </section>
    </main>
  );
}

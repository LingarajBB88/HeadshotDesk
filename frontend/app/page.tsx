// Marketing landing page placeholder.
// We'll flesh this out properly once brand direction and pricing are locked.

import Link from "next/link";

import { Logo } from "@/components/Logo";

export default function HomePage() {
  return (
    <main className="min-h-dvh">
      <header className="mx-auto max-w-[var(--max-content)] px-4 sm:px-6 h-16 flex items-center justify-between">
        <Link href="/">
          <Logo size="sm" wordmark />
        </Link>
        <Link href="/login" className="text-sm text-muted-600 hover:text-ink transition">
          Sign in
        </Link>
      </header>

      <section className="mx-auto max-w-[var(--max-content)] px-4 sm:px-6 pt-12 sm:pt-16 pb-16">
        <p className="text-xs sm:text-sm font-medium text-accent uppercase tracking-wider">
          HeadshotDesk · v0.1 in progress
        </p>
        <h1 className="mt-3 font-display text-4xl sm:text-5xl md:text-6xl font-semibold tracking-tight">
          Run team headshot shoots <br className="hidden md:inline" />
          without the spreadsheet chaos.
        </h1>
        <p className="mt-6 max-w-2xl text-base sm:text-lg text-muted-600">
          Auto-rename every shot. Auto-deliver branded galleries. AI retouching built in.
          Pause your subscription during slow seasons — your data stays put.
        </p>
        <div className="mt-8 sm:mt-10 flex flex-wrap gap-3">
          <Link className="btn-primary" href="/signup">Start free trial</Link>
          <Link className="btn-secondary" href="/login">Sign in</Link>
        </div>
      </section>
    </main>
  );
}

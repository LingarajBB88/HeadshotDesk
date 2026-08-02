"use client";

// HSD-65 (pitch kit, component 1) — the page a photographer sends to their
// CLIENT: an HR manager, office manager, or event coordinator who is
// deciding whether to book a team headshot day.
//
// Written entirely from that person's point of view. They do not care about
// tethering, filename matching, or galleries as features; they care about
// how much of this lands on their desk, whether their colleagues will
// actually turn up, whether employee data is handled properly, and whether
// they will be chasing the photographer for photos in three weeks.
//
// Personalized with ?studio=Panther+Studios so it reads as the
// photographer's own material rather than a generic vendor page.

import type { Route } from "next";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { BrandName } from "@/components/BrandName";
import { Logo } from "@/components/Logo";

const WITHOUT_TOOL = [
  "Collecting names in a spreadsheet, then chasing the six people who never replied.",
  "Building a schedule by hand, then rebuilding it when three people swap slots.",
  "Fielding “when is my turn?” messages all morning.",
  "Waiting weeks, then forwarding a giant zip file and hoping everyone finds their own photos.",
  "Re-sending files to whoever lost the link, months later.",
];

const WITH_TOOL = [
  "You send one link. Your colleagues add themselves and pick their own time.",
  "The schedule builds itself and stays current, including swaps and late additions.",
  "Everyone knows exactly when they are on, because they chose it.",
  "Each person gets a private link to their own photos. No zip files, no mix-ups.",
  "Links keep working, so re-downloads never come back to you.",
];

function ForClientsContent() {
  const params = useSearchParams();
  const studio = params.get("studio")?.trim() || null;
  const photographer = studio || "Your photographer";

  return (
    <main className="min-h-dvh">
      {/* Header */}
      <header className="mx-auto max-w-[var(--max-content)] px-4 sm:px-6 h-16 flex items-center justify-between">
        <Link href="/" aria-label="HeadshotDesk home" className="inline-flex">
          <Logo size="sm" wordmark />
        </Link>
        <Link href="/" className="text-sm text-muted-600 hover:text-ink transition">
          What is this?
        </Link>
      </header>

      {/* Hero — speaks to the coordinator's actual worry: workload. */}
      <section className="mx-auto max-w-[var(--max-content)] px-4 sm:px-6 pt-10 sm:pt-16 pb-12">
        <p className="text-xs sm:text-sm font-medium text-accent uppercase tracking-wider">
          {studio ? `${studio} runs headshot days on HeadshotDesk` : "For HR and office teams"}
        </p>
        <h1 className="mt-3 font-display text-4xl sm:text-5xl font-semibold tracking-tight max-w-3xl">
          Team headshots that don&apos;t become your side project.
        </h1>
        <p className="mt-6 max-w-2xl text-base sm:text-lg text-muted-600">
          Booking a headshot day usually means a spreadsheet, a scheduling
          thread, and weeks of forwarding photos to colleagues.{" "}
          <strong className="font-semibold text-ink">{photographer}</strong>{" "}
          uses <BrandName /> so none of that lands on your desk. Your people
          organise themselves, and everyone ends up with their own photos.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link className="btn-primary" href={"/sample" as Route}>
            Try it as an employee
          </Link>
          <a className="btn-secondary" href="#what-they-experience">
            What your colleagues do
          </a>
        </div>
        <p className="mt-3 text-xs text-muted-600">
          Two minutes, nothing to install, nothing saved.
        </p>
      </section>

      {/* The swap — their week, before and after. */}
      <section className="border-t border-muted-200 bg-muted-50">
        <div className="mx-auto max-w-[var(--max-content)] px-4 sm:px-6 py-14 sm:py-20">
          <h2 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight max-w-2xl">
            What you would normally be doing, and what you do instead
          </h2>
          <div className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="rounded-card border border-muted-200 bg-paper p-6">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-600">
                The usual way
              </h3>
              {/* Spacer keeps both columns' lists starting on the same line
                  now that the right column has a name under its label. */}
              <p className="mt-1 font-display text-xl font-semibold tracking-tight text-muted-400">
                Without a tool
              </p>
              <ul className="mt-4 space-y-3 text-sm text-muted-600 leading-relaxed">
                {WITHOUT_TOOL.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-card border border-accent/30 bg-accent-muted p-6">
              {/* The photographer's name is the point of this column, so it
                  gets weight and size rather than sitting inside a small
                  uppercase label like a generic section header. */}
              <h3 className="text-xs font-semibold uppercase tracking-wider text-accent">
                With
              </h3>
              <p className="mt-1 font-display text-xl font-semibold tracking-tight text-ink">
                {photographer}
              </p>
              <ul className="mt-4 space-y-3 text-sm text-ink leading-relaxed">
                {WITH_TOOL.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* What the employee experiences — the thing they will be asked about. */}
      <section id="what-they-experience" className="border-t border-muted-200">
        <div className="mx-auto max-w-[var(--max-content)] px-4 sm:px-6 py-14 sm:py-20">
          <h2 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight">
            What your colleagues experience
          </h2>
          <p className="mt-2 text-sm sm:text-base text-muted-600 max-w-2xl">
            Three steps, no account to create, nothing to install.
          </p>
          <ol className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                title: "They click your link",
                body: "One page: name, email, and the time that suits them. Takes under a minute, works on a phone.",
              },

              {
                title: "They show up at their time",
                body: "No queueing in a corridor, no guessing. They picked the slot, so they know when they are on.",
              },
              {
                title: "They get their photos",
                body: "A private link with their own photos only. They pick their favourite and download it whenever they need it.",
              },
            ].map((step, i) => (
              <li
                key={step.title}
                className="rounded-card border border-muted-200 bg-paper p-6"
              >
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-accent text-accent-fg text-sm font-semibold">
                  {i + 1}
                </span>
                <h3 className="mt-3 font-display text-lg font-semibold tracking-tight">
                  {step.title}
                </h3>
                <p className="mt-2 text-sm text-muted-600 leading-relaxed">
                  {step.body}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Benefits aimed squarely at the coordinator. */}
      <section className="border-t border-muted-200 bg-muted-50">
        <div className="mx-auto max-w-[var(--max-content)] px-4 sm:px-6 py-14 sm:py-20">
          <h2 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight">
            What it means for you
          </h2>
          <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-8">
            {[
              {
                title: "No spreadsheet to maintain",
                body: "People add themselves. Late joiners and swaps handle themselves too, right up to shoot day.",
              },
              {
                title: "A live status page",
                body: `${photographer} can share a link that shows who has signed up, who has been photographed, and who has their photos. Check it any time instead of asking.`,
              },
              {
                title: "Nobody gets missed",
                body: "Anyone who has not booked is visible before the day, so you can nudge them while it still matters.",
              },
              {
                title: "Your branding, not a tool's",
                body: "Your logo sits on the signup page and on every set of photos your colleagues receive.",
              },
              {
                title: "Photos that stay findable",
                body: "Each person keeps their own private link. When someone needs their headshot again next year, they are not emailing you for it.",
              },
              {
                title: "Handled employee data",
                body: "Consent is collected at signup, galleries are private and link-only, and nobody can see anyone else's photos.",
              },
            ].map((b) => (
              <div key={b.title}>
                <h3 className="text-sm font-semibold text-ink">{b.title}</h3>
                <p className="mt-1 text-sm text-muted-600 leading-relaxed">
                  {b.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* The questions a coordinator actually has to answer internally. */}
      <section className="border-t border-muted-200">
        <div className="mx-auto max-w-[var(--max-content)] px-4 sm:px-6 py-14 sm:py-20">
          <h2 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight">
            Questions you may be asked
          </h2>
          <dl className="mt-8 max-w-3xl space-y-6">
            {[
              {
                q: "Does everyone need to create an account?",
                a: "No. Your colleagues never sign up for anything. They click a link, and later they get a private link to their photos.",
              },
              {
                q: "Can people see each other's photos?",
                a: "No. Each person's link shows only their own photos.",
              },
              {
                q: "What about privacy and consent?",
                a: "Everyone agrees to how their photos will be used at the moment they sign up, so consent is recorded per person rather than assumed. Photos are never public and are not used for anything else.",
              },
              {
                q: "What if somebody cannot make their slot?",
                a: "They pick a different one themselves, or your photographer moves them. The schedule updates for everyone immediately.",
              },
              {
                q: "How do people get their photos?",
                a: `${photographer} sends them in one go once editing is done. Each person gets an email with their own private link. Nothing goes through your inbox.`,
              },
              {
                q: "What do we need to prepare?",
                a: "A room, a power socket, and the link forwarded to your team. That is genuinely it.",
              },
            ].map((item) => (
              <div key={item.q}>
                <dt className="text-sm font-semibold text-ink">{item.q}</dt>
                <dd className="mt-1 text-sm text-muted-600 leading-relaxed">
                  {item.a}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* Close — hands the conversation back to the photographer. */}
      <section className="border-t border-muted-200 bg-accent-muted">
        <div className="mx-auto max-w-[var(--max-content)] px-4 sm:px-6 py-14 sm:py-20 text-center">
          <h2 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight">
            Ready when you are
          </h2>
          <p className="mt-3 text-sm sm:text-base text-muted-600 max-w-xl mx-auto">
            Reply to {studio ? studio : "your photographer"} with a date and a
            rough headcount. You will get a signup link to forward, and that
            is the last piece of admin you have to do.
          </p>
        </div>
      </section>

      <footer className="border-t border-muted-200">
        <div className="mx-auto max-w-[var(--max-content)] px-4 sm:px-6 py-8 flex flex-wrap items-center justify-between gap-4 text-xs text-muted-600">
          <span className="inline-flex items-center gap-2">
            Shoot day runs on
            <Link href="/" className="inline-flex items-center">
              <Logo size="sm" wordmark />
            </Link>
          </span>
          <span className="flex gap-4">
            <Link href="/privacy" className="hover:text-ink transition">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-ink transition">
              Terms
            </Link>
          </span>
        </div>
      </footer>
    </main>
  );
}

export default function ForClientsPage() {
  // useSearchParams needs a Suspense boundary for static rendering.
  return (
    <Suspense fallback={<main className="min-h-dvh" />}>
      <ForClientsContent />
    </Suspense>
  );
}

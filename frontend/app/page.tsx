// Marketing landing page (HSD-32).
//
// Positioning: clarity. The competing tools make photographers "study the
// software" (their own testimonials mention watching videos for half a day).
// This page explains the entire workflow in five concrete steps so a
// photographer knows exactly what the product does before signing up.
//
// Ground rules for this page:
//   • Every feature listed under "how it works" / "what's included" is
//     SHIPPED. Pipeline features live only under "On the roadmap", clearly
//     labeled. Don't move items up until they're live.
//   • Free during beta — no pricing claims until billing exists.

import Link from "next/link";

import { Logo } from "@/components/Logo";

export const metadata = {
  title: "HeadshotDesk | Team headshot shoots, from signup to delivery",
  description:
    "Run team and event headshot shoots without the admin: participant signup links, a shoot-day queue, automatic photo sorting, and private galleries delivered to every inbox. EU-hosted. Free during beta.",
};

const STEPS: { title: string; body: string }[] = [
  {
    title: "Create a job",
    body: "Name, shoot date, location, and how many headshots each person may keep. Takes about two minutes, and everything can be changed later.",
  },
  {
    title: "Share one link",
    body: "Every job gets its own signup page. Send the link to your contact person or the whole team, and participants add themselves. Have a list already? Import the CSV.",
  },
  {
    title: "Shoot with the queue",
    body: "On shoot day, tap the next name and it's on your clipboard for your tethering tool. Files named like “Jane Doe_001.jpg” match themselves to Jane. No renaming session afterwards.",
  },
  {
    title: "Photos sort themselves",
    body: "Point HeadshotDesk at your export folder once. Every new frame uploads in the background, skips duplicates, and files itself under the right person while you keep shooting.",
  },
  {
    title: "Click Deliver",
    body: "Everyone gets an email with a private gallery. Each person sees only their own photos, picks within the limit you set, and downloads. You see who's been delivered and who's downloaded, at a glance.",
  },
];

const SHIPPED: { title: string; body: string }[] = [
  {
    title: "Public signup pages",
    body: "A shareable signup link per job, with consent handling built in.",
  },
  {
    title: "CSV import",
    body: "Bring an HR list straight in. Delimiter quirks are handled.",
  },
  {
    title: "Shoot-day queue",
    body: "Click-to-copy names for tethered shooting, mark-shot tracking.",
  },
  {
    title: "Watch folder",
    body: "Map your export folder; new frames upload and sort automatically.",
  },
  {
    title: "Filename auto-match",
    body: "Shots match to participants by name, including partial matches.",
  },
  {
    title: "Private galleries",
    body: "Each participant sees only their own photos. Link-only access.",
  },
  {
    title: "Download limits",
    body: "Set how many headshots each person keeps. Re-downloads are free.",
  },
  {
    title: "One-click delivery",
    body: "Email every finished participant their gallery at once. Resend anytime.",
  },
  {
    title: "Live gallery updates",
    body: "Upload more photos later; open galleries refresh on their own.",
  },
  {
    title: "EU-hosted, GDPR-aware",
    body: "Data in Frankfurt, photos on EU storage, participant consent recorded.",
  },
];

const ROADMAP: string[] = [
  "Time-slot self-booking for corporate shoot days",
  "Your client's logo on signup pages, galleries, and emails",
  "Participant retouch picks and proofing",
  "Paid extra downloads for participants",
  "AI retouching and background swap",
];

export default function HomePage() {
  return (
    <main className="min-h-dvh">
      {/* Header */}
      <header className="mx-auto max-w-[var(--max-content)] px-4 sm:px-6 h-16 flex items-center justify-between">
        <Link href="/">
          <Logo size="sm" wordmark />
        </Link>
        <nav className="flex items-center gap-4 sm:gap-6 text-sm">
          <a href="#how-it-works" className="hidden sm:inline text-muted-600 hover:text-ink transition">
            How it works
          </a>
          <a href="#features" className="hidden sm:inline text-muted-600 hover:text-ink transition">
            What&apos;s included
          </a>
          <Link href="/login" className="text-muted-600 hover:text-ink transition">
            Sign in
          </Link>
          <Link href="/signup" className="btn-primary text-sm">
            Try it free
          </Link>
        </nav>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-[var(--max-content)] px-4 sm:px-6 pt-12 sm:pt-20 pb-12 sm:pb-16">
        <p className="text-xs sm:text-sm font-medium text-accent uppercase tracking-wider">
          For headshot photographers
        </p>
        <h1 className="mt-3 font-display text-4xl sm:text-5xl md:text-6xl font-semibold tracking-tight max-w-3xl">
          Team headshots, from signup to delivery, in one clear flow.
        </h1>
        <p className="mt-6 max-w-2xl text-base sm:text-lg text-muted-600">
          HeadshotDesk is a web app for photographers who shoot headshots for
          teams, offices, and events. It takes over the admin around the
          camera: who&apos;s coming, who&apos;s been shot, which photo belongs
          to whom, and getting every person their own photos. A
          thirty-person shoot ends up feeling like a one-person shoot.
        </p>
        <div className="mt-8 sm:mt-10 flex flex-wrap items-center gap-3">
          <Link className="btn-primary" href="/signup">
            Try it free
          </Link>
          <a className="btn-secondary" href="#how-it-works">
            See how it works
          </a>
        </div>
        <p className="mt-4 text-xs text-muted-600">
          Free during beta · No credit card · EU-hosted
        </p>
      </section>

      {/* The problem — for photographers who've never seen a tool like this.
          Establishes what a team shoot costs you without software before we
          explain the product. Before/after framing, concrete pains only. */}
      <section className="border-t border-muted-200">
        <div className="mx-auto max-w-[var(--max-content)] px-4 sm:px-6 py-14 sm:py-20">
          <h2 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight max-w-2xl">
            A 30-person shoot is one hour of photography and a week of admin
          </h2>
          <p className="mt-3 text-sm sm:text-base text-muted-600 max-w-2xl">
            If you&apos;ve shot team headshots, you know the photography is the
            easy part. It&apos;s everything around it that eats the week:
          </p>

          <div className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="rounded-card border border-muted-200 bg-paper p-6">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-600">
                Without a tool
              </h3>
              <ul className="mt-4 space-y-3 text-sm text-muted-600 leading-relaxed">
                <li>
                  Collecting names and emails across reply-all threads and a
                  spreadsheet someone keeps &ldquo;improving&rdquo;.
                </li>
                <li>
                  Shoot day off a printed list, guessing who&apos;s in front
                  of the camera and scribbling frame numbers next to names.
                </li>
                <li>
                  An evening (or three) renaming hundreds of files and sorting
                  them into folders per person.
                </li>
                <li>
                  Zipping folders, uploading to WeTransfer, emailing thirty
                  links one by one.
                </li>
                <li>
                  Then the follow-ups: &ldquo;which photo was me?&rdquo;,
                  &ldquo;the link expired&rdquo;, &ldquo;can you resend
                  mine?&rdquo;
                </li>
              </ul>
            </div>

            <div className="rounded-card border border-accent/30 bg-accent-muted p-6">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-accent">
                With HeadshotDesk
              </h3>
              <ul className="mt-4 space-y-3 text-sm text-ink leading-relaxed">
                <li>People add themselves through one signup link.</li>
                <li>
                  Shoot day runs off a live queue: tap a name, shoot, mark
                  done.
                </li>
                <li>
                  Photos upload and file themselves under the right person
                  while you&apos;re still shooting.
                </li>
                <li>
                  One click emails every person a private gallery of just
                  their photos.
                </li>
                <li>
                  Links don&apos;t expire, re-downloads are free, and you can
                  see who&apos;s picked up their photos.
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* How it works — the clarity play. Five concrete steps, no vagueness. */}
      <section id="how-it-works" className="border-t border-muted-200 bg-muted-50">
        <div className="mx-auto max-w-[var(--max-content)] px-4 sm:px-6 py-14 sm:py-20">
          <h2 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight">
            How a shoot runs on HeadshotDesk
          </h2>
          <p className="mt-2 text-sm sm:text-base text-muted-600 max-w-2xl">
            The whole workflow, start to finish. If this looks like your shoot
            day, you already know how to use the product.
          </p>

          <ol className="mt-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {STEPS.map((step, i) => (
              <li
                key={step.title}
                className="rounded-card border border-muted-200 bg-paper p-6"
              >
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-accent-fg text-sm font-semibold">
                    {i + 1}
                  </span>
                  <h3 className="font-display text-lg font-semibold tracking-tight">
                    {step.title}
                  </h3>
                </div>
                <p className="mt-3 text-sm text-muted-600 leading-relaxed">
                  {step.body}
                </p>
              </li>
            ))}
            {/* Closing card — reinforces the outcome */}
            <li className="rounded-card border border-accent/30 bg-accent-muted p-6">
              <h3 className="font-display text-lg font-semibold tracking-tight text-ink">
                That&apos;s the whole job
              </h3>
              <p className="mt-3 text-sm text-muted-600 leading-relaxed">
                No export sessions, no renaming evenings, no zip files over
                WeTransfer, no &ldquo;which photo was Jane again?&rdquo; The
                admin happens while you shoot.
              </p>
            </li>
          </ol>
        </div>
      </section>

      {/* What's included — everything here is live today. */}
      <section id="features" className="border-t border-muted-200">
        <div className="mx-auto max-w-[var(--max-content)] px-4 sm:px-6 py-14 sm:py-20">
          <h2 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight">
            What&apos;s included today
          </h2>
          <p className="mt-2 text-sm sm:text-base text-muted-600 max-w-2xl">
            Everything below is live today, not a teaser for a future release.
          </p>

          <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-8">
            {SHIPPED.map((f) => (
              <div key={f.title}>
                <h3 className="text-sm font-semibold text-ink">{f.title}</h3>
                <p className="mt-1 text-sm text-muted-600 leading-relaxed">
                  {f.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Roadmap — honest about what's coming vs. what exists. */}
      <section className="border-t border-muted-200 bg-muted-50">
        <div className="mx-auto max-w-[var(--max-content)] px-4 sm:px-6 py-14 sm:py-20">
          <h2 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight">
            On the roadmap
          </h2>
          <p className="mt-2 text-sm sm:text-base text-muted-600 max-w-2xl">
            Built in the open with our beta photographers. Coming next, in
            roughly this order:
          </p>
          <ul className="mt-8 max-w-2xl space-y-3">
            {ROADMAP.map((item) => (
              <li key={item} className="flex items-start gap-3 text-sm text-muted-600">
                <span
                  className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
                  aria-hidden
                />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Beta CTA */}
      <section className="border-t border-muted-200">
        <div className="mx-auto max-w-[var(--max-content)] px-4 sm:px-6 py-14 sm:py-20">
          <h2 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight max-w-2xl">
            Free while in beta. Help shape it
          </h2>
          <p className="mt-3 text-sm sm:text-base text-muted-600 max-w-2xl">
            HeadshotDesk is in active beta. Everything on this page works today
            and costs nothing while we polish. Beta photographers get a direct
            line to the roadmap. The feature list above is largely their
            requests. Pricing comes later; your jobs and photos stay yours
            either way.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link className="btn-primary" href="/signup">
              Create your account
            </Link>
            <a
              className="btn-secondary"
              href="mailto:info@pantherstudios.nl?subject=HeadshotDesk beta"
            >
              Questions? Email us
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-muted-200">
        <div className="mx-auto max-w-[var(--max-content)] px-4 sm:px-6 py-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <Logo size="sm" wordmark />
          <nav className="flex items-center gap-5 text-xs text-muted-600">
            <Link href="/privacy" className="hover:text-ink transition">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-ink transition">
              Terms
            </Link>
            <a
              href="mailto:info@pantherstudios.nl"
              className="hover:text-ink transition"
            >
              Contact
            </a>
          </nav>
          <p className="text-xs text-muted-400">
            © {new Date().getFullYear()} Panther Studios, Amsterdam
          </p>
        </div>
      </footer>
    </main>
  );
}

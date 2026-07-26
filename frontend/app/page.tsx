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

import { BrandName, renderBrand } from "@/components/BrandName";
import { FeatureRequestForm } from "@/components/FeatureRequestForm";
import { Logo } from "@/components/Logo";

export const metadata = {
  title: "HeadshotDesk | Team headshot shoots, from signup to delivery",
  description:
    "Run team and event headshot shoots without the admin: participant signup links, a shoot-day queue, automatic photo sorting, and private galleries delivered to every inbox. Free during beta.",
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
    title: "Time-slot booking",
    body: "Participants book appointments at signup; shoot day runs on a schedule.",
  },
  {
    title: "Flexible schedule editing",
    body: "Preview changes live, remove or add individual slots, custom lengths. Existing bookings stay protected.",
  },
  {
    title: "Client status dashboard",
    body: "Share a live progress link with your contact: signups, bookings, deliveries. No more status-check emails.",
  },
  {
    title: "Client-branded delivery",
    body: "Upload a client's logo once. Their signup page, every gallery, and delivery emails carry their branding.",
  },
  {
    title: "Participant favourites",
    body: "Let people star the shots they want kept. Your retouch list builds itself, no email thread required.",
  },
  {
    title: "Works with Capture One and Lightroom",
    body: "No plugin, no new habits. Name files from the queue, point us at your export folder, and photos file themselves.",
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
    title: "Privacy your clients can sign off on",
    body: "Consent collected at signup, galleries private and link-only. When a client's HR team asks about data handling, the answer is yes.",
  },
];

// Roadmap timeline. Keep this honest and current: when a feature ships,
// move it to "shipped" (newest first); when work starts, move it to
// "building". The building item is what's actually in progress in the repo.
const ROADMAP_TIMELINE: {
  status: "shipped" | "building" | "next";
  title: string;
  detail: string;
}[] = [
  {
    status: "shipped",
    title: "Client logos everywhere it counts",
    detail: "Upload a logo once per client; signup pages, galleries, and delivery emails carry their branding.",
  },
  {
    status: "shipped",
    title: "Client status dashboard",
    detail: "A live link for your client contact: signups, bookings, and delivery progress without asking you.",
  },
  {
    status: "shipped",
    title: "Full schedule control",
    detail: "Edit the slot grid with a live preview: remove single slots, add custom-length ones, bookings protected.",
  },
  {
    status: "shipped",
    title: "Time-slot self-booking",
    detail: "Participants book their appointment while signing up; shoot day runs as a schedule.",
  },
  {
    status: "shipped",
    title: "Searchable help center",
    detail: "Every screen and setting explained, with instant search.",
  },
  {
    status: "shipped",
    title: "Email gallery delivery",
    detail: "One click emails every participant their private gallery.",
  },
  {
    status: "shipped",
    title: "Participant retouch picks",
    detail: "Participants star the shots they want; you see exactly what to retouch.",
  },
  {
    status: "building",
    title: "Subscriptions and billing",
    detail: "Solo, Pro, and Studio plans with a one-month trial, no card needed to start.",
  },
  {
    status: "next",
    title: "Paid extra downloads",
    detail: "Participants can buy photos beyond the included allowance.",
  },
  {
    status: "next",
    title: "AI retouching and background swap",
    detail: "Consistent, on-brand headshots without the editing evenings.",
  },
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
          <a href="#tethering" className="hidden sm:inline text-muted-600 hover:text-ink transition">
            Tethering
          </a>
          <a href="#features" className="hidden sm:inline text-muted-600 hover:text-ink transition">
            What&apos;s included
          </a>
          <Link href="/help" className="text-muted-600 hover:text-ink transition">
            Help
          </Link>
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
          <BrandName /> is a web app for photographers who shoot headshots for
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
          Free during beta · No credit card
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

          {/* The same week, drawn twice. Left: work scattered across tools
              and evenings. Right: one flow that finishes when the shoot
              does. Reads in a glance before anyone reads the lists. */}
          <div className="mt-10 rounded-card border border-muted-200 bg-paper p-6 sm:p-8">
            <svg
              viewBox="0 0 980 260"
              className="w-full h-auto"
              role="img"
              aria-label="Without a tool: shoot day is followed by days of renaming, sorting, zipping, emailing, and chasing follow-ups. With HeadshotDesk: signups, shoot day, and delivery happen in one flow that ends the day of the shoot."
            >
              {/* Without */}
              <text x={0} y={20} fontSize="13" fontWeight="600" className="fill-muted-600">
                WITHOUT A TOOL
              </text>
              {/* Track lines sit behind the cards; drawn first so the
                  rounded cards read as beads on a timeline. */}
              <line
                x1={0}
                y1={48}
                x2={980}
                y2={48}
                className="stroke-muted-200"
                strokeWidth={2}
              />
              {[
                { x: 0, w: 120, label: "Chase names", days: "days 1–5" },
                { x: 130, w: 90, label: "Shoot", days: "1 hour" },
                { x: 230, w: 150, label: "Rename files", days: "evening" },
                { x: 390, w: 150, label: "Sort folders", days: "evening" },
                { x: 550, w: 130, label: "Zip + upload", days: "evening" },
                { x: 690, w: 140, label: "Email 30 links", days: "day 8" },
                { x: 840, w: 140, label: "Chase replies", days: "days 9–14" },
              ].map((b) => (
                <g key={b.label}>
                  <rect
                    x={b.x}
                    y={34}
                    width={b.w}
                    height={28}
                    rx={6}
                    className="fill-muted-100 stroke-muted-200"
                    strokeWidth={1}
                  />
                  <text
                    x={b.x + b.w / 2}
                    y={52}
                    textAnchor="middle"
                    fontSize="12"
                    className="fill-ink"
                  >
                    {b.label}
                  </text>
                  <text
                    x={b.x + b.w / 2}
                    y={78}
                    textAnchor="middle"
                    fontSize="11"
                    className="fill-muted-400"
                  >
                    {b.days}
                  </text>
                </g>
              ))}

              {/* With */}
              {/* Two-tone wordmark, matching the Logo/BrandName treatment:
                  Headshot in accent, Desk in ink. */}
              <text x={0} y={150} fontSize="13" fontWeight="600">
                <tspan className="fill-muted-600">WITH </tspan>
                <tspan className="fill-accent">Headshot</tspan>
                <tspan className="fill-ink">Desk</tspan>
              </text>
              <line
                x1={0}
                y1={178}
                x2={980}
                y2={178}
                className="stroke-accent"
                strokeWidth={2}
              />
              {[
                { x: 0, w: 195, label: "Signup link does the admin", days: "runs itself" },
                { x: 205, w: 185, label: "Shoot from the queue", days: "1 hour" },
                { x: 400, w: 235, label: "Photos file themselves as you shoot", days: "live" },
                { x: 645, w: 185, label: "One click delivers all", days: "same day" },
              ].map((b) => (
                <g key={b.label}>
                  <rect
                    x={b.x}
                    y={164}
                    width={b.w}
                    height={28}
                    rx={6}
                    className="fill-accent-muted stroke-accent"
                    strokeWidth={1}
                  />
                  <text
                    x={b.x + b.w / 2}
                    y={182}
                    textAnchor="middle"
                    fontSize="12"
                    className="fill-ink"
                  >
                    {b.label}
                  </text>
                  <text
                    x={b.x + b.w / 2}
                    y={208}
                    textAnchor="middle"
                    fontSize="11"
                    className="fill-muted-600"
                  >
                    {b.days}
                  </text>
                </g>
              ))}
              {/* Finish marker — the point of the whole graphic: the work
                  ends when the shoot does. */}
              <rect
                x={845}
                y={164}
                width={135}
                height={28}
                rx={14}
                className="fill-accent"
              />
              <text
                x={912}
                y={182}
                textAnchor="middle"
                fontSize="12"
                fontWeight="600"
                className="fill-paper"
              >
                Done, same day
              </text>
            </svg>
          </div>

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
                With <BrandName />
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

      {/* Tethering — the question every photographer asks first: "does this
          work with what I already shoot on?" Answer with the actual flow,
          not marketing. Wordmarks are plain text on purpose: nominative
          "works with" use, no third-party logo files to license. Swap in
          official marks later per each vendor's brand guidelines. */}
      <section id="tethering" className="border-t border-muted-200">
        <div className="mx-auto max-w-[var(--max-content)] px-4 sm:px-6 py-14 sm:py-20">
          <h2 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight max-w-2xl">
            Works with the software you already shoot on
          </h2>
          <p className="mt-3 text-sm sm:text-base text-muted-600 max-w-2xl">
            You keep tethering the way you do today. <BrandName /> sits after
            your capture software, not in front of it: nothing to install, no
            plugin, no new export habit. Two settings and photos file
            themselves under the right person while you keep shooting.
          </p>

          {/* Compatibility row */}
          <div className="mt-8 flex flex-wrap items-center gap-3">
            {["Capture One", "Adobe Lightroom", "Smart Shooter", "Any tool that exports to a folder"].map(
              (tool) => (
                <span
                  key={tool}
                  className="inline-flex items-center rounded-card border border-muted-200 bg-paper px-4 py-2 text-sm font-medium text-ink"
                >
                  {tool}
                </span>
              ),
            )}
          </div>

          {/* The flow, drawn. Camera → capture software → export folder →
              HeadshotDesk → per-person galleries. */}
          <div className="mt-10 rounded-card border border-muted-200 bg-paper p-6 sm:p-8">
            <svg
              viewBox="0 0 980 200"
              className="w-full h-auto"
              role="img"
              aria-label="Flow: camera tethers into your capture software, which exports to a watch folder; HeadshotDesk uploads and files each photo under the right person, then emails private galleries."
            >
              <defs>
                <marker
                  id="hd-arrow"
                  viewBox="0 0 10 10"
                  refX="9"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
                </marker>
              </defs>

              {[
                { x: 10, label: "Camera", sub: "tethered" },
                { x: 205, label: "Capture One / Lightroom", sub: "names files from the queue" },
                { x: 400, label: "Export folder", sub: "on your laptop" },
                { x: 595, label: "HeadshotDesk", sub: "uploads + matches" },
                { x: 790, label: "Private galleries", sub: "one per person" },
              ].map((box, i) => (
                <g key={box.label}>
                  <rect
                    x={box.x}
                    y={55}
                    width={180}
                    height={80}
                    rx={10}
                    className={
                      i >= 3
                        ? "fill-accent-muted stroke-accent"
                        : "fill-paper stroke-muted-200"
                    }
                    strokeWidth={1.5}
                  />
                  <text
                    x={box.x + 90}
                    y={88}
                    textAnchor="middle"
                    className="fill-ink"
                    fontSize="14"
                    fontWeight="600"
                  >
                    {box.label}
                  </text>
                  <text
                    x={box.x + 90}
                    y={109}
                    textAnchor="middle"
                    className="fill-muted-600"
                    fontSize="12"
                  >
                    {box.sub}
                  </text>
                  {i < 4 ? (
                    <line
                      x1={box.x + 182}
                      y1={95}
                      x2={box.x + 203}
                      y2={95}
                      className="stroke-muted-400 text-muted-400"
                      strokeWidth={1.5}
                      markerEnd="url(#hd-arrow)"
                    />
                  ) : null}
                </g>
              ))}
              <text
                x={490}
                y={175}
                textAnchor="middle"
                className="fill-muted-600"
                fontSize="12"
              >
                You set this up once per shoot. Everything right of the folder happens on its own.
              </text>
            </svg>
          </div>

          {/* The two settings, concretely. */}
          <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="rounded-card border border-muted-200 bg-paper p-6">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-600">
                Setting 1 · in your capture software
              </p>
              <h3 className="mt-2 font-display text-lg font-semibold tracking-tight">
                Name files from the clipboard
              </h3>
              <p className="mt-2 text-sm text-muted-600 leading-relaxed">
                In Capture One, set the naming token to Clipboard Contents. In
                Lightroom, use a filename template with the custom text field.
                On shoot day you tap the next person in the queue, their name
                lands on your clipboard, and every frame comes out as
                <span className="whitespace-nowrap"> Jane Doe_0001.jpg</span>.
              </p>
            </div>
            <div className="rounded-card border border-muted-200 bg-paper p-6">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-600">
                Setting 2 · in <BrandName />
              </p>
              <h3 className="mt-2 font-display text-lg font-semibold tracking-tight">
                Point us at your export folder
              </h3>
              <p className="mt-2 text-sm text-muted-600 leading-relaxed">
                Map the folder your software exports to. New frames upload on
                their own and match to the right person by that filename. No
                plugin, no cloud sync service, no dragging files at midnight.
                Prefer to work offline? Drop the folder in afterwards instead.
              </p>
            </div>
          </div>

          <p className="mt-6 text-sm text-muted-600">
            <Link href="/help" className="text-accent hover:underline">
              Step-by-step setup for Capture One, Lightroom, and everything
              else
            </Link>{" "}
            lives in the help center.
          </p>
          <p className="mt-3 text-xs text-muted-400">
            Capture One, Adobe Lightroom, and Smart Shooter are trademarks of
            their respective owners. <BrandName /> is not affiliated with or
            endorsed by them.
          </p>
        </div>
      </section>

      {/* How it works — the clarity play. Five concrete steps, no vagueness. */}
      <section id="how-it-works" className="border-t border-muted-200 bg-muted-50">
        <div className="mx-auto max-w-[var(--max-content)] px-4 sm:px-6 py-14 sm:py-20">
          <h2 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight">
            How a shoot runs on <BrandName />
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
                  {renderBrand(step.body)}
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
                  {renderBrand(f.body)}
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
            Built in the open
          </h2>
          <p className="mt-2 text-sm sm:text-base text-muted-600 max-w-2xl">
            What just shipped, what we&apos;re building right now, and
            what&apos;s next. Steered by our beta photographers.
          </p>

          {/* Timeline: shipped on top, the in-progress item highlighted,
              upcoming below. Vertical connector line ties it together. */}
          <ol className="mt-10 max-w-2xl relative border-l border-muted-200 pl-6 space-y-6">
            {ROADMAP_TIMELINE.map((item) => (
              <li key={item.title} className="relative">
                <span
                  aria-hidden
                  className={
                    "absolute -left-[31px] top-1.5 h-2.5 w-2.5 rounded-full " +
                    (item.status === "shipped"
                      ? "bg-green-500"
                      : item.status === "building"
                        ? "bg-accent ring-4 ring-accent-muted"
                        : "bg-muted-200")
                  }
                />
                {item.status === "building" ? (
                  <div className="rounded-card border border-accent/30 bg-accent-muted p-4 -mt-1.5">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-accent">
                      Building now
                    </p>
                    <p className="mt-1 text-sm font-semibold text-ink">
                      {item.title}
                    </p>
                    <p className="mt-1 text-sm text-muted-600">{item.detail}</p>
                  </div>
                ) : (
                  <div>
                    <p
                      className={
                        "text-[11px] font-semibold uppercase tracking-wider " +
                        (item.status === "shipped"
                          ? "text-green-700"
                          : "text-muted-400")
                      }
                    >
                      {item.status === "shipped" ? "Shipped" : "Up next"}
                    </p>
                    <p className="mt-0.5 text-sm font-semibold text-ink">
                      {item.title}
                    </p>
                    <p className="mt-0.5 text-sm text-muted-600">
                      {item.detail}
                    </p>
                  </div>
                )}
              </li>
            ))}
          </ol>

          {/* Feature requests feed the roadmap directly. */}
          <div className="mt-12 border-t border-muted-200 pt-8">
            <h3 className="font-display text-lg font-semibold tracking-tight">
              Missing something?
            </h3>
            <p className="mt-1 text-sm text-muted-600 max-w-xl">
              The list above is largely built from photographer requests. Tell
              us what would make your shoots easier.
            </p>
            <div className="mt-4">
              <FeatureRequestForm />
            </div>
          </div>
        </div>
      </section>

      {/* Beta CTA */}
      <section className="border-t border-muted-200">
        <div className="mx-auto max-w-[var(--max-content)] px-4 sm:px-6 py-14 sm:py-20">
          <h2 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight max-w-2xl">
            Free while in beta. Help shape it
          </h2>
          <p className="mt-3 text-sm sm:text-base text-muted-600 max-w-2xl">
            <BrandName /> is in active beta. Everything on this page works today
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
            <Link href="/help" className="hover:text-ink transition">
              Help
            </Link>
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

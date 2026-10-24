// Marketing landing page (HSD-32), redesign.
//
// Direction: a mix of the three canvas directions.
//   • Hero from "Studio": portraits carry the page, a live queue card floats
//     over them. Photographs are the hero, not the chrome.
//   • "Product": the real job page in a browser frame straight under the
//     hero, and "How it works" as a bento of mini screens, each tagged with
//     the features that are unique to this tool.
//   • "Flow": features grouped by stage (Signup, Shoot, Sort, Deliver).
//
// Ground rules for this page:
//   • Every feature listed under "how it works" / "what's included" is
//     SHIPPED. Pipeline features live only under "Built in the open",
//     clearly labeled. Don't move items up until they're live.
//   • Free during beta. No pricing claims until billing exists.
//   • No em dashes, no exclamation marks, no superlatives.
//
// Portraits: <Portrait /> renders a neutral studio placeholder until a real
// image is passed. Swap in real headshots (4:5, grey or white backdrop) by
// passing `src`. Keep them real: no stock "tech" imagery.

import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { BrandName, renderBrand } from "@/components/BrandName";
import { FeatureRequestForm } from "@/components/FeatureRequestForm";
import { Logo } from "@/components/Logo";
import { TrackedLink } from "@/components/TrackedLink";

export const metadata = {
  title: "HeadshotDesk | Team headshot shoots, from signup to delivery",
  description:
    "Run team and event headshot shoots without the admin: participant signup links, a shoot-day queue, automatic photo sorting, and private galleries delivered to every inbox. Free during beta.",
};

/* ------------------------------------------------------------------ */
/* Content                                                             */
/* ------------------------------------------------------------------ */

type Step = {
  n: string;
  title: string;
  // Short lines, read as bullets. Three at most.
  points: string[];
  // Features that competitors generally don't have. Shown as pills on the
  // step card so the page sells what's distinctive, not just the flow.
  unique: string[];
};

const STEPS: Step[] = [
  {
    n: "01",
    title: "Create a job",
    points: [
      "Name, dates, location, and how many headshots each person may keep.",
      "Choose who receives the photos: each person, your client contact, or both.",
      "Add the client's logo once; it appears on the signup page, galleries, and emails.",
    ],
    unique: ["Multi-day shoots", "Per-person download limit", "Deliver to client, people, or both", "Client logo on everything"],
  },
  {
    n: "02",
    title: "Share one link",
    points: [
      "Every job gets its own signup page. People add themselves and pick a time.",
      "Have a list already? Import the CSV.",
      "Walk-ins scan a QR card at the booth and join the queue.",
    ],
    unique: ["Time-slot self-booking", "CSV import", "Consent at signup", "QR card for walk-ins", "Optional self-rescheduling"],
  },
  {
    n: "03",
    title: "Shoot with the queue",
    points: [
      "Tap the next name and it's on your clipboard for your tethering tool.",
      "Files come out as Mara Visser_001.jpg and match themselves to Mara.",
      "Write a private note per person: it's there when you retouch.",
    ],
    unique: ["Click-to-copy queue", "Private notes per person", "Mark shot, no show, reset", "Live queue position for walk-ins", "Attendance report"],
  },
  {
    n: "04",
    title: "Photos sort themselves",
    points: [
      "Point HeadshotDesk at your export folder once.",
      "New frames upload in the background and file themselves under the right person.",
      "Duplicates are skipped. Layered PSDs are accepted too.",
    ],
    unique: ["Watch folder", "Filename auto-match", "Duplicate skipping", "PSD files", "No plugin"],
  },
  {
    n: "05",
    title: "Click Deliver",
    points: [
      "Each person gets an email with a private gallery of only their photos.",
      "They star favourites and download within the limit you set. Links never expire.",
      "Or hand your client one link to everything, foldered per person.",
    ],
    unique: ["Participant favourites", "Client status dashboard", "Client handover zip", "Resend anytime", "Live gallery updates"],
  },
];

type Feature = { icon: IconName; title: string; body: string };
type Stage = { n: string; title: string; features: Feature[] };

const FEATURES_BY_STAGE: Stage[] = [
  {
    n: "01",
    title: "Signup",
    features: [
      { icon: "list", title: "Public signup pages", body: "A shareable signup link per job, with consent handling built in." },
      { icon: "file", title: "CSV import", body: "Bring an HR list straight in. Delimiter quirks are handled." },
      { icon: "clock", title: "Time-slot booking", body: "Participants book appointments at signup; shoot day runs on a schedule." },
      { icon: "grid", title: "Flexible schedule editing", body: "Preview changes live, add or remove single slots. Existing bookings stay protected." },
      { icon: "refresh", title: "Self-rescheduling, if you allow it", body: "Off by default. Switch it on per job and confirmation emails carry a link to move their own time." },
      { icon: "grid", title: "Multi-day shoots", body: "Several days, each with its own hours, slot length, and breaks. Status per day, so you know which day is still owed." },
    ],
  },
  {
    n: "02",
    title: "Shoot",
    features: [
      { icon: "check", title: "Shoot-day queue", body: "Click-to-copy names for tethered shooting, mark shot, no show, reset." },
      { icon: "qr", title: "Walk-ins that handle themselves", body: "A QR card for the booth. People scan it, add themselves, and see their place in line." },
      { icon: "flag", title: "No-show tracking", body: "Flag anyone who didn't turn up and hand your client an attendance report." },
      { icon: "note", title: "Private notes per person", body: "Retouch preferences and reminders, written at the camera, visible only to you." },
      { icon: "image", title: "Your profile on every email", body: "A public page with your portrait, links, and portfolio, linked from the emails participants receive." },
    ],
  },
  {
    n: "03",
    title: "Sort",
    features: [
      { icon: "camera", title: "Works with Capture One and Lightroom", body: "No plugin, no new habits. Name files from the queue, point us at your export folder." },
      { icon: "folder", title: "Watch folder", body: "Map your export folder; new frames upload and sort automatically." },
      { icon: "arrow", title: "Filename auto-match", body: "Shots match to participants by name, including partial matches." },
      { icon: "file", title: "PSD files", body: "Layered Photoshop files upload and match like any photo, and go to your client only." },
      { icon: "refresh", title: "Live gallery updates", body: "Upload more photos later; open galleries refresh on their own." },
    ],
  },
  {
    n: "04",
    title: "Deliver",
    features: [
      { icon: "lock", title: "Private galleries", body: "Each participant sees only their own photos. Link-only access." },
      { icon: "star", title: "Participant favourites", body: "People star the shots they want kept. Your retouch list builds itself." },
      { icon: "mail", title: "One-click delivery", body: "Email every finished participant their gallery at once. Resend anytime." },
      { icon: "download", title: "Deliver to the client instead", body: "Per job, choose who gets the photos: each person, your client contact, or both. The client gets one link and one zip, foldered per person." },
      { icon: "image", title: "Client-branded delivery", body: "Upload a client's logo once. Signup page, galleries, and emails carry it." },
      { icon: "dashboard", title: "Client status dashboard", body: "A live progress link for your contact, per day on multi-day shoots. No more status-check emails." },
      { icon: "download", title: "Download limits", body: "Set how many headshots each person keeps. Re-downloads are free." },
    ],
  },
];

// Roadmap. Keep this honest and current: when a feature ships, move it to
// "shipped" (newest first); when work starts, move it to "building".
const ROADMAP: { status: "shipped" | "building" | "next"; title: string; detail: string }[] = [
  { status: "shipped", title: "Walk-ins that handle themselves", detail: "QR card for the booth, live queue position from their desk." },
  { status: "shipped", title: "No-show tracking", detail: "An attendance report, the first thing clients ask for after a shoot." },
  { status: "shipped", title: "Multi-day shoots", detail: "Several days, each with its own hours, slot length, and breaks." },
  { status: "shipped", title: "Client logos everywhere it counts", detail: "Signup pages, galleries, and delivery emails carry their branding." },
  { status: "shipped", title: "Client status dashboard", detail: "Signups, bookings, and delivery progress without asking you." },
  { status: "building", title: "Subscriptions and billing", detail: "Solo, Pro, and Studio plans with a one-month trial, no card needed to start." },
  { status: "next", title: "Paid extra downloads", detail: "Participants can buy photos beyond the included allowance." },
  { status: "next", title: "AI retouching and background swap", detail: "Roadmap only, not shipped." },
];

/* ------------------------------------------------------------------ */
/* Small presentational pieces                                         */
/* ------------------------------------------------------------------ */

// Neutral studio placeholder, or a real headshot when `src` is given.
function Portrait({
  src,
  alt = "",
  tone = 0,
  className = "",
}: {
  src?: string;
  alt?: string;
  tone?: number;
  className?: string;
}) {
  const bgs = ["#EEF1F5", "#E8ECF1", "#F1F3F6", "#E9EDF2", "#F0F2F5", "#E7EBF0"];
  const fgs = ["#D6DBE3", "#CFD5DE", "#D9DEE6", "#D1D7E0", "#D8DDE5", "#CED4DD"];
  const i = tone % bgs.length;
  return (
    <div
      className={"relative aspect-[4/5] overflow-hidden rounded-lg " + className}
      style={{ background: bgs[i] }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt} className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <svg aria-hidden viewBox="0 0 100 100" className="absolute bottom-0 left-0 w-full">
          <circle cx="50" cy="38" r="17" fill={fgs[i]} />
          <path d="M14 100c2-24 18-36 36-36s34 12 36 36z" fill={fgs[i]} />
        </svg>
      )}
    </div>
  );
}

type IconName =
  | "list" | "file" | "clock" | "grid" | "check" | "qr" | "flag" | "note"
  | "camera" | "folder" | "arrow" | "refresh" | "lock" | "star" | "mail"
  | "image" | "dashboard" | "download";

const ICON_PATHS: Record<IconName, string> = {
  list: "M3 5h14M3 10h14M3 15h9",
  file: "M4 3h8l4 4v10H4z M12 3v4h4",
  clock: "M10 3a7 7 0 100 14 7 7 0 000-14z M10 6v4l3 2",
  grid: "M3 5h14v11H3z M3 9h14 M7 5v11",
  check: "M4 4h12v12H4z M7 10l2 2 4-4",
  qr: "M3 3h5v5H3z M12 3h5v5h-5z M3 12h5v5H3z M12 12h2v2h-2z M15 15h2v2h-2z",
  flag: "M5 17V3 M5 3h10l-2 3.5 2 3.5H5",
  note: "M4 3h12v14H4z M7 7h6 M7 10h6 M7 13h3",
  camera: "M3 6h4l1.5-2h3L13 6h4v10H3z M10 13a2.5 2.5 0 100-5 2.5 2.5 0 000 5z",
  folder: "M3 6h5l2 2h7v8H3z",
  arrow: "M4 10h12 M11 5l5 5-5 5",
  refresh: "M16 10a6 6 0 01-10.5 4 M4 10a6 6 0 0110.5-4 M15 3v3.5h-3.5 M5 17v-3.5h3.5",
  lock: "M4 9h12v8H4z M7 9V6a3 3 0 016 0v3",
  star: "M10 2.5l2.2 4.6 5 .7-3.6 3.5.9 5L10 13.9l-4.5 2.4.9-5L2.8 7.8l5-.7z",
  mail: "M3 5h14v10H3z M3 5l7 6 7-6",
  image: "M3 3h14v14H3z M6 13l3-4 2 2.5 1.5-1.5L15 13",
  dashboard: "M3 3h6v6H3z M11 3h6v4h-6z M11 9h6v8h-6z M3 11h6v6H3z",
  download: "M10 3v10 M6 9l4 4 4-4 M4 16h12",
};

function Icon({ name }: { name: IconName }) {
  return (
    <svg aria-hidden viewBox="0 0 20 20" className="h-5 w-5 shrink-0">
      <path
        d={ICON_PATHS[name]}
        fill="none"
        className="stroke-accent"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Eyebrow({ children, tone = "accent" }: { children: ReactNode; tone?: "accent" | "muted" }) {
  return (
    <p
      className={
        "text-xs font-medium uppercase tracking-wider " +
        (tone === "accent" ? "text-accent" : "text-muted-400")
      }
    >
      {children}
    </p>
  );
}

function H2({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <h2 className={"font-display text-3xl sm:text-4xl font-semibold tracking-tight " + className}>
      {children}
    </h2>
  );
}

function Pill({ children, tone = "accent" }: { children: ReactNode; tone?: "accent" | "neutral" | "amber" | "green" }) {
  const tones = {
    accent: "bg-accent-muted text-accent",
    neutral: "bg-muted-100 text-muted-600",
    amber: "bg-amber-100 text-amber-700",
    green: "bg-green-100 text-green-700",
  };
  return (
    <span className={"inline-flex items-center rounded-lg px-2 py-0.5 text-xs font-medium " + tones[tone]}>
      {children}
    </span>
  );
}

// A static, read-only mock of the shoot-day queue. Used twice: as the hero
// overlay and inside the job-page frame.
function QueueMock({ compact = false }: { compact?: boolean }) {
  const rows = [
    { name: "Tom Visser", right: "10:20", tone: "muted" },
    { name: "Priya Nair", right: "10:30", tone: "muted" },
    { name: "Marco Ruiz", right: "Shot", tone: "done" },
  ] as const;
  return (
    <div className="overflow-hidden rounded-lg border border-muted-200 bg-paper">
      <div className="flex flex-col gap-1.5 bg-accent-muted px-3 py-2.5">
        <div className="flex items-center justify-between">
          <span className={"font-medium " + (compact ? "text-sm" : "font-display text-lg tracking-tight")}>Mara Visser</span>
          <span className="flex gap-1.5">
            <span className="rounded-md bg-accent px-2 py-1 text-xs font-medium text-accent-fg">Mark shot</span>
            <span className="rounded-md border border-muted-200 bg-paper px-2 py-1 text-xs font-medium text-ink">No show</span>
          </span>
        </div>
        {/* The private note: the thing the existing tools do not have. */}
        <span className="flex items-center gap-1.5 text-[11px] text-muted-600">
          <svg aria-hidden viewBox="0 0 20 20" className="h-3 w-3 shrink-0"><path d="M4 3h12v14H4z M7 7h6 M7 10h6 M7 13h3" fill="none" className="stroke-muted-400" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" /></svg>
          Note: light retouching on the face only, keep the glasses.
        </span>
      </div>
      {rows.map((r) => (
        <div key={r.name} className="flex items-center justify-between border-t border-muted-200 px-3 py-2 text-sm">
          <span className={r.tone === "done" ? "text-muted-400 line-through" : "text-ink"}>{r.name}</span>
          <span className={"text-xs " + (r.tone === "done" ? "font-medium text-green-700" : "text-muted-400")}>{r.right}</span>
        </div>
      ))}
    </div>
  );
}

// The tools around us. Logos are the vendors' own files in /public/logos,
// shown on the background they were made for (a white-on-black wordmark
// stays on black) rather than recoloured. `wide` marks a wordmark that
// needs a wider tile than a square app icon.
type Tool = { name: string; url: string; logo: string; bg: string; wide?: boolean; capture: boolean };
const TOOLS: Tool[] = [
  { name: "Capture One", url: "https://www.captureone.com", logo: "/logos/capture-one.png", bg: "#000000", wide: true, capture: true },
  { name: "Adobe Lightroom", url: "https://www.adobe.com/products/photoshop-lightroom.html", logo: "/logos/lightroom.png", bg: "#FFFFFF", capture: true },
  { name: "Smart Shooter", url: "https://www.tethertools.com/smart-shooter/", logo: "/logos/smart-shooter.png", bg: "#0B0F1A", wide: true, capture: true },
  { name: "Evoto", url: "https://www.evoto.ai", logo: "/logos/evoto.png", bg: "#FFDF52", wide: true, capture: false },
];

function ToolLink({ tool, chip = false }: { tool: Tool; chip?: boolean }) {
  return (
    <a
      href={tool.url}
      target="_blank"
      rel="noopener noreferrer"
      title={tool.name}
      className={
        "inline-flex items-center gap-2.5 font-medium text-ink transition hover:text-accent " +
        (chip ? "rounded-lg border border-muted-200 bg-paper py-1.5 pl-1.5 pr-3 text-[13px]" : "")
      }
    >
      <span
        className={"flex h-7 shrink-0 items-center justify-center overflow-hidden rounded-md " + (tool.wide ? "w-14 px-1.5" : "w-7")}
        style={{ background: tool.bg }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={tool.logo} alt="" className="h-full w-full object-contain" />
      </span>
      {tool.name}
    </a>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function HomePage() {
  return (
    <main className="min-h-dvh">
      {/* Header */}
      <header className="mx-auto flex h-16 max-w-[var(--max-content)] items-center justify-between px-4 sm:px-6">
        <Link href="/">
          <Logo size="sm" wordmark />
        </Link>
        <nav className="flex items-center gap-4 text-sm sm:gap-6">
          <a href="#how-it-works" className="hidden text-muted-600 transition hover:text-ink sm:inline">How it works</a>
          <a href="#tethering" className="hidden text-muted-600 transition hover:text-ink sm:inline">Tethering</a>
          <a href="#features" className="hidden text-muted-600 transition hover:text-ink sm:inline">Features</a>
          {/* Cast: typedRoutes only learns new routes on a fresh build. */}
          <Link href={"/for-clients" as Route} className="hidden text-muted-600 transition hover:text-ink sm:inline">For clients</Link>
          <Link href="/help" className="hidden text-muted-600 transition hover:text-ink sm:inline">Help</Link>
          <Link href="/login" className="hidden text-muted-600 transition hover:text-ink sm:inline">Log in</Link>
          <TrackedLink event="Start free clicked" where="nav" href="/signup" className="btn-primary text-sm">Try it free</TrackedLink>
        </nav>
      </header>

      {/* Hero: portraits carry it, one live queue card over them. */}
      <section className="mx-auto grid max-w-[var(--max-content)] grid-cols-1 items-center gap-12 px-4 pb-16 pt-12 sm:px-6 sm:pt-20 lg:grid-cols-2 lg:gap-16 lg:pb-20">
        <div className="flex flex-col gap-6">
          <Eyebrow>For headshot photographers</Eyebrow>
          <h1 className="font-display text-4xl font-semibold leading-[1.05] tracking-[-0.03em] sm:text-5xl md:text-6xl">
            Team headshots, from signup to delivery, in one clear flow.
          </h1>
          <p className="max-w-xl text-base text-muted-600 sm:text-lg">
            <BrandName /> is a web app for photographers who shoot headshots for
            companies, teams, and events. People sign up through one link, you
            shoot from a live queue, photos file themselves under the right
            person, and everyone gets their own private gallery with one click.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <TrackedLink event="Start free clicked" where="hero" className="btn-primary" href="/signup">Try it free</TrackedLink>
            <a className="btn-secondary" href="#how-it-works">See how it works</a>
          </div>
          <p className="text-xs text-muted-400">Free during beta · No credit card</p>
        </div>

        <div className="relative">
          {/* One collage of headshots. Wide crop on small screens, where a
              tall image would push everything below the fold; tall crop
              beside the copy on desktop. */}
          <picture>
            <source media="(min-width: 1024px)" srcSet="/hero/headshots-tall.jpg" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/hero/headshots-wide.jpg"
              alt="A grid of headshots of different people, each on a plain studio backdrop"
              width={2396}
              height={1200}
              fetchPriority="high"
              className="aspect-[2/1] w-full rounded-card object-cover lg:aspect-[2/3] lg:max-h-[640px]"
            />
          </picture>
          {/* The only shadow on the page: an overlay on a photograph. */}
          <div className="absolute -left-2 bottom-6 w-60 rounded-card border border-muted-200 bg-paper p-4 shadow-[0_12px_32px_rgba(11,15,26,0.08)] sm:-left-6">
            <Eyebrow tone="muted">Up next</Eyebrow>
            <p className="mt-2 font-display text-xl font-semibold tracking-tight">Mara Visser</p>
            <p className="mt-1 font-mono text-xs text-muted-600">Mara Visser_0007.jpg</p>
            <p className="mt-2 text-[11px] leading-snug text-muted-600">Note: light retouching on the face only, keep the glasses.</p>
            <div className="mt-3 flex gap-2">
              <span className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg">Mark shot</span>
              <span className="rounded-lg border border-muted-200 bg-paper px-3 py-1.5 text-xs font-medium text-ink">No show</span>
            </div>
          </div>
          <span className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-lg border border-muted-200 bg-paper px-2.5 py-1 text-xs font-medium text-green-700">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
            Delivered
          </span>
        </div>
      </section>

      {/* The real job page, in a browser frame. Showcases what an actual
          project looks like before we explain anything. */}
      <section className="border-t border-muted-200 bg-muted-50">
        <div className="mx-auto max-w-[var(--max-content)] px-4 pb-0 pt-14 sm:px-6 sm:pt-20">
          <div className="mx-auto max-w-2xl text-center">
            <Eyebrow>A job on HeadshotDesk</Eyebrow>
            <H2 className="mt-3">One page per shoot, from setup to delivery</H2>
            <p className="mt-3 text-sm text-muted-600 sm:text-base">
              This is the job page. Signups, bookings, who has been photographed,
              how many photos are in, and who has been delivered all update on
              their own while you work. Your client contact gets a read-only copy.
            </p>
          </div>

          <div className="mt-10 overflow-hidden rounded-t-xl border border-b-0 border-muted-200 bg-paper">
            {/* Browser bar */}
            <div className="flex h-10 items-center gap-3 border-b border-muted-200 bg-muted-50 px-4">
              <span className="flex gap-1.5" aria-hidden>
                <span className="h-2.5 w-2.5 rounded-full bg-muted-200" />
                <span className="h-2.5 w-2.5 rounded-full bg-muted-200" />
                <span className="h-2.5 w-2.5 rounded-full bg-muted-200" />
              </span>
              <span className="mx-auto hidden h-6 w-full max-w-md items-center justify-center rounded-md border border-muted-200 bg-paper font-mono text-[11px] text-muted-600 sm:flex">
                app.headshotdesk.com/jobs/acme-q4
              </span>
            </div>
            {/* App chrome */}
            <div className="flex items-center justify-between gap-3 border-b border-muted-200 px-4 py-3 sm:px-6">
              <span className="flex min-w-0 items-center gap-2.5 text-[13px]">
                <Logo size="sm" />
                <span className="hidden text-muted-600 sm:inline">Jobs</span>
                <span className="hidden text-muted-400 sm:inline">/</span>
                <span className="truncate font-medium">Acme Corp · Q4 team headshots</span>
              </span>
              <Pill tone="amber">Shoot day</Pill>
            </div>
            {/* Job page body */}
            <div className="flex flex-col gap-5 p-4 sm:p-6">
              {/* Stepper */}
              <ol className="grid grid-cols-2 gap-2 md:grid-cols-4">
                <li className="flex items-center gap-2 rounded-lg bg-muted-100 px-3 py-2.5 text-[13px] font-medium">
                  <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-green-700">
                    <svg aria-hidden viewBox="0 0 12 12" className="h-2.5 w-2.5"><path d="M2.5 6.5l2.3 2.3L9.5 4" fill="none" stroke="#fff" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </span>
                  Setup
                </li>
                <li className="flex items-center gap-2 rounded-lg border border-accent/30 bg-accent-muted px-3 py-2.5 text-[13px] font-medium">
                  <span className="h-[18px] w-[18px] rounded-full bg-accent" />
                  Shoot day
                </li>
                <li className="flex items-center gap-2 rounded-lg border border-muted-200 px-3 py-2.5 text-[13px] text-muted-600">
                  <span className="h-[18px] w-[18px] rounded-full border-[1.5px] border-muted-200" />
                  Delivery
                </li>
                <li className="flex items-center gap-2 rounded-lg border border-muted-200 px-3 py-2.5 text-[13px] text-muted-600">
                  <span className="h-[18px] w-[18px] rounded-full border-[1.5px] border-muted-200" />
                  Done
                </li>
              </ol>
              {/* Stat tiles */}
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {[
                  { label: "Participants shot", value: "24", of: "/ 31" },
                  { label: "Photos uploaded", value: "612" },
                  { label: "Galleries ready", value: "24" },
                  { label: "Downloads", value: "0" },
                ].map((t) => (
                  <div key={t.label} className="flex flex-col gap-1.5 rounded-card border border-muted-200 p-4">
                    <span className="text-xs text-muted-600">{t.label}</span>
                    <span className="font-display text-2xl font-semibold tracking-tight sm:text-[28px]">
                      {t.value}
                      {t.of ? <span className="ml-1 text-sm font-medium text-muted-400">{t.of}</span> : null}
                    </span>
                  </div>
                ))}
              </div>
              {/* Shoot-day card + signup link + client dashboard */}
              <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
                <div className="flex flex-col gap-3.5 rounded-card border border-muted-200 p-5 md:col-span-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-display text-base font-semibold tracking-tight">Shoot day</span>
                    <span className="text-xs text-muted-600">Tue 14 Oct · 09:00 to 13:00 · Amsterdam HQ</span>
                  </div>
                  <QueueMock compact />
                </div>
                <div className="flex flex-col gap-3 md:col-span-2">
                  <div className="flex flex-col gap-2.5 rounded-card border border-muted-200 p-5">
                    <span className="text-xs text-muted-600">Signup link</span>
                    <div className="flex items-center gap-2">
                      <span className="flex h-8 min-w-0 flex-1 items-center truncate rounded-md border border-muted-200 bg-muted-50 px-2.5 font-mono text-[11px] text-muted-600">
                        headshotdesk.com/s/acme-q4
                      </span>
                      <span className="rounded-md border border-muted-200 px-2.5 py-1.5 text-xs font-medium">Copy</span>
                      <span className="rounded-md border border-muted-200 px-2.5 py-1.5 text-xs font-medium">QR card</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between rounded-card border border-muted-200 p-5">
                    <span className="flex flex-col gap-0.5">
                      <span className="text-xs text-muted-600">Client dashboard</span>
                      <span className="text-[13px] font-medium">Shared with hr@acme.com</span>
                    </span>
                    <span className="text-[13px] font-medium text-accent">Open</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Compatibility strip */}
      <section className="border-t border-muted-200">
        <div className="mx-auto flex max-w-[var(--max-content)] flex-wrap items-center justify-center gap-x-8 gap-y-2 px-4 py-6 text-sm sm:px-6">
          <span className="text-muted-600">Works with</span>
          {TOOLS.map((t) => (
            <ToolLink key={t.name} tool={t} />
          ))}
          <span className="font-medium">Any folder export</span>
        </div>
      </section>

      {/* How it works: a bento of mini screens, each tagged with what's
          unique to this tool. Comes before the benefits on purpose: a
          photographer wants to see the flow before being sold on it. */}
      <section id="how-it-works" className="border-t border-muted-200">
        <div className="mx-auto max-w-[var(--max-content)] px-4 py-14 sm:px-6 sm:py-20">
          <Eyebrow>How it works</Eyebrow>
          <H2 className="mt-3">How a shoot runs on <BrandName /></H2>
          <p className="mt-2 max-w-2xl text-sm text-muted-600 sm:text-base">
            The whole workflow, start to finish. If this looks like your shoot day,
            you already know how to use the product.
          </p>

          <ol className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-6">
            {STEPS.map((step, i) => {
              const wide = i >= 3;
              return (
                <li
                  key={step.n}
                  className={
                    "flex flex-col gap-4 rounded-card border p-6 " +
                    (i === 4
                      ? "border-accent/30 bg-accent-muted "
                      : "border-muted-200 bg-paper ") +
                    (wide ? "lg:col-span-3" : "lg:col-span-2")
                  }
                >
                  <div className="flex flex-col gap-1.5">
                    <span className="font-mono text-xs text-accent">{step.n}</span>
                    <h3 className="font-display text-lg font-semibold tracking-tight">{step.title}</h3>
                    <ul className="mt-1 flex flex-col gap-1.5">
                      {step.points.map((pt) => (
                        <li key={pt} className="flex gap-2 text-sm leading-relaxed text-muted-600">
                          <span aria-hidden className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                          <span>{renderBrand(pt)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <StepMock index={i} />
                  <div className="flex flex-wrap gap-1.5">
                    {step.unique.map((u) => (
                      <Pill key={u} tone={i === 4 ? "neutral" : "accent"}>{u}</Pill>
                    ))}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      </section>

      {/* Tethering: the question every photographer asks first. */}
      <section id="tethering" className="border-t border-muted-200 bg-muted-50">
        <div className="mx-auto grid max-w-[var(--max-content)] grid-cols-1 gap-10 px-4 py-14 sm:px-6 sm:py-20 md:grid-cols-2 md:gap-16">
          <div className="flex flex-col gap-4">
            <H2>Works with the software you already shoot on</H2>
            <p className="text-sm text-muted-600 sm:text-base">
              You keep tethering the way you do today. <BrandName /> sits after your
              capture software, not in front of it: nothing to install, no plugin,
              no new export habit. Two settings and photos file themselves under
              the right person while you keep shooting.
            </p>
            <div className="flex flex-wrap gap-2 pt-2">
              {TOOLS.filter((t) => t.capture).map((t) => (
                <ToolLink key={t.name} tool={t} chip />
              ))}
              <span className="rounded-lg border border-muted-200 bg-paper px-3 py-1.5 text-[13px] font-medium">Any tool that exports to a folder</span>
            </div>
            <p className="mt-2 text-xs text-muted-400">
              Capture One, Adobe Lightroom, Smart Shooter, and Evoto are trademarks
              of their respective owners, shown as they publish them. <BrandName />{" "}
              is not affiliated with or endorsed by them.
            </p>
          </div>
          <div className="flex flex-col">
            <div className="flex flex-col gap-2 border-t border-muted-200 py-6">
              <Eyebrow tone="muted">Setting 1 · in your capture software</Eyebrow>
              <h3 className="font-display text-lg font-semibold tracking-tight">Name files from the clipboard</h3>
              <p className="text-sm leading-relaxed text-muted-600">
                In Capture One, build the Next Capture Naming format from the clipboard
                (or name) token plus a counter. In Lightroom, use a Shot Name template
                and press Cmd+Shift+T per person. Either way, frames come out as{" "}
                <span className="whitespace-nowrap font-mono text-[13px] text-ink">Mara Visser_0001.jpg</span>.
              </p>
            </div>
            <div className="flex flex-col gap-2 border-y border-muted-200 py-6">
              <Eyebrow tone="muted">Setting 2 · in <BrandName /></Eyebrow>
              <h3 className="font-display text-lg font-semibold tracking-tight">Point us at your export folder</h3>
              <p className="text-sm leading-relaxed text-muted-600">
                Map the folder your software exports to. New frames upload on their
                own and match to the right person by that filename. No plugin, no
                cloud sync service, no dragging files at midnight. Prefer to work
                offline? Drop the folder in afterwards instead.
              </p>
            </div>
            <p className="mt-4 text-sm text-muted-600">
              <Link href="/help" className="text-accent hover:underline">
                Numbered setup steps for Capture One, Lightroom, and everything else
              </Link>{" "}
              live in the help center, including what to do when a photo lands in Unassigned.
            </p>
          </div>
        </div>
      </section>

      {/* The benefits, after the reader has seen how it works. Plain two
          columns, no cards. */}
      <section className="border-t border-muted-200">
        <div className="mx-auto max-w-[var(--max-content)] px-4 py-14 sm:px-6 sm:py-20">
          <H2 className="max-w-2xl">A 30-person shoot is one hour of photography and a week of admin</H2>
          <p className="mt-3 max-w-2xl text-sm text-muted-600 sm:text-base">
            If you&apos;ve shot team headshots, you know the photography is the easy
            part. It&apos;s everything around it that eats the week.
          </p>
          <div className="mt-10 grid grid-cols-1 gap-10 md:grid-cols-2 md:gap-16">
            <div className="flex flex-col gap-4 md:border-r md:border-muted-200 md:pr-8">
              <Eyebrow tone="muted">Without a tool</Eyebrow>
              <p className="text-sm leading-relaxed text-muted-600">Names and emails collected across reply-all threads and a spreadsheet someone keeps &ldquo;improving&rdquo;.</p>
              <p className="text-sm leading-relaxed text-muted-600">Shoot day off a printed list, guessing who&apos;s in front of the camera and scribbling frame numbers next to names.</p>
              <p className="text-sm leading-relaxed text-muted-600">An evening (or three) renaming hundreds of files and sorting them into folders per person.</p>
              <p className="text-sm leading-relaxed text-muted-600">Zipping folders, uploading to WeTransfer, emailing thirty links one by one. Then the follow-ups: &ldquo;which photo was me?&rdquo;, &ldquo;the link expired&rdquo;, &ldquo;can you resend mine?&rdquo;</p>
            </div>
            <div className="flex flex-col gap-4">
              <Eyebrow>With <BrandName /></Eyebrow>
              <p className="text-sm leading-relaxed text-ink">People add themselves through one signup link.</p>
              <p className="text-sm leading-relaxed text-ink">Shoot day runs off a live queue: tap a name, shoot, mark done.</p>
              <p className="text-sm leading-relaxed text-ink">Photos upload and file themselves under the right person while you&apos;re still shooting.</p>
              <p className="text-sm leading-relaxed text-ink">Participants star the shots they want, so your retouch list is decided before you open an editor. One click emails every person a private gallery. Links don&apos;t expire, re-downloads are free.</p>
            </div>
          </div>
          {/* Honesty note: we don't retouch for you (yet). */}
          <p className="mt-8 max-w-2xl text-xs text-muted-400">
            Retouching stays yours, whether that&apos;s an hour in Evoto or a few
            evenings by hand. AI retouching is on the roadmap, not shipped.
          </p>
        </div>
      </section>

      {/* Features, grouped by stage. Everything here is live today. */}
      <section id="features" className="border-t border-muted-200 bg-muted-50">
        <div className="mx-auto max-w-[var(--max-content)] px-4 py-14 sm:px-6 sm:py-20">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <Eyebrow>Features</Eyebrow>
              <H2 className="mt-3">Everything included today, by stage</H2>
            </div>
            <p className="text-sm text-muted-600">All live, not a teaser for a future release.</p>
          </div>
          <div className="mt-10 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES_BY_STAGE.map((stage) => (
              <div key={stage.n} className="flex flex-col gap-5 border-t-2 border-accent pt-4">
                <span className="font-mono text-xs text-accent">{stage.n} {stage.title}</span>
                {stage.features.map((f) => (
                  <div key={f.title} className="flex gap-3">
                    <Icon name={f.icon} />
                    <div>
                      <h3 className="text-sm font-semibold text-ink">{f.title}</h3>
                      <p className="mt-0.5 text-[13px] leading-relaxed text-muted-600">{renderBrand(f.body)}</p>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
          <p className="mt-10 max-w-2xl text-sm text-muted-600">
            Privacy your clients can sign off on: consent collected at signup,
            galleries private and link-only. When a client&apos;s HR team asks about
            data handling, the answer is yes.{" "}
            <Link href={"/for-clients" as Route} className="text-accent hover:underline">Read the client page</Link>.
          </p>
        </div>
      </section>

      {/* Built in the open: honest about what's coming vs. what exists. */}
      <section className="border-t border-muted-200">
        <div className="mx-auto grid max-w-[var(--max-content)] grid-cols-1 gap-10 px-4 py-14 sm:px-6 sm:py-20 md:grid-cols-12 md:gap-12">
          <div className="flex flex-col gap-3 md:col-span-5">
            <H2>Built in the open</H2>
            <p className="text-sm text-muted-600 sm:text-base">
              What just shipped, what we&apos;re building right now, and what&apos;s
              next. Steered by our beta photographers.
            </p>
          </div>
          <ol className="flex flex-col md:col-span-7">
            {ROADMAP.map((item) => (
              <li
                key={item.title}
                className={
                  "grid grid-cols-[96px_minmax(0,1fr)] gap-4 border-t border-muted-200 py-3 sm:grid-cols-[120px_minmax(0,1fr)] " +
                  (item.status === "building" ? "-mx-3 rounded-lg bg-accent-muted px-3" : "")
                }
              >
                <span
                  className={
                    "text-xs font-medium " +
                    (item.status === "shipped"
                      ? "text-green-700"
                      : item.status === "building"
                        ? "text-accent"
                        : "text-muted-400")
                  }
                >
                  {item.status === "shipped" ? "Shipped" : item.status === "building" ? "Building now" : "Up next"}
                </span>
                <span className="text-sm">
                  <span className="font-medium text-ink">{item.title}</span>
                  <span className="text-muted-600"> {item.detail}</span>
                </span>
              </li>
            ))}
            <li className="border-t border-muted-200" />
          </ol>
          <div className="md:col-span-12 md:border-t md:border-muted-200 md:pt-8">
            <h3 className="font-display text-lg font-semibold tracking-tight">Missing something?</h3>
            <p className="mt-1 max-w-xl text-sm text-muted-600">
              The list above is largely built from photographer requests. Tell us
              what would make your shoots easier.
            </p>
            <div className="mt-4">
              <FeatureRequestForm />
            </div>
          </div>
        </div>
      </section>

      {/* Beta CTA */}
      <section className="border-t border-muted-200 bg-muted-50">
        <div className="mx-auto max-w-[var(--max-content)] px-4 py-14 sm:px-6 sm:py-20">
          <H2 className="max-w-2xl">Free while in beta. Help shape it</H2>
          <p className="mt-3 max-w-2xl text-sm text-muted-600 sm:text-base">
            <BrandName /> is in active beta. Everything on this page works today and
            costs nothing while we polish. Beta photographers get a direct line to
            the roadmap. Pricing comes later; your jobs and photos stay yours either way.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <TrackedLink event="Start free clicked" where="closing" className="btn-primary" href="/signup">Create your account</TrackedLink>
            <a className="btn-secondary" href="mailto:info@headshotdesk.com?subject=HeadshotDesk beta">Questions? Email us</a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-muted-200">
        <div className="mx-auto flex max-w-[var(--max-content)] flex-col items-start justify-between gap-4 px-4 py-8 sm:flex-row sm:items-center sm:px-6">
          <Logo size="sm" wordmark />
          <nav className="flex items-center gap-5 text-xs text-muted-600">
            <Link href="/help" className="transition hover:text-ink">Help</Link>
            <Link href="/privacy" className="transition hover:text-ink">Privacy</Link>
            <Link href="/terms" className="transition hover:text-ink">Terms</Link>
            <a href="mailto:info@headshotdesk.com" className="transition hover:text-ink">Contact</a>
          </nav>
          <p className="text-xs text-muted-400">© {new Date().getFullYear()} Panther Studios, Amsterdam</p>
        </div>
      </footer>
    </main>
  );
}

/* ------------------------------------------------------------------ */
/* Mini screens for the bento steps                                    */
/* ------------------------------------------------------------------ */

function Field({ label, value, placeholder }: { label: string; value?: string; placeholder?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] text-muted-600">{label}</span>
      <span className={"flex h-[30px] items-center rounded-md border border-muted-200 bg-paper px-2.5 text-[13px] " + (value ? "text-ink" : "text-muted-400")}>
        {value ?? placeholder}
      </span>
    </div>
  );
}

function StepMock({ index }: { index: number }) {
  const frame = "rounded-lg border border-muted-200 bg-muted-50 p-3.5";
  switch (index) {
    case 0:
      return (
        <div className={frame + " flex flex-col gap-2"}>
          <Field label="Job name" value="Acme Corp · Q4 team headshots" />
          <div className="grid grid-cols-2 gap-2">
            <Field label="Shoot dates" value="14 and 15 Oct" />
            <Field label="Keeps per person" value="3" />
          </div>
        </div>
      );
    case 1:
      return (
        <div className={frame + " flex flex-col gap-2.5"}>
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-ink text-[10px] font-semibold text-paper">AC</span>
            <span className="text-[13px] font-medium">Acme Corp headshots</span>
          </div>
          <Field label="Full name" placeholder="Mara Visser" />
          <div className="flex gap-1.5">
            <span className="rounded-md border border-accent bg-accent-muted px-2.5 py-1 text-xs font-medium text-accent">10:20</span>
            <span className="rounded-md border border-muted-200 bg-paper px-2.5 py-1 text-xs">10:30</span>
            <span className="rounded-md border border-muted-200 bg-paper px-2.5 py-1 text-xs">10:40</span>
          </div>
        </div>
      );
    case 2:
      return <QueueMock compact />;
    case 3:
      return (
        <div className={frame + " grid grid-cols-[minmax(0,1fr)_24px_minmax(0,1fr)] items-center gap-2.5"}>
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] text-muted-600">Export folder</span>
            {["Mara Visser_0007.jpg", "Mara Visser_0008.jpg", "Tom Visser_0001.jpg"].map((f) => (
              <span key={f} className="truncate rounded-md border border-muted-200 bg-paper px-2 py-1.5 font-mono text-[11px]">{f}</span>
            ))}
          </div>
          <svg aria-hidden viewBox="0 0 24 24" className="h-6 w-6"><path d="M4 12h14M13 6l6 6-6 6" fill="none" className="stroke-accent" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" /></svg>
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] text-muted-600">Filed under</span>
            {[
              ["Mara Visser", "8 photos"],
              ["Tom Visser", "1 photo"],
              ["Unassigned", "0"],
            ].map(([n, c]) => (
              <span key={n} className={"flex justify-between rounded-md border border-muted-200 bg-paper px-2 py-1.5 text-xs " + (n === "Unassigned" ? "text-muted-400" : "")}>
                <span className={n === "Unassigned" ? "" : "font-medium"}>{n}</span>
                <span className="text-muted-600">{c}</span>
              </span>
            ))}
          </div>
        </div>
      );
    default:
      return (
        <div className="flex flex-col gap-2.5 rounded-lg border border-muted-200 bg-paper p-3.5">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-medium">Mara, your headshots are ready</span>
            <span className="text-[11px] text-muted-400">from Acme Corp</span>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="relative">
                <Portrait tone={i + 3} className="rounded-md" />
                {i % 2 === 0 ? (
                  <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-accent">
                    <svg aria-hidden viewBox="0 0 12 12" className="h-2.5 w-2.5"><path d="M6 1l1.5 3.2 3.5.5-2.5 2.4.6 3.5L6 9l-3.1 1.6.6-3.5L1 4.7l3.5-.5z" fill="#fff" /></svg>
                  </span>
                ) : null}
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-600">2 of 3 downloads left</span>
            <span className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg">Download</span>
          </div>
        </div>
      );
  }
}

"use client";

// Mock screens for the product tour.
//
// Drawn rather than screenshotted. Screenshots go stale silently and a
// stale screenshot is worse than none: it teaches the wrong thing and
// nobody notices until a customer is confused. These are small enough to
// keep honest, and they render at any width.
//
// They are simplified on purpose. A pixel-perfect replica invites the
// reader to hunt for the button, and the point of a tour is to explain what
// a screen is FOR, not to be that screen.

import type { TourStop } from "@/lib/tour";

/** Chrome shared by every mock, so they read as "a screen in the app". */
function Frame({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-card border border-muted-200 bg-paper shadow-sm">
      <div className="flex items-center gap-2 border-b border-muted-200 bg-muted-50 px-4 py-2.5">
        <span className="flex gap-1.5" aria-hidden>
          <span className="h-2.5 w-2.5 rounded-full bg-muted-200" />
          <span className="h-2.5 w-2.5 rounded-full bg-muted-200" />
          <span className="h-2.5 w-2.5 rounded-full bg-muted-200" />
        </span>
        <span className="text-xs font-medium text-muted-600">{title}</span>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function Pill({
  children,
  tone = "muted",
}: {
  children: React.ReactNode;
  tone?: "muted" | "accent" | "green" | "amber";
}) {
  const tones = {
    muted: "bg-muted-100 text-muted-600",
    accent: "bg-accent-muted text-accent",
    green: "bg-green-100 text-green-700",
    amber: "bg-amber-50 text-amber-700",
  };
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

/** Placeholder portrait. Drawn, so there's no likeness of a real person
 *  and no licensing question, and it reads unmistakably as a sample. */
function Portrait({ i }: { i: number }) {
  const tints = [
    ["#E7ECFF", "#C9D4FF"],
    ["#FDE9E4", "#F8CFC4"],
    ["#E4F4EC", "#C6E7D6"],
    ["#F3E9FB", "#DFC9F3"],
  ];
  const [from, to] = tints[i % tints.length];
  return (
    <svg viewBox="0 0 100 100" className="h-full w-full" aria-hidden>
      <defs>
        <linearGradient id={`tp${i}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={from} />
          <stop offset="100%" stopColor={to} />
        </linearGradient>
      </defs>
      <rect width="100" height="100" fill={`url(#tp${i})`} />
      <circle cx="50" cy="39" r="15" fill="#fff" opacity="0.85" />
      <path d="M20 100c0-17 13-30 30-30s30 13 30 30z" fill="#fff" opacity="0.85" />
    </svg>
  );
}

const PEOPLE = [
  "Anna Vermeer",
  "Daan Bakker",
  "Sofia Rossi",
  "Marcus Chen",
  "Priya Nair",
  "Tom Weaver",
];

export function TourMock({ kind }: { kind: TourStop["mock"] }) {
  switch (kind) {
    case "jobs":
      return (
        <Frame title="Jobs">
          <div className="space-y-2">
            {[
              ["Acme HQ team headshots", "Delivered", "green", "48 photos"],
              ["Northwind sales offsite", "In progress", "accent", "26 people"],
              ["Meridian new starters", "Signup open", "muted", "9 signed up"],
            ].map(([name, status, tone, meta]) => (
              <div
                key={name}
                className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-muted-200 px-3 py-2.5"
              >
                <span className="text-sm font-medium text-ink">{name}</span>
                <span className="flex items-center gap-2">
                  <span className="text-xs text-muted-600">{meta}</span>
                  <Pill tone={tone as "green"}>{status}</Pill>
                </span>
              </div>
            ))}
          </div>
        </Frame>
      );

    case "signup":
      return (
        <Frame title="Signup page (what participants see)">
          <div className="mx-auto max-w-xs space-y-3">
            <p className="text-sm font-semibold text-ink">
              Sign up for headshots
            </p>
            <p className="text-xs text-muted-600">
              You&apos;re registering for Acme HQ team headshots.
            </p>
            {["Your name", "Email", "Title or role"].map((label) => (
              <div key={label}>
                <p className="text-[11px] font-medium text-muted-600">{label}</p>
                <div className="mt-1 h-8 rounded-md border border-muted-200 bg-muted-50" />
              </div>
            ))}
            <div className="rounded-md bg-accent px-3 py-2 text-center text-xs font-semibold text-accent-fg">
              I&apos;m in
            </div>
          </div>
        </Frame>
      );

    case "schedule":
      return (
        <Frame title="Schedule">
          <div className="mb-3 flex flex-wrap gap-2 text-[11px]">
            <span className="rounded-card border border-accent bg-accent-muted px-2 py-1 text-accent">
              Sat 8 Aug
            </span>
            <span className="rounded-card border border-muted-200 px-2 py-1 text-muted-600">
              Sun 9 Aug
            </span>
          </div>
          <div className="grid grid-cols-4 gap-1 sm:grid-cols-6">
            {[
              "09:00", "09:10", "09:20", "09:30", "09:40", "09:50",
              "10:00", "10:10", "10:20", "10:30", "10:40", "10:50",
            ].map((t, i) => {
              const booked = [1, 4, 7, 8].includes(i);
              const isBreak = i === 10;
              return (
                <div
                  key={t}
                  className={
                    "rounded border px-1.5 py-1 text-center " +
                    (isBreak
                      ? "border-amber-200 bg-amber-50"
                      : booked
                        ? "border-accent/40 bg-accent-muted"
                        : "border-green-300 bg-paper")
                  }
                >
                  <span
                    className={
                      "block font-mono text-[10px] " +
                      (isBreak
                        ? "text-amber-700"
                        : booked
                          ? "text-ink"
                          : "text-green-700")
                    }
                  >
                    {t}
                  </span>
                  <span className="block truncate text-[10px] text-muted-600">
                    {isBreak ? "break" : booked ? PEOPLE[i % 6].split(" ")[0] : ""}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-[11px] text-muted-600">
            4 of 12 slots booked
          </p>
        </Frame>
      );

    case "queue":
      return (
        <Frame title="Shooting: Acme HQ team headshots">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="mb-2 text-xs font-semibold text-ink">Pending (3)</p>
              <div className="space-y-2">
                {PEOPLE.slice(0, 3).map((n, i) => (
                  <div
                    key={n}
                    className={
                      "rounded-card border px-3 py-2 " +
                      (i === 0
                        ? "border-accent ring-2 ring-accent/30"
                        : "border-muted-200")
                    }
                  >
                    <p className="text-sm font-semibold text-ink">
                      <span className="mr-2 rounded bg-accent-muted px-1.5 font-mono text-[11px] text-accent">
                        {["09:20", "09:30", "09:40"][i]}
                      </span>
                      {n}
                    </p>
                    {i === 0 ? (
                      <p className="mt-1 text-[11px] font-medium text-accent">
                        Shooting now. Name copied to clipboard.
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold text-muted-600">
                Already shot (2)
              </p>
              <div className="rounded-card border border-muted-200 divide-y divide-muted-200">
                {PEOPLE.slice(3, 5).map((n) => (
                  <p key={n} className="px-3 py-2 text-sm text-ink">
                    {n}
                  </p>
                ))}
              </div>
            </div>
          </div>
        </Frame>
      );

    case "photos":
      return (
        <Frame title="Photos">
          <div className="mb-3 rounded-card border border-green-300 bg-green-50 px-3 py-2">
            <p className="text-xs font-medium text-green-800">
              Watching your export folder
            </p>
            <p className="text-[11px] text-green-700">
              12 photos uploaded and matched. 2 duplicates skipped.
            </p>
          </div>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i}>
                <div className="aspect-square overflow-hidden rounded border border-muted-200">
                  <Portrait i={i} />
                </div>
                <p className="mt-1 truncate text-[10px] text-muted-600">
                  {PEOPLE[i].split(" ")[0]}_000{i + 1}
                </p>
              </div>
            ))}
          </div>
        </Frame>
      );

    case "gallery":
      return (
        <Frame title="Anna's gallery (what she sees)">
          <p className="text-sm font-semibold text-ink">Your headshots</p>
          <p className="mb-3 text-xs text-muted-600">
            Keep up to 3 photos. Re-downloads are free.
          </p>
          <div className="grid grid-cols-3 gap-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className={
                  "relative aspect-square overflow-hidden rounded border " +
                  (i === 1 ? "border-accent ring-2 ring-accent/30" : "border-muted-200")
                }
              >
                <Portrait i={i} />
                <span
                  className={
                    "absolute right-1 top-1 text-sm " +
                    (i === 1 ? "text-accent" : "text-white/80")
                  }
                  aria-hidden
                >
                  ★
                </span>
              </div>
            ))}
          </div>
        </Frame>
      );

    case "deliver":
      return (
        <Frame title="Deliver">
          <div className="rounded-card border border-muted-200 p-3">
            <p className="text-sm font-semibold text-ink">
              Send galleries to 26 people?
            </p>
            <ul className="mt-2 space-y-1 text-xs text-muted-600">
              <li>24 ready to send</li>
              <li>1 skipped, no photos yet</li>
              <li>1 skipped, no email address</li>
            </ul>
            <div className="mt-3 inline-block rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-accent-fg">
              Send 24 galleries
            </div>
          </div>
          <div className="mt-3 rounded-card bg-muted-50 p-3">
            <p className="text-[11px] font-medium text-muted-600">
              What lands in their inbox
            </p>
            <p className="mt-1 text-xs text-ink">
              Your headshots from Acme HQ are ready.
            </p>
            <p className="text-[11px] text-muted-600">
              There are 6 photos waiting for you. You can download 3 of them.
            </p>
          </div>
        </Frame>
      );

    case "client":
      return (
        <Frame title="Client dashboard (no login needed)">
          <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              ["26", "Signed up"],
              ["24", "Photographed"],
              ["24", "Delivered"],
              ["2", "Didn't attend"],
            ].map(([v, l]) => (
              <div
                key={l}
                className="rounded-card border border-muted-200 p-2 text-center"
              >
                <p className="text-lg font-semibold text-ink">{v}</p>
                <p className="text-[10px] uppercase tracking-wider text-muted-600">
                  {l}
                </p>
              </div>
            ))}
          </div>
          <div className="rounded-card border border-muted-200 divide-y divide-muted-200">
            {PEOPLE.slice(0, 3).map((n, i) => (
              <div
                key={n}
                className="flex items-center justify-between px-3 py-2"
              >
                <span className="text-sm text-ink">{n}</span>
                <Pill tone={i === 2 ? "amber" : "green"}>
                  {i === 2 ? "Didn't attend" : "Delivered"}
                </Pill>
              </div>
            ))}
          </div>
        </Frame>
      );

    case "job":
    default:
      return null;
  }
}

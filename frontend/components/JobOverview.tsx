"use client";

import type { Job } from "@/lib/jobs";

// HSD-34: Job detail UI/UX boost. Three coordinated pieces:
//   1. <JobProgressStepper>  — 4-step horizontal stepper at the top of the
//      Job detail page (Setup → Shoot day → Delivery → Done) with the current
//      stage highlighted and a small countdown sub-label.
//   2. <JobStatTiles>        — row of 4 stat tiles replacing the tiny `(N)`
//      counts on section headers (Participants, Photos, Galleries, Downloads).
//   3. <ShootDayHero>        — prominent card pulling shoot date / location /
//      client name out of the metadata grid into a glanceable hero.
//
// All pieces are pure presentational — derive their inputs from data the
// page already has (job + counts of participants/files).

// ---------------------------------------------------------------------------
// Stage derivation
// ---------------------------------------------------------------------------

export type JobStage = "setup" | "shoot_day" | "delivery" | "done";

const STAGE_ORDER: JobStage[] = ["setup", "shoot_day", "delivery", "done"];

const STAGE_LABELS: Record<JobStage, string> = {
  setup: "Setup",
  shoot_day: "Shoot day",
  delivery: "Delivery",
  done: "Done",
};

/**
 * Pick the job's current stage from status + shoot date.
 *
 * Mapping rules:
 *   archived              → done   (all four checked, no current)
 *   delivered             → done   (current = Done)
 *   in_progress, past     → delivery (shoot happened, ready to deliver)
 *   in_progress, today/+  → shoot_day
 *   draft / open_for_signup → setup
 */
export function deriveStage(job: Job, todayIso?: string): JobStage {
  if (job.status === "archived" || job.status === "delivered") return "done";
  if (job.status === "in_progress") {
    const last = lastShootDay(job);
    if (!last) return "shoot_day";
    // Only once every day is behind us. Between day one and day two of a
    // two-day shoot the job is still on the shoot-day step.
    if (isPast(last, todayIso)) return "delivery";
    return "shoot_day";
  }
  // draft or open_for_signup
  return "setup";
}

type HasShootDays = Pick<Job, "shoot_date" | "extra_shoot_dates">;

/** Every shoot day, sorted. `shoot_date` alone is only the first. */
export function allShootDays(job: HasShootDays): string[] {
  return [job.shoot_date, ...(job.extra_shoot_dates ?? [])]
    .filter((d): d is string => !!d)
    .sort();
}

/** The next shoot day still to come, or the last one once all have passed. */
export function nextShootDay(job: HasShootDays, todayIso?: string): string | null {
  const days = allShootDays(job);
  const today = todayIso ?? new Date().toISOString().slice(0, 10);
  return days.find((d) => d >= today) ?? days[days.length - 1] ?? null;
}

function lastShootDay(job: HasShootDays): string | null {
  const days = allShootDays(job);
  return days[days.length - 1] ?? null;
}

/**
 * Friendly relative-date label like "today", "tomorrow", "in 3 days",
 * "yesterday", "3 days ago". Returns null if `iso` is null/undefined.
 *
 * Compares dates by the calendar day so "today" doesn't slide off at noon.
 */
export function relativeDayLabel(iso: string | null, todayIso?: string): string | null {
  if (!iso) return null;
  const target = parseDateOnly(iso);
  const today = todayIso ? parseDateOnly(todayIso) : startOfDay(new Date());
  if (!target || !today) return null;
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86_400_000);
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "tomorrow";
  if (diffDays === -1) return "yesterday";
  if (diffDays > 0) return `in ${diffDays} days`;
  return `${Math.abs(diffDays)} days ago`;
}

function isPast(iso: string, todayIso?: string): boolean {
  const target = parseDateOnly(iso);
  const today = todayIso ? parseDateOnly(todayIso) : startOfDay(new Date());
  if (!target || !today) return false;
  return target.getTime() < today.getTime();
}

function parseDateOnly(iso: string): Date | null {
  // Accept "YYYY-MM-DD" or full ISO; either way collapse to local midnight.
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

// ---------------------------------------------------------------------------
// 1. Progress stepper
// ---------------------------------------------------------------------------

export function JobProgressStepper({ job }: { job: Job }) {
  const current = deriveStage(job);
  const currentIdx = STAGE_ORDER.indexOf(current);
  // The day the stepper is talking about: the next one to come, so on a
  // two-day job the badge reads "in 6 days" rather than "yesterday".
  const dayLabel = relativeDayLabel(nextShootDay(job));
  // Past states (delivered, archived) flip every step green — the job is
  // wrapped up, there's no "current" step to highlight.
  const allComplete = job.status === "archived" || job.status === "delivered";

  return (
    <ol className="mt-6 flex w-full items-start gap-1 sm:gap-2" aria-label="Job progress">
      {STAGE_ORDER.map((stage, i) => {
        const isDone = allComplete || i < currentIdx;
        const isCurrent = !allComplete && i === currentIdx;
        const subLabel = isCurrent ? stepperSubLabel(stage, dayLabel) : null;
        return (
          <li key={stage} className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <StepDot done={isDone} current={isCurrent} index={i + 1} />
              {i < STAGE_ORDER.length - 1 ? (
                <div
                  className={
                    "h-px flex-1 " +
                    (isDone ? "bg-green-300" : "bg-muted-200")
                  }
                  aria-hidden
                />
              ) : null}
            </div>
            <div className="mt-1.5">
              <div
                className={
                  "text-xs font-medium " +
                  (isCurrent
                    ? "text-accent"
                    : isDone
                      ? "text-ink"
                      : "text-muted-400")
                }
              >
                {STAGE_LABELS[stage]}
              </div>
              {subLabel ? (
                <div className="text-[11px] text-muted-600">{subLabel}</div>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function stepperSubLabel(stage: JobStage, dayLabel: string | null): string | null {
  switch (stage) {
    case "setup":
      return dayLabel ? `shoot ${dayLabel}` : "shoot day not set";
    case "shoot_day":
      return dayLabel ?? null;
    case "delivery":
      return dayLabel ? `shot ${dayLabel}` : null;
    case "done":
      return null;
  }
}

function StepDot({
  done,
  current,
  index,
}: {
  done: boolean;
  current: boolean;
  index: number;
}) {
  if (done) {
    return (
      <span
        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-green-100 text-green-700"
        aria-hidden
      >
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="3 8 7 12 13 4" />
        </svg>
      </span>
    );
  }
  if (current) {
    return (
      <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-accent-fg text-xs font-semibold ring-4 ring-accent-muted">
        {index}
      </span>
    );
  }
  return (
    <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-muted-200 bg-paper text-xs font-medium text-muted-400">
      {index}
    </span>
  );
}

// ---------------------------------------------------------------------------
// 2. Stat tiles
// ---------------------------------------------------------------------------

export type JobStats = {
  participantsTotal: number | null;
  participantsShot: number | null;
  photosUploaded: number | null;
  /** Galleries "ready" = participants with at least 1 photo. True delivered
   *  count comes when F5c email delivery lands. */
  galleriesReady: number | null;
  /** Round-2 polish: total unique downloads consumed across the job. Sum of
   *  participants[].downloads_used. Null while loading. */
  downloadsUsed: number | null;
};

export function JobStatTiles({ job, stats }: { job: Job; stats: JobStats }) {
  const participantsValue =
    stats.participantsTotal == null
      ? "—"
      : `${stats.participantsShot ?? 0} / ${stats.participantsTotal}`;
  const photosValue = stats.photosUploaded == null ? "—" : `${stats.photosUploaded}`;
  const galleriesValue =
    stats.participantsTotal == null
      ? "—"
      : `${stats.galleriesReady ?? 0} / ${stats.participantsTotal}`;

  // Downloads tile shows real consumption (X / Y) or "Off" when the cap is 0.
  // Cap editing lives in the metadata row's DownloadCapDetail, not here —
  // single source of truth.
  const downloadsValue = (() => {
    if (job.download_cap === 0) return "Off";
    if (stats.downloadsUsed == null || stats.participantsTotal == null) return "—";
    return `${stats.downloadsUsed} / ${stats.participantsTotal * job.download_cap}`;
  })();
  const downloadsHint =
    job.download_cap === 0
      ? "Downloads disabled."
      : `Cap: ${job.download_cap} per participant.`;

  return (
    <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
      <Tile label="Participants shot" value={participantsValue} />
      <Tile label="Photos uploaded" value={photosValue} />
      <Tile
        label="Galleries ready"
        value={galleriesValue}
        hint="Updates to delivery count when email delivery ships."
      />
      <Tile label="Downloads" value={downloadsValue} hint={downloadsHint} />
    </div>
  );
}

function Tile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-card bg-muted-50 px-4 py-3">
      <div className="text-[11px] font-medium uppercase tracking-wider text-muted-600">
        {label}
      </div>
      <div className="mt-1 font-display text-2xl font-semibold tracking-tight text-ink">
        {value}
      </div>
      {hint ? (
        <div className="mt-0.5 text-[11px] text-muted-400">{hint}</div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 3. Shoot-day hero card
// ---------------------------------------------------------------------------

export function ShootDayHero({ job }: { job: Job }) {
  // Every day the job runs on. shoot_date alone is only the first, which
  // on a two-day job whose first day has passed produced "24 days ago" in
  // the corner while the second day was still two weeks out.
  const days = allShootDays(job);
  const todayIso = new Date().toISOString().slice(0, 10);
  // Lead with the next day still to come. Only once every day is behind
  // us does the last one become the headline, so a finished job still
  // reads as "24 days ago" rather than as if it never happened.
  const headline = nextShootDay(job);
  const dayLabel = relativeDayLabel(headline);
  const dateLabel = headline ? formatShootDate(headline) : "Shoot day not set";
  const otherDays = days.filter((d) => d !== headline);

  return (
    <div className="rounded-card bg-accent-muted p-5">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-accent">
        <CalendarIcon />
        {days.length > 1 ? `Shoot days (${days.length})` : "Shoot day"}
        {dayLabel ? (
          <span className="rounded-md bg-paper px-1.5 py-0.5 text-[11px] font-medium text-accent">
            {dayLabel}
          </span>
        ) : null}
      </div>
      <div className="mt-2 font-display text-2xl font-semibold tracking-tight text-ink">
        {dateLabel}
      </div>
      {otherDays.length > 0 ? (
        <p className="mt-1 text-sm text-muted-600">
          {otherDays.map((d) => (
            <span key={d} className="mr-3">
              {formatShootDate(d)}
              {d < todayIso ? <span className="text-muted-400"> · done</span> : null}
            </span>
          ))}
        </p>
      ) : null}
      <dl className="mt-3 space-y-1.5 text-sm text-ink">
        {job.location ? (
          <div className="flex items-start gap-2">
            <PinIcon />
            <span>{job.location}</span>
          </div>
        ) : null}
        {job.client_name ? (
          <div className="flex items-start gap-2">
            <BuildingIcon />
            <span>{job.client_name}</span>
          </div>
        ) : null}
      </dl>
    </div>
  );
}

function formatShootDate(iso: string): string {
  const d = (function () {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  })();
  if (!d) return iso;
  // e.g. "Sat 23 May 2026"
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="2" y="3" width="12" height="11" rx="1.5" />
      <line x1="2" y1="6" x2="14" y2="6" />
      <line x1="5" y1="2" x2="5" y2="4" />
      <line x1="11" y1="2" x2="11" y2="4" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0 text-muted-600 mt-0.5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M8 1.5c-2.5 0-4.5 2-4.5 4.5 0 3.5 4.5 8.5 4.5 8.5s4.5-5 4.5-8.5c0-2.5-2-4.5-4.5-4.5z" />
      <circle cx="8" cy="6" r="1.5" />
    </svg>
  );
}

function BuildingIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0 text-muted-600 mt-0.5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="2" width="10" height="13" rx="1" />
      <line x1="6" y1="5" x2="7" y2="5" />
      <line x1="9" y1="5" x2="10" y2="5" />
      <line x1="6" y1="8" x2="7" y2="8" />
      <line x1="9" y1="8" x2="10" y2="8" />
      <line x1="6" y1="11" x2="10" y2="11" />
    </svg>
  );
}

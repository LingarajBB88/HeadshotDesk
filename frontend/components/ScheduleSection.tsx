"use client";

import { useEffect, useState } from "react";

import { CollapsibleSection } from "./CollapsibleSection";
import { ShootDaysEditor } from "./ShootDaysEditor";
import { ApiError } from "@/lib/api";
import {
  getSchedule,
  updateJob,
  type Job,
  type ScheduleEntry,
  type SlotBreak,
  type DayConfig,
  type TimeSlotConfig,
} from "@/lib/jobs";

// HSD-55 — Schedule section on the Job detail page, shown only for
// time-slot jobs. Draft-and-save model: settings AND per-slot edits
// (remove, restore, add custom-length slots) all edit a local draft; the
// grid previews the draft instantly, booked slots that would fall off are
// highlighted, and one Save at the bottom commits everything. Booking
// integrity is enforced server-side: only bookings that no longer fit are
// cancelled, and only after an explicit confirm.

const DEFAULT_CONFIG: TimeSlotConfig = {
  start: "09:00",
  end: "17:00",
  slot_minutes: 10,
  buffer_minutes: 0,
  breaks: [],
  blocked: [],
  extra: [],
};

/** Normalize optional fields so dirty-comparison and edits are stable. */
function canonical(cfg: TimeSlotConfig): TimeSlotConfig {
  return { ...cfg, blocked: cfg.blocked ?? [], extra: cfg.extra ?? [] };
}

const toMins = (hhmm: string): number => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
const toHHMM = (mins: number): string =>
  `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;

type DraftSlot = { start: string; end: string; isExtra: boolean };

/** The settings in force for a given day: its own override when it has
 *  one, otherwise the job's base settings. */
export function dayConfigFor(cfg: TimeSlotConfig, isoDay?: string): DayConfig {
  const ov = isoDay ? cfg.day_overrides?.[isoDay] : undefined;
  return {
    start: ov?.start ?? cfg.start,
    end: ov?.end ?? cfg.end,
    slot_minutes: ov?.slot_minutes ?? cfg.slot_minutes,
    buffer_minutes: ov?.buffer_minutes ?? cfg.buffer_minutes,
    breaks: ov?.breaks ?? cfg.breaks,
  };
}

/** Client-side mirror of the backend's slot generation, for live preview.
 *  `isoDay` selects that day's settings and scopes date-qualified removals
 *  and extras ("2026-09-16@14:20"). */
function draftSlots(cfg: TimeSlotConfig, isoDay?: string): DraftSlot[] {
  const day = dayConfigFor(cfg, isoDay);
  if (!day.start || !day.end) return [];
  const out: DraftSlot[] = [];
  const breaks = day.breaks
    .filter((b) => b.start && b.end)
    .map((b) => [toMins(b.start), toMins(b.end)] as const);
  const blocked = new Set(
    (cfg.blocked ?? [])
      .filter((b) => !b.includes("@") || b.split("@")[0] === isoDay)
      .map((b) => (b.includes("@") ? b.split("@")[1] : b)),
  );
  const step = day.slot_minutes + day.buffer_minutes;
  if (step <= 0) return [];
  let cur = toMins(day.start);
  const end = toMins(day.end);
  while (cur + day.slot_minutes <= end) {
    const s = cur;
    const e = cur + day.slot_minutes;
    const hit = breaks.find(([bs, be]) => s < be && e > bs);
    if (hit) {
      cur = hit[1];
      continue;
    }
    if (!blocked.has(toHHMM(s))) {
      out.push({ start: toHHMM(s), end: toHHMM(e), isExtra: false });
    }
    cur += step;
  }
  for (const ex of cfg.extra ?? []) {
    if (ex.start.includes("@") && ex.start.split("@")[0] !== isoDay) continue;
    const rawStart = ex.start.includes("@") ? ex.start.split("@")[1] : ex.start;
    const s = toMins(rawStart);
    const e = s + ex.minutes;
    const overlaps = out.some(
      (o) => s < toMins(o.end) && e > toMins(o.start),
    );
    if (!overlaps) out.push({ start: toHHMM(s), end: toHHMM(e), isExtra: true });
  }
  out.sort((a, b) => toMins(a.start) - toMins(b.start));
  return out;
}

function fmtTime(iso: string): string {
  // Bookings are stored as wall-clock on the shoot date; show HH:MM as-is.
  return iso.slice(11, 16);
}

// Native type="time" inputs are fiddly (tiny clock widget, per-browser
// quirks). A dropdown of 15-minute steps is one obvious click; off-grid
// values (e.g. 18:40 after adding slots) are kept as an extra option so
// nothing silently shifts.
const QUARTER_HOURS: string[] = Array.from({ length: 96 }, (_, i) =>
  toHHMM(i * 15),
);

function TimeSelect({
  value,
  onChange,
  ariaLabel,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  ariaLabel: string;
  className?: string;
}) {
  const options =
    value && !QUARTER_HOURS.includes(value)
      ? [...QUARTER_HOURS, value].sort((a, b) => toMins(a) - toMins(b))
      : QUARTER_HOURS;
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={ariaLabel}
      className={
        className ??
        "rounded-md border border-muted-200 bg-paper px-2 py-1.5 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
      }
    >
      {value === "" ? <option value="">--:--</option> : null}
      {options.map((t) => (
        <option key={t} value={t}>
          {t}
        </option>
      ))}
    </select>
  );
}

export function ScheduleSection({
  job,
  refreshKey = 0,
  onJobChanged,
}: {
  job: Job;
  refreshKey?: number;
  onJobChanged: (updated: Job) => void;
}) {
  const [config, setConfig] = useState<TimeSlotConfig>(
    canonical(job.time_slot_config ?? DEFAULT_CONFIG),
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [schedule, setSchedule] = useState<ScheduleEntry[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const entries = await getSchedule(job.id);
        if (!cancelled) setSchedule(entries);
      } catch {
        if (!cancelled) setSchedule([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [job.id, job.time_slot_config, refreshKey]);

  const savedConfig = canonical(job.time_slot_config ?? DEFAULT_CONFIG);
  const configured = !!job.time_slot_config;
  const dirty = JSON.stringify(config) !== JSON.stringify(savedConfig);

  // --- Draft preview ------------------------------------------------------
  // HSD-71: a shoot can run over several days. The same daily pattern
  // applies to each, so the preview is one grid per day and every lookup
  // is keyed by date + time (a 09:00 booking on Wednesday must not light
  // up Tuesday's 09:00 chip).
  const days: string[] = (() => {
    const list = [job.shoot_date, ...(job.extra_shoot_dates ?? [])].filter(
      Boolean,
    ) as string[];
    return [...new Set(list)].sort();
  })();
  const multiDay = days.length > 1;
  const previewByDay = days.map((d) => ({ day: d, slots: draftSlots(config, d) }));
  const preview = previewByDay.flatMap((p) => p.slots);

  // Removals that actually land on the draft's grid. Stale ones (from a
  // previous cadence) are hidden here and pruned by the server on save.
  const relevantBlocked = (() => {
    const candidates = new Set<string>();
    for (const d of days) {
      for (const s of draftSlots({ ...config, blocked: [] }, d)) {
        if (s.isExtra) continue;
        candidates.add(s.start);
        candidates.add(`${d}@${s.start}`);
      }
    }
    return (config.blocked ?? []).filter((t) => candidates.has(t));
  })();

  const previewStarts = new Set(
    previewByDay.flatMap((p) =>
      p.slots.map((s) => `${p.day}T${s.start}-${s.end}`),
    ),
  );
  const bookedByKey = new Map(
    (schedule ?? []).map((e) => [
      `${e.slot_start.slice(0, 10)}T${fmtTime(e.slot_start)}`,
      e,
    ]),
  );
  // Bookings that would fall off the drafted grid (time, length, or the
  // whole day removed).
  const affected = (schedule ?? []).filter(
    (e) =>
      !previewStarts.has(
        `${e.slot_start.slice(0, 10)}T${fmtTime(e.slot_start)}-${fmtTime(e.slot_end)}`,
      ),
  );
  const fittingBooked = (schedule?.length ?? 0) - affected.length;

  // --- Draft edits --------------------------------------------------------
  function removeSlot(slot: DraftSlot, isoDay: string) {
    // On a multi-day shoot, removing 12:10 on Tuesday must not remove
    // Wednesday's 12:10, so the entry is date-qualified. Single-day jobs
    // keep the plain "HH:MM" form.
    const key = multiDay ? `${isoDay}@${slot.start}` : slot.start;
    setConfig((c) =>
      slot.isExtra
        ? {
            ...c,
            extra: (c.extra ?? []).filter(
              (x) => x.start !== slot.start && x.start !== key,
            ),
          }
        : { ...c, blocked: [...(c.blocked ?? []), key].sort() },
    );
  }

  function restoreSlot(hhmm: string) {
    setConfig((c) => ({
      ...c,
      blocked: (c.blocked ?? []).filter((t) => t !== hhmm),
    }));
  }

  const [extraMinutes, setExtraMinutes] = useState<string>("");
  function addExtraSlot(isoDay: string) {
    const minutes = Number(extraMinutes) || config.slot_minutes;
    if (minutes < 1 || minutes > 120) return;
    setConfig((c) => {
      const current = draftSlots(c, isoDay);
      const lastEnd =
        current.length > 0
          ? Math.max(...current.map((s) => toMins(s.end)))
          : toMins(c.end);
      const start = lastEnd + (current.length > 0 ? c.buffer_minutes : 0);
      if (start + minutes > 24 * 60) return c; // day is full
      return {
        ...c,
        extra: [...(c.extra ?? []), { start: toHHMM(start), minutes }],
      };
    });
  }

  // Cadence changes (start, slot length, buffer, breaks) shift where slots
  // fall, so per-slot removals from the old grid no longer mean anything.
  // Clear them along with the change. Day-end changes keep removals: the
  // surviving slots are the same ones. The add-slot minutes override also
  // resets so it follows the new slot length instead of a stale value.
  function setCadence(patch: Partial<TimeSlotConfig>) {
    setConfig((c) => ({ ...c, ...patch, blocked: [] }));
    setExtraMinutes("");
  }

  // HSD-71: edit one day's hours. Writes an override seeded from whatever
  // that day currently resolves to, so a fresh day starts as a copy of the
  // base settings and then diverges freely.
  function setDayConfig(isoDay: string, patch: Partial<DayConfig>) {
    setConfig((c) => {
      const current = dayConfigFor(c, isoDay);
      return {
        ...c,
        // Removals belong to the old cadence for this day only.
        blocked: (c.blocked ?? []).filter(
          (b) => !b.startsWith(`${isoDay}@`),
        ),
        day_overrides: {
          ...(c.day_overrides ?? {}),
          [isoDay]: { ...current, ...patch },
        },
      };
    });
  }

  function setBreak(i: number, patch: Partial<SlotBreak>) {
    setConfig((c) => ({
      ...c,
      breaks: c.breaks.map((b, j) => (j === i ? { ...b, ...patch } : b)),
      blocked: [],
    }));
  }

  // Live validation: catch impossible configs as they're typed, before Save.
  const configProblem = (() => {
    if (!config.start || !config.end) return "Set a day start and end.";
    if (toMins(config.end) <= toMins(config.start)) {
      return "The day must end after it starts.";
    }
    const span = toMins(config.end) - toMins(config.start);
    if (config.slot_minutes + config.buffer_minutes > span) {
      return "One slot plus buffer is longer than the whole day.";
    }
    for (const b of config.breaks) {
      if (!b.start || !b.end) return "Fill in both times for every break.";
      if (toMins(b.end) <= toMins(b.start)) {
        return "Each break must end after it starts.";
      }
      if (toMins(b.start) < toMins(config.start) || toMins(b.end) > toMins(config.end)) {
        return "Breaks must fall inside the day.";
      }
    }
    // Overlapping (or duplicate) breaks: confusing on the grid and always
    // a mistake — one longer break says the same thing better.
    const sorted = [...config.breaks]
      .filter((b) => b.start && b.end)
      .sort((x, y) => toMins(x.start) - toMins(y.start));
    for (let i = 1; i < sorted.length; i++) {
      if (toMins(sorted[i].start) < toMins(sorted[i - 1].end)) {
        return "Breaks overlap each other. Merge them into one, or adjust the times.";
      }
    }
    return null;
  })();

  // --- Save ---------------------------------------------------------------
  async function saveConfig() {
    // Two-step save: try without cancelling anything. The backend keeps
    // every booking that still fits and only 409s when some would be
    // cancelled — its message carries the authoritative count. Confirm,
    // then retry with the cancel flag.
    setSaving(true);
    setSaveError(null);
    setSaved(null);

    async function doSave(clear: boolean) {
      const updated = await updateJob(job.id, {
        time_slot_config: config,
        ...(clear ? { clear_slot_bookings: true } : {}),
      });
      onJobChanged(updated);
      // The server prunes stale removals on save; adopt its version so the
      // draft matches what was actually stored.
      setConfig(canonical(updated.time_slot_config ?? DEFAULT_CONFIG));
      // Confirmation carries the numbers, because "Saved." next to an
      // unchanged-looking grid doesn't tell you the shoot day is actually
      // bookable now. Stays up long enough to read.
      const liveCfg = canonical(updated.time_slot_config ?? DEFAULT_CONFIG);
      const liveDays = [
        updated.shoot_date,
        ...(updated.extra_shoot_dates ?? []),
      ].filter(Boolean) as string[];
      const liveSlots = [...new Set(liveDays)].reduce(
        (sum, d) => sum + draftSlots(liveCfg, d).length,
        0,
      );
      setSaved(
        `Schedule saved. ${liveSlots} slot${liveSlots === 1 ? "" : "s"} are live on the signup page` +
          (liveDays.length > 1 ? ` across ${liveDays.length} days.` : "."),
      );
      window.setTimeout(() => setSaved(null), 6000);
      try {
        setSchedule(await getSchedule(job.id));
      } catch {
        setSchedule([]);
      }
    }

    try {
      await doSave(false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        const ok = window.confirm(
          `${err.message} Those participants stay signed up but lose ` +
            "their time and will need a new one. Continue?",
        );
        if (ok) {
          try {
            await doSave(true);
          } catch {
            setSaveError("Couldn't save. Try again?");
          }
        }
      } else {
        setSaveError(
          err instanceof ApiError && err.status === 422
            ? "Check the times: the day must end after it starts, breaks must fall inside it, and slots must fit."
            : err instanceof ApiError && err.status === 401
              ? "Your session expired. Log in again and retry."
              : err instanceof ApiError
                ? `Couldn't save: ${err.message}`
                : "Couldn't save. Try again?",
        );
      }
    } finally {
      setSaving(false);
    }
  }

  // Slot calculator: photographers usually get "N people, 9 to 5" from the
  // client, not a slot length. Suggest the minutes per person that fits.
  const [participantCount, setParticipantCount] = useState<string>("");
  const suggestion = (() => {
    const n = Number(participantCount);
    if (!Number.isFinite(n) || n < 1) return null;
    if (!config.start || !config.end) return null;
    const breakTotal = config.breaks.reduce(
      (sum, b) =>
        b.start && b.end
          ? sum + Math.max(toMins(b.end) - toMins(b.start), 0)
          : sum,
      0,
    );
    const available = toMins(config.end) - toMins(config.start) - breakTotal;
    if (available <= 0) return null;
    // Each person consumes slot + buffer; the last buffer isn't needed but
    // keeping it in the division leaves healthy slack for overruns.
    const perPerson = Math.floor(available / n) - config.buffer_minutes;
    const clamped = Math.min(Math.max(perPerson, 1), 120);
    if (perPerson < 1) return { minutes: 1, tight: true };
    return { minutes: clamped, tight: false };
  })();

  return (
    <CollapsibleSection
      title="Schedule"
      count={schedule?.length}
      description="Set up the slot grid participants book into, and see who booked what."
      defaultOpen={!configured}
    >
      {/* HSD-71: which days this shoot runs on. Sits above the slot
          settings because the pattern below applies to each of them. */}
      <div className="mb-4">
        <ShootDaysEditor job={job} onChanged={onJobChanged} />
      </div>

      {/* --- Slot settings --------------------------------------------- */}
      <div className="rounded-card border border-muted-200 bg-paper p-5">
        <h3 className="text-sm font-semibold text-ink">
          {multiDay ? "Default slot settings" : "Slot settings"}
        </h3>
        {multiDay ? (
          <p className="mt-0.5 text-xs text-muted-600">
            Used by any day that hasn&apos;t been given its own hours below.
          </p>
        ) : null}
        {!configured ? (
          <p className="mt-1 text-xs text-amber-700 bg-amber-50 rounded-md px-2 py-1 inline-block">
            No slots yet. Adjust the preview below and hit Create slots so
            participants can book.
          </p>
        ) : null}

        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
          <label className="block">
            <span className="block text-xs font-medium text-muted-600">
              Day starts
            </span>
            <TimeSelect
              value={config.start}
              onChange={(v) => setCadence({ start: v })}
              ariaLabel="Day starts"
              className="mt-1 w-full rounded-md border border-muted-200 bg-paper px-2 py-1.5 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
            />
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-muted-600">
              Day ends
            </span>
            <TimeSelect
              value={config.end}
              onChange={(v) => setConfig({ ...config, end: v })}
              ariaLabel="Day ends"
              className="mt-1 w-full rounded-md border border-muted-200 bg-paper px-2 py-1.5 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
            />
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-muted-600">
              Minutes per person
            </span>
            <input
              type="number"
              min={1}
              max={120}
              value={config.slot_minutes}
              onChange={(e) =>
                setCadence({ slot_minutes: Number(e.target.value) })
              }
              className="mt-1 w-full rounded-md border border-muted-200 bg-paper px-2 py-1.5 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
            />
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-muted-600">
              Buffer between slots
            </span>
            <input
              type="number"
              min={0}
              max={60}
              value={config.buffer_minutes}
              onChange={(e) =>
                setCadence({ buffer_minutes: Number(e.target.value) })
              }
              className="mt-1 w-full rounded-md border border-muted-200 bg-paper px-2 py-1.5 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
            />
          </label>
        </div>

        {/* Slot calculator: enter a headcount, get the slot length that
            fits everyone in the day window. */}
        <div className="mt-4 rounded-card bg-muted-50 p-3">
          <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
            <label className="block">
              <span className="block text-xs font-medium text-muted-600">
                Know the headcount? Let us do the math
              </span>
              <input
                type="number"
                min={1}
                max={500}
                value={participantCount}
                onChange={(e) => setParticipantCount(e.target.value)}
                placeholder="Number of participants"
                className="mt-1 w-48 rounded-md border border-muted-200 bg-paper px-2 py-1.5 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
              />
            </label>
            {suggestion ? (
              <div className="flex items-center gap-2 pb-0.5">
                <span className="text-sm text-muted-600">
                  {suggestion.tight ? (
                    <>
                      Tight fit: even at 1 minute each, {participantCount}{" "}
                      people don&apos;t fit this window. Extend the day or
                      trim breaks.
                    </>
                  ) : (
                    <>
                      ≈{" "}
                      <strong className="text-ink">
                        {suggestion.minutes} minutes
                      </strong>{" "}
                      per person fits {participantCount} people in this window.
                    </>
                  )}
                </span>
                {!suggestion.tight ? (
                  <button
                    type="button"
                    onClick={() => setCadence({ slot_minutes: suggestion.minutes })}
                    className="text-xs font-medium text-accent hover:underline"
                  >
                    Use it
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        {/* Breaks */}
        <div className="mt-4">
          <span className="block text-xs font-medium text-muted-600">
            Breaks (lunch, setup changes)
          </span>
          {config.breaks.map((b, i) => (
            <div key={i} className="mt-2 flex items-center gap-2">
              <TimeSelect
                value={b.start}
                onChange={(v) => setBreak(i, { start: v })}
                ariaLabel={`Break ${i + 1} starts`}
              />
              <span className="text-xs text-muted-600">to</span>
              <TimeSelect
                value={b.end}
                onChange={(v) => setBreak(i, { end: v })}
                ariaLabel={`Break ${i + 1} ends`}
              />
              <button
                type="button"
                onClick={() =>
                  setConfig((c) => ({
                    ...c,
                    breaks: c.breaks.filter((_, j) => j !== i),
                    blocked: [],
                  }))
                }
                className="text-xs text-muted-600 hover:text-red-600 transition"
              >
                Remove
              </button>
            </div>
          ))}
          {config.breaks.length < 10 ? (
            <button
              type="button"
              onClick={() =>
                setConfig((c) => {
                  // Default the new break after the latest existing one, so
                  // clicking Add repeatedly never creates duplicates.
                  const latestEnd = c.breaks
                    .filter((b) => b.end)
                    .reduce((max, b) => Math.max(max, toMins(b.end)), 0);
                  const start = latestEnd > 0 ? latestEnd + 60 : 12 * 60;
                  return {
                    ...c,
                    breaks: [
                      ...c.breaks,
                      {
                        start: toHHMM(Math.min(start, 23 * 60)),
                        end: toHHMM(Math.min(start + 30, 23 * 60 + 30)),
                      },
                    ],
                    blocked: [],
                  };
                })
              }
              className="mt-2 text-xs font-medium text-accent hover:underline"
            >
              + Add a break
            </button>
          ) : null}
        </div>
      </div>

      {/* --- Slot grid (live preview of the draft) ---------------------- */}
      <div className="mt-4">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-sm font-semibold text-ink">
            Slots{dirty ? " (preview)" : ""}
          </h3>
          {preview.length > 0 ? (
            <span className="text-xs text-muted-600">
              {fittingBooked} of {preview.length} slots booked
            </span>
          ) : null}
        </div>

        {configProblem ? (
          <p className="mt-2 text-sm text-red-600" role="alert">
            {configProblem}
          </p>
        ) : preview.length === 0 ? (
          <p className="mt-2 text-sm text-muted-600">
            No slots fit these settings yet.
          </p>
        ) : (
          previewByDay.map(({ day, slots: daySlots }) => (
          <div key={day} className="mt-4">
            {/* One grid per shoot day. Single-day jobs render exactly as
                before (no heading), so nothing changes for them. */}
            {multiDay ? (
              <div className="mb-2 rounded-card border border-muted-200 bg-muted-50 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-ink">
                    {new Date(day).toLocaleDateString(undefined, {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                    })}
                    <span className="ml-2 text-xs font-normal text-muted-600">
                      {daySlots.length} slot{daySlots.length === 1 ? "" : "s"}
                    </span>
                  </p>
                </div>
                {/* Each day sets its own hours — day two is often a
                    half-day, not a copy of day one. */}
                <div className="mt-2 flex flex-wrap items-end gap-3">
                  <label className="block">
                    <span className="block text-[11px] font-medium text-muted-600">
                      Starts
                    </span>
                    <TimeSelect
                      value={dayConfigFor(config, day).start}
                      onChange={(v) => setDayConfig(day, { start: v })}
                      ariaLabel={`Day ${day} starts`}
                    />
                  </label>
                  <label className="block">
                    <span className="block text-[11px] font-medium text-muted-600">
                      Ends
                    </span>
                    <TimeSelect
                      value={dayConfigFor(config, day).end}
                      onChange={(v) => setDayConfig(day, { end: v })}
                      ariaLabel={`Day ${day} ends`}
                    />
                  </label>
                  <label className="block">
                    <span className="block text-[11px] font-medium text-muted-600">
                      Minutes each
                    </span>
                    <input
                      type="number"
                      min={1}
                      max={120}
                      value={dayConfigFor(config, day).slot_minutes}
                      onChange={(e) =>
                        setDayConfig(day, {
                          slot_minutes: Number(e.target.value),
                        })
                      }
                      className="w-20 rounded-md border border-muted-200 bg-paper px-2 py-1.5 text-sm outline-none focus:border-accent"
                    />
                  </label>
                  <label className="block">
                    <span className="block text-[11px] font-medium text-muted-600">
                      Buffer
                    </span>
                    <input
                      type="number"
                      min={0}
                      max={60}
                      value={dayConfigFor(config, day).buffer_minutes}
                      onChange={(e) =>
                        setDayConfig(day, {
                          buffer_minutes: Number(e.target.value),
                        })
                      }
                      className="w-20 rounded-md border border-muted-200 bg-paper px-2 py-1.5 text-sm outline-none focus:border-accent"
                    />
                  </label>
                </div>
              </div>
            ) : null}
          <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-1.5">
            {/* Breaks render inline as amber chips so the day reads as one
                continuous timeline: slots, lunch, slots. Deduped by time
                window so accidental duplicates never double-render. */}
            {config.breaks
              .filter(
                (b, i, arr) =>
                  b.start &&
                  b.end &&
                  toMins(b.end) > toMins(b.start) &&
                  toMins(b.start) >= toMins(config.start) &&
                  toMins(b.start) < toMins(config.end) &&
                  arr.findIndex(
                    (o) => o.start === b.start && o.end === b.end,
                  ) === i,
              )
              .map((b) => (
                <div
                  key={`break-${b.start}-${b.end}`}
                  title={`${b.start}–${b.end} · break`}
                  style={{
                    order: toMins(b.start),
                  }}
                  className="rounded-md border border-amber-200 bg-amber-50 px-1.5 py-1 min-w-0"
                >
                  <span className="block font-mono text-[11px] leading-tight text-amber-700">
                    {b.start} ({toMins(b.end) - toMins(b.start)}m)
                  </span>
                  <span className="block text-[11px] leading-tight text-amber-700">
                    break
                  </span>
                </div>
              ))}
            {daySlots.map((s) => {
              const entry = bookedByKey.get(`${day}T${s.start}`);
              // A booking only counts as "fitting" if the length matches
              // too; otherwise it's shown in the cancelled strip below.
              const fits =
                entry && fmtTime(entry.slot_end) === s.end ? entry : undefined;
              return (
                <div
                  key={s.start}
                  title={
                    fits
                      ? `${s.start}–${s.end} · ${fits.participant_name}${fits.shot ? " · shot" : ""}`
                      : `${s.start}–${s.end} · open${s.isExtra ? " · custom length" : ""}`
                  }
                  style={{ order: toMins(s.start) }}
                  className={
                    "group relative rounded-md border px-1.5 py-1 min-w-0 " +
                    (fits
                      ? fits.shot
                        ? "border-green-200 bg-green-50"
                        : "border-accent/40 bg-accent-muted"
                      : s.isExtra
                        ? "border-dashed border-muted-200 bg-paper"
                        : "border-muted-200 bg-paper")
                  }
                >
                  <span
                    className={
                      "block font-mono text-[11px] leading-tight " +
                      (fits ? "text-ink" : "text-muted-400")
                    }
                  >
                    {s.start}
                    {s.isExtra ? ` (${toMins(s.end) - toMins(s.start)}m)` : ""}
                  </span>
                  <span
                    className={
                      "block text-[11px] leading-tight truncate " +
                      (fits ? "text-ink font-medium" : "text-muted-400")
                    }
                  >
                    {fits ? fits.participant_name : "open"}
                  </span>
                  {/* Remove: open slots only. Booked ones need their
                      booking moved/cleared first (Participants table). */}
                  {!fits ? (
                    <button
                      type="button"
                      onClick={() => removeSlot(s, day)}
                      aria-label={`Remove the ${s.start} slot`}
                      title="Remove this slot"
                      className="absolute top-0.5 right-1 hidden group-hover:block text-muted-400 hover:text-red-600 text-xs leading-none"
                    >
                      ×
                    </button>
                  ) : null}
                </div>
              );
            })}
            {/* Add a slot after the last one — custom length allowed. */}
            <div
              style={{ order: 100000 }}
              className="rounded-md border border-dashed border-accent/50 bg-accent-muted/40 px-1.5 py-1 min-w-0"
            >
              <button
                type="button"
                onClick={() => addExtraSlot(day)}
                title="Add a slot after the last one"
                className="block w-full text-left text-[11px] font-medium leading-tight text-accent hover:underline"
              >
                + Add slot
              </button>
              <span className="flex items-center gap-1 text-[11px] leading-tight text-muted-600">
                <input
                  type="number"
                  min={1}
                  max={120}
                  value={
                    extraMinutes === ""
                      ? String(config.slot_minutes)
                      : extraMinutes
                  }
                  onChange={(e) => setExtraMinutes(e.target.value)}
                  aria-label="Minutes for the added slot"
                  title="Length of the added slot in minutes"
                  className="w-9 bg-transparent outline-none placeholder:text-muted-400"
                />
                minutes
              </span>
            </div>
          </div>
          </div>
          ))
        )}

        {/* Removed slots: restore with one click (applies on Save). */}
        {relevantBlocked.length > 0 ? (
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-600">
            <span>Removed:</span>
            {relevantBlocked.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => restoreSlot(t)}
                title="Restore this slot"
                className="rounded-md border border-dashed border-muted-200 px-1.5 py-0.5 font-mono line-through hover:no-underline hover:border-accent hover:text-accent transition"
              >
                {t}
              </button>
            ))}
            <span className="text-muted-400">(click to restore)</span>
          </div>
        ) : null}

        {/* Bookings that would be cancelled by this draft. */}
        {!configProblem && affected.length > 0 ? (
          <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            <span className="font-medium">
              {affected.length === 1
                ? "1 booking doesn't fit this schedule"
                : `${affected.length} bookings don't fit this schedule`}
            </span>{" "}
            and will be cancelled on save:{" "}
            {affected
              .map((e) => `${e.participant_name} (${fmtTime(e.slot_start)})`)
              .join(", ")}
            . They stay signed up but will need a new time.
          </div>
        ) : null}

        {saveError ? (
          <p className="mt-3 text-xs text-red-600" role="alert">
            {saveError}
          </p>
        ) : null}

        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={saveConfig}
            disabled={saving || !!configProblem || (configured && !dirty)}
            className="btn-primary text-sm disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {saving
              ? "Saving…"
              : configured
                ? "Save schedule"
                : "Create slots"}
          </button>
          {configured && dirty ? (
            <button
              type="button"
              onClick={() => {
                setConfig(savedConfig);
                setSaveError(null);
              }}
              className="text-sm font-medium text-muted-600 hover:text-ink transition"
            >
              Reset
            </button>
          ) : null}
        </div>
        {saved ? (
          <div
            role="status"
            className="mt-3 flex items-start gap-2 rounded-card border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800"
          >
            <span aria-hidden className="leading-5">
              ✓
            </span>
            <span>{saved}</span>
          </div>
        ) : null}
      </div>
    </CollapsibleSection>
  );
}

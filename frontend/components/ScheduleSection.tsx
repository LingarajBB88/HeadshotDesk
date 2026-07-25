"use client";

import { useEffect, useState } from "react";

import { CollapsibleSection } from "./CollapsibleSection";
import { ApiError } from "@/lib/api";
import {
  getSchedule,
  updateJob,
  type Job,
  type ScheduleEntry,
  type SlotBreak,
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

/** Client-side mirror of the backend's slot generation, for live preview. */
function draftSlots(cfg: TimeSlotConfig): DraftSlot[] {
  if (!cfg.start || !cfg.end) return [];
  const out: DraftSlot[] = [];
  const breaks = cfg.breaks
    .filter((b) => b.start && b.end)
    .map((b) => [toMins(b.start), toMins(b.end)] as const);
  const blocked = new Set(cfg.blocked ?? []);
  const step = cfg.slot_minutes + cfg.buffer_minutes;
  if (step <= 0) return [];
  let cur = toMins(cfg.start);
  const end = toMins(cfg.end);
  while (cur + cfg.slot_minutes <= end) {
    const s = cur;
    const e = cur + cfg.slot_minutes;
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
    const s = toMins(ex.start);
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
  const [saved, setSaved] = useState(false);
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
  const preview = draftSlots(config);
  // Removals that actually land on the draft's grid. Stale ones (from a
  // previous cadence) are hidden here and pruned by the server on save.
  const relevantBlocked = (() => {
    const candidates = new Set(
      draftSlots({ ...config, blocked: [] })
        .filter((s) => !s.isExtra)
        .map((s) => s.start),
    );
    return (config.blocked ?? []).filter((t) => candidates.has(t));
  })();
  const previewStarts = new Set(preview.map((s) => `${s.start}-${s.end}`));
  const bookedByTime = new Map(
    (schedule ?? []).map((e) => [fmtTime(e.slot_start), e]),
  );
  // Bookings that would fall off the drafted grid (time or length changed).
  const affected = (schedule ?? []).filter(
    (e) => !previewStarts.has(`${fmtTime(e.slot_start)}-${fmtTime(e.slot_end)}`),
  );
  const fittingBooked = (schedule?.length ?? 0) - affected.length;

  // --- Draft edits --------------------------------------------------------
  function removeSlot(slot: DraftSlot) {
    setConfig((c) =>
      slot.isExtra
        ? { ...c, extra: (c.extra ?? []).filter((x) => x.start !== slot.start) }
        : { ...c, blocked: [...(c.blocked ?? []), slot.start].sort() },
    );
  }

  function restoreSlot(hhmm: string) {
    setConfig((c) => ({
      ...c,
      blocked: (c.blocked ?? []).filter((t) => t !== hhmm),
    }));
  }

  const [extraMinutes, setExtraMinutes] = useState<string>("");
  function addExtraSlot() {
    const minutes = Number(extraMinutes) || config.slot_minutes;
    if (minutes < 1 || minutes > 120) return;
    setConfig((c) => {
      const current = draftSlots(c);
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
    setSaved(false);

    async function doSave(clear: boolean) {
      const updated = await updateJob(job.id, {
        time_slot_config: config,
        ...(clear ? { clear_slot_bookings: true } : {}),
      });
      onJobChanged(updated);
      // The server prunes stale removals on save; adopt its version so the
      // draft matches what was actually stored.
      setConfig(canonical(updated.time_slot_config ?? DEFAULT_CONFIG));
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2000);
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
      {/* --- Slot settings --------------------------------------------- */}
      <div className="rounded-card border border-muted-200 bg-paper p-5">
        <h3 className="text-sm font-semibold text-ink">Slot settings</h3>
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
            <input
              type="time"
              value={config.start}
              onChange={(e) => setCadence({ start: e.target.value })}
              className="mt-1 w-full rounded-md border border-muted-200 bg-paper px-2 py-1.5 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
            />
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-muted-600">
              Day ends
            </span>
            <input
              type="time"
              value={config.end}
              onChange={(e) => setConfig({ ...config, end: e.target.value })}
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
              <input
                type="time"
                value={b.start}
                onChange={(e) => setBreak(i, { start: e.target.value })}
                className="rounded-md border border-muted-200 bg-paper px-2 py-1.5 text-sm outline-none focus:border-accent"
              />
              <span className="text-xs text-muted-600">to</span>
              <input
                type="time"
                value={b.end}
                onChange={(e) => setBreak(i, { end: e.target.value })}
                className="rounded-md border border-muted-200 bg-paper px-2 py-1.5 text-sm outline-none focus:border-accent"
              />
              <button
                type="button"
                onClick={() =>
                  setConfig((c) => ({
                    ...c,
                    breaks: c.breaks.filter((_, j) => j !== i),
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
                setConfig((c) => ({
                  ...c,
                  breaks: [...c.breaks, { start: "12:00", end: "12:30" }],
                }))
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
          <div className="mt-2 grid grid-cols-3 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-1.5">
            {/* Breaks render inline as muted chips so the day reads as one
                continuous timeline: slots, lunch, slots. */}
            {config.breaks
              .filter(
                (b) =>
                  b.start &&
                  b.end &&
                  toMins(b.end) > toMins(b.start) &&
                  toMins(b.start) >= toMins(config.start) &&
                  toMins(b.start) < toMins(config.end),
              )
              .map((b) => (
                <div
                  key={`break-${b.start}`}
                  title={`${b.start}–${b.end} · break`}
                  style={{
                    order: toMins(b.start),
                  }}
                  className="rounded-md border border-muted-200 bg-muted-100 px-1.5 py-1 min-w-0"
                >
                  <span className="block font-mono text-[11px] leading-tight text-muted-600">
                    {b.start} ({toMins(b.end) - toMins(b.start)}m)
                  </span>
                  <span className="block text-[11px] leading-tight text-muted-600">
                    break
                  </span>
                </div>
              ))}
            {preview.map((s) => {
              const entry = bookedByTime.get(s.start);
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
                      onClick={() => removeSlot(s)}
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
                onClick={addExtraSlot}
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
          {saved ? <span className="text-xs text-green-700">Saved.</span> : null}
        </div>
      </div>
    </CollapsibleSection>
  );
}

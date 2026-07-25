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
import { listPublicSlots, type PublicSlot } from "@/lib/participants";

// HSD-55 — Schedule section on the Job detail page, shown only for
// time-slot jobs. Two halves:
//   1. Slot settings: day start/end, slot length, buffer, breaks. Saved
//      whole; the backend validates the shape and the signup page picks up
//      new slots immediately.
//   2. The booked schedule: chronological list of who booked what, with
//      shot status, refreshed with the participants refresh key.

const DEFAULT_CONFIG: TimeSlotConfig = {
  start: "09:00",
  end: "17:00",
  slot_minutes: 10,
  buffer_minutes: 0,
  breaks: [],
};

function fmtTime(iso: string): string {
  // Slots are stored as wall-clock on the shoot date; show HH:MM as-is.
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
    job.time_slot_config ?? DEFAULT_CONFIG,
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [schedule, setSchedule] = useState<ScheduleEntry[] | null>(null);
  const [slots, setSlots] = useState<PublicSlot[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const entries = await getSchedule(job.id);
        if (!cancelled) setSchedule(entries);
      } catch {
        if (!cancelled) setSchedule([]);
      }
      try {
        const s = await listPublicSlots(job.public_slug);
        if (!cancelled) setSlots(s);
      } catch {
        if (!cancelled) setSlots([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [job.id, job.public_slug, job.time_slot_config, refreshKey]);

  const savedConfig = job.time_slot_config ?? DEFAULT_CONFIG;
  const dirty = JSON.stringify(config) !== JSON.stringify(savedConfig);
  const bookedCount = schedule?.length ?? 0;

  async function saveConfig() {
    // Changing the grid while people hold slots strands their times. The
    // backend refuses unless we explicitly confirm the cancellation.
    if (bookedCount > 0) {
      const ok = window.confirm(
        `Saving a new schedule cancels ${bookedCount} booked ${
          bookedCount === 1 ? "slot" : "slots"
        }. Those participants stay signed up but lose their time and will ` +
          "need to book again from the signup page. Continue?",
      );
      if (!ok) return;
    }
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      const updated = await updateJob(job.id, {
        time_slot_config: config,
        ...(bookedCount > 0 ? { clear_slot_bookings: true } : {}),
      });
      onJobChanged(updated);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2000);
      // Bookings were just cancelled server-side; reflect it immediately.
      try {
        setSchedule(await getSchedule(job.id));
      } catch {
        setSchedule([]);
      }
    } catch (err) {
      setSaveError(
        err instanceof ApiError && err.status === 422
          ? "Check the times: the day must end after it starts, breaks must fall inside it, and slots must fit."
          : err instanceof ApiError && err.status === 409
            ? "Someone booked a slot just now. Review the bookings below and save again."
            : "Couldn't save. Try again?",
      );
      // A 409 means our booking count was stale; refresh it.
      try {
        setSchedule(await getSchedule(job.id));
      } catch {
        /* keep the old list */
      }
    } finally {
      setSaving(false);
    }
  }

  function setBreak(i: number, patch: Partial<SlotBreak>) {
    setConfig((c) => ({
      ...c,
      breaks: c.breaks.map((b, j) => (j === i ? { ...b, ...patch } : b)),
    }));
  }

  const configured = !!job.time_slot_config;

  // Live validation: catch impossible configs (end before start, breaks
  // outside the day, slots that don't fit) as they're typed, before Save.
  const configProblem = (() => {
    const mins = (hhmm: string) => {
      const [h, m] = hhmm.split(":").map(Number);
      return h * 60 + m;
    };
    if (!config.start || !config.end) return "Set a day start and end.";
    if (mins(config.end) <= mins(config.start)) {
      return "The day must end after it starts.";
    }
    const span = mins(config.end) - mins(config.start);
    if (config.slot_minutes + config.buffer_minutes > span) {
      return "One slot plus buffer is longer than the whole day.";
    }
    for (const b of config.breaks) {
      if (!b.start || !b.end) return "Fill in both times for every break.";
      if (mins(b.end) <= mins(b.start)) {
        return "Each break must end after it starts.";
      }
      if (mins(b.start) < mins(config.start) || mins(b.end) > mins(config.end)) {
        return "Breaks must fall inside the day.";
      }
    }
    return null;
  })();

  // Slot calculator: photographers usually get "N people, 9 to 5" from the
  // client, not a slot length. Given the day window, breaks, buffer, and a
  // participant count, suggest the minutes per person that fits everyone.
  const [participantCount, setParticipantCount] = useState<string>("");
  const suggestion = (() => {
    const n = Number(participantCount);
    if (!Number.isFinite(n) || n < 1) return null;
    const mins = (hhmm: string) => {
      const [h, m] = hhmm.split(":").map(Number);
      return h * 60 + m;
    };
    if (!config.start || !config.end) return null;
    const breakTotal = config.breaks.reduce(
      (sum, b) =>
        b.start && b.end ? sum + Math.max(mins(b.end) - mins(b.start), 0) : sum,
      0,
    );
    const available = mins(config.end) - mins(config.start) - breakTotal;
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
            No slots yet. Save the settings below so participants can book.
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
              onChange={(e) => setConfig({ ...config, start: e.target.value })}
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
                setConfig({ ...config, slot_minutes: Number(e.target.value) })
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
                setConfig({ ...config, buffer_minutes: Number(e.target.value) })
              }
              className="mt-1 w-full rounded-md border border-muted-200 bg-paper px-2 py-1.5 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
            />
          </label>
        </div>

        {/* Slot calculator: enter a headcount, get the slot length that
            fits everyone in the day window. */}
        <div className="mt-4 rounded-card bg-muted-50 p-3">
          <div className="flex flex-wrap items-end gap-3">
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
                    onClick={() =>
                      setConfig((c) => ({
                        ...c,
                        slot_minutes: suggestion.minutes,
                      }))
                    }
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

        {configProblem ? (
          <p className="mt-3 text-xs text-red-600" role="alert">
            {configProblem}
          </p>
        ) : saveError ? (
          <p className="mt-3 text-xs text-red-600" role="alert">
            {saveError}
          </p>
        ) : null}
        {dirty && bookedCount > 0 && !configProblem ? (
          <p className="mt-3 text-xs text-amber-700 bg-amber-50 rounded-md px-2 py-1 inline-block">
            Heads up: saving a new schedule cancels{" "}
            {bookedCount === 1 ? "the 1 booked slot" : `all ${bookedCount} booked slots`}
            . Those participants will need to book again.
          </p>
        ) : null}
        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={saveConfig}
            disabled={saving || !!configProblem || (configured && !dirty)}
            className="btn-primary text-sm disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {saving ? "Saving…" : configured ? "Save changes" : "Create slots"}
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
          {saved ? (
            <span className="text-xs text-green-700">Saved.</span>
          ) : null}
        </div>
      </div>

      {/* --- Slot grid -------------------------------------------------
          One chip per slot: booked chips carry the person's name, free
          chips just the time. Scales to full corporate days (100+ slots)
          where a chronological list would be a page of scrolling. Names
          and assignment actions live in the Participants table below. */}
      <div className="mt-4">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-sm font-semibold text-ink">Bookings</h3>
          {slots.length > 0 ? (
            <span className="text-xs text-muted-600">
              {schedule?.length ?? 0} of {slots.length} slots booked
            </span>
          ) : null}
        </div>
        {schedule === null ? (
          <p className="mt-2 text-sm text-muted-600">Loading…</p>
        ) : slots.length === 0 ? (
          <p className="mt-2 text-sm text-muted-600">
            No slots yet. They appear here and on the signup page as soon as
            the settings above are saved.
          </p>
        ) : (
          (() => {
            const bySlot = new Map(
              (schedule ?? []).map((e) => [e.slot_start, e]),
            );
            return (
              <div className="mt-2 grid grid-cols-3 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-1.5">
                {slots.map((s) => {
                  const entry = bySlot.get(s.start);
                  return (
                    <div
                      key={s.start}
                      title={
                        entry
                          ? `${fmtTime(s.start)}–${fmtTime(s.end)} · ${entry.participant_name}${entry.shot ? " · shot" : ""}`
                          : `${fmtTime(s.start)}–${fmtTime(s.end)} · open`
                      }
                      className={
                        "rounded-md border px-1.5 py-1 min-w-0 " +
                        (entry
                          ? entry.shot
                            ? "border-green-200 bg-green-50"
                            : "border-accent/40 bg-accent-muted"
                          : "border-muted-200 bg-paper")
                      }
                    >
                      <span
                        className={
                          "block font-mono text-[11px] leading-tight " +
                          (entry ? "text-ink" : "text-muted-400")
                        }
                      >
                        {fmtTime(s.start)}
                      </span>
                      <span
                        className={
                          "block text-[11px] leading-tight truncate " +
                          (entry ? "text-ink font-medium" : "text-muted-400")
                        }
                      >
                        {entry ? entry.participant_name : "open"}
                      </span>
                    </div>
                  );
                })}
              </div>
            );
          })()
        )}
        {schedule && schedule.length > 0 ? (
          <p className="mt-2 text-xs text-muted-600">
            Assign, move, or clear times from the Time column in Participants
            below.
          </p>
        ) : null}
      </div>
    </CollapsibleSection>
  );
}

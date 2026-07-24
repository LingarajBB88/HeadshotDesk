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
  }, [job.id, refreshKey]);

  async function saveConfig() {
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      const updated = await updateJob(job.id, { time_slot_config: config });
      onJobChanged(updated);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setSaveError(
        err instanceof ApiError && err.status === 422
          ? "Check the times: the day must end after it starts, breaks must fall inside it, and slots must fit."
          : "Couldn't save. Try again?",
      );
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

        {saveError ? (
          <p className="mt-3 text-xs text-red-600" role="alert">
            {saveError}
          </p>
        ) : null}
        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={saveConfig}
            disabled={saving}
            className="btn-primary text-sm disabled:opacity-60"
          >
            {saving ? "Saving…" : configured ? "Save changes" : "Create slots"}
          </button>
          {saved ? (
            <span className="text-xs text-green-700">Saved.</span>
          ) : null}
        </div>
      </div>

      {/* --- Booked schedule ------------------------------------------- */}
      <div className="mt-4">
        <h3 className="text-sm font-semibold text-ink">Booked</h3>
        {schedule === null ? (
          <p className="mt-2 text-sm text-muted-600">Loading…</p>
        ) : schedule.length === 0 ? (
          <p className="mt-2 text-sm text-muted-600">
            No bookings yet. Slots appear on the signup page as soon as the
            settings above are saved.
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-muted-200 rounded-card border border-muted-200 bg-paper">
            {schedule.map((e) => (
              <li
                key={e.participant_id}
                className="flex items-center gap-3 px-4 py-2.5"
              >
                <span className="font-mono text-sm text-ink w-24 shrink-0">
                  {fmtTime(e.slot_start)}–{fmtTime(e.slot_end)}
                </span>
                <span className="text-sm text-ink truncate">
                  {e.participant_name}
                </span>
                {e.shot ? (
                  <span className="ml-auto inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-green-100 text-green-700">
                    Shot
                  </span>
                ) : (
                  <span className="ml-auto inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-muted-100 text-muted-600">
                    Booked
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </CollapsibleSection>
  );
}

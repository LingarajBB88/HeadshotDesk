"use client";

import { useState } from "react";

import { ApiError } from "@/lib/api";
import { updateJob, type Job } from "@/lib/jobs";

/**
 * HSD-71 — the days a shoot runs on.
 *
 * Big corporate shoots (200-500 people) don't fit one day, so a job can
 * carry extra dates. The first day stays Job.shoot_date, so everything
 * that displays "the shoot date" keeps working; extra days live alongside.
 * The same daily slot pattern applies to every day, which is how these
 * shoots are actually run (same room, same hours, different people).
 *
 * Removing a day cancels only that day's bookings, and the backend
 * refuses until that's confirmed.
 */
export function ShootDaysEditor({
  job,
  onChanged,
}: {
  job: Job;
  onChanged: (updated: Job) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [newDate, setNewDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const extra = job.extra_shoot_dates ?? [];
  const allDays = [job.shoot_date, ...extra].filter(Boolean) as string[];
  allDays.sort();

  /** Why the day being typed can't be added, or null when it's fine. */
  const newProblem: string | null = !newDate
    ? null
    : allDays.includes(newDate)
      ? "That day is already on this shoot."
      : job.shoot_date && newDate < job.shoot_date
        ? "Extra days come after the first shoot day."
        : null;

  function fmt(iso: string): string {
    return new Date(iso).toLocaleDateString(undefined, {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
  }

  async function save(nextExtra: string[], confirmClear = false) {
    setBusy(true);
    setError(null);
    try {
      onChanged(
        await updateJob(job.id, {
          extra_shoot_dates: nextExtra,
          ...(confirmClear ? { clear_slot_bookings: true } : {}),
        }),
      );
      setAdding(false);
      setNewDate("");
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        const ok = window.confirm(
          `${err.message} Those participants stay signed up but lose their time. Continue?`,
        );
        if (ok) {
          await save(nextExtra, true);
          return;
        }
      } else {
        setError(
          err instanceof ApiError ? err.message : "Couldn't save the days.",
        );
      }
    } finally {
      setBusy(false);
    }
  }

  /** Scroll to that day's slot grid and flash it, so the jump is obvious
   *  on a page where every day's grid looks alike. */
  function scrollToDay(iso: string) {
    const el = document.getElementById(`shoot-day-${iso}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    el.classList.add("ring-2", "ring-accent/40", "rounded-card");
    window.setTimeout(
      () => el.classList.remove("ring-2", "ring-accent/40", "rounded-card"),
      1200,
    );
  }

  async function removeDay(iso: string) {
    if (iso === job.shoot_date) {
      setError(
        "The first day can't be removed here. Change the shoot date on the job instead.",
      );
      return;
    }
    await save(extra.filter((d) => d !== iso));
  }

  return (
    <div className="rounded-card border border-muted-200 bg-paper p-5">
      <h3 className="text-sm font-semibold text-ink">Shoot days</h3>
      <p className="mt-1 text-xs text-muted-600">
        {allDays.length > 1
          ? "Click a day to jump to its slots. Each day can have its own hours and breaks."
          : "Add a day for shoots too big to fit in one. Each day gets its own hours and breaks."}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {allDays.map((d) => (
          <span
            key={d}
            className={
              "inline-flex items-center gap-2 rounded-card border px-1 py-0.5 text-sm " +
              (d === job.shoot_date
                ? "border-accent/40 bg-accent-muted text-ink"
                : "border-muted-200 bg-paper text-ink")
            }
          >
            {/* The chip is the fastest way to reach a day's grid on a shoot
                that runs a week. */}
            <button
              type="button"
              onClick={() => scrollToDay(d)}
              title={`Jump to ${fmt(d)}`}
              className="rounded-md px-2 py-1 hover:bg-accent-muted transition"
            >
              {fmt(d)}
              {d === job.shoot_date ? (
                <span className="ml-2 text-[11px] text-muted-600">
                  first day
                </span>
              ) : null}
            </button>
            {d === job.shoot_date ? null : (
              <button
                type="button"
                onClick={() => removeDay(d)}
                disabled={busy}
                aria-label={`Remove ${fmt(d)}`}
                title="Remove this day"
                className="pr-2 text-muted-400 hover:text-red-600 transition"
              >
                ×
              </button>
            )}
          </span>
        ))}

        {adding ? (
          <span className="inline-flex items-center gap-2">
            <input
              type="date"
              value={newDate}
              // Earliest offered is the day after the first shoot day, so the
              // picker can't produce a duplicate or an out-of-order date.
              min={
                job.shoot_date
                  ? new Date(
                      new Date(job.shoot_date).getTime() + 86400000,
                    )
                      .toISOString()
                      .slice(0, 10)
                  : undefined
              }
              onChange={(e) => {
                setNewDate(e.target.value);
                setError(null);
              }}
              className={
                "rounded-md border bg-paper px-2 py-1.5 text-sm outline-none " +
                (newProblem ? "border-red-500" : "border-muted-200 focus:border-accent")
              }
            />
            <button
              type="button"
              disabled={!newDate || busy || Boolean(newProblem)}
              onClick={() => save([...extra, newDate])}
              className="btn-secondary text-xs disabled:opacity-60"
            >
              {busy ? "Adding…" : "Add"}
            </button>
            <button
              type="button"
              onClick={() => {
                setAdding(false);
                setNewDate("");
                setError(null);
              }}
              className="text-xs text-muted-600 hover:text-ink"
            >
              Cancel
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="rounded-card border border-dashed border-accent/50 px-3 py-1.5 text-sm font-medium text-accent hover:bg-accent-muted transition"
          >
            + Add a day
          </button>
        )}
      </div>

      {newProblem ? (
        <p className="mt-2 text-xs text-red-600">{newProblem}</p>
      ) : null}
      {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}

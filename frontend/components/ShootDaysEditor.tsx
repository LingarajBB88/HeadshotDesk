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
        The slot settings below apply to every day. Big shoots often run the
        same hours across several days.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {allDays.map((d) => (
          <span
            key={d}
            className={
              "inline-flex items-center gap-2 rounded-card border px-3 py-1.5 text-sm " +
              (d === job.shoot_date
                ? "border-accent/40 bg-accent-muted text-ink"
                : "border-muted-200 bg-paper text-ink")
            }
          >
            {fmt(d)}
            {d === job.shoot_date ? (
              <span className="text-[11px] text-muted-600">first day</span>
            ) : (
              <button
                type="button"
                onClick={() => removeDay(d)}
                disabled={busy}
                aria-label={`Remove ${fmt(d)}`}
                title="Remove this day"
                className="text-muted-400 hover:text-red-600 transition"
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
              min={job.shoot_date ?? undefined}
              onChange={(e) => setNewDate(e.target.value)}
              className="rounded-md border border-muted-200 bg-paper px-2 py-1.5 text-sm outline-none focus:border-accent"
            />
            <button
              type="button"
              disabled={!newDate || busy}
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

      {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}

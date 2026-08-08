"use client";

import { useState } from "react";

import { FormField } from "@/components/FormField";
import { ApiError } from "@/lib/api";
import { updateJob, type Job } from "@/lib/jobs";

/**
 * Edit-job modal — mirrors the New Job form's two-column split (shoot
 * details left, client right) with values prefilled. Sparse-PATCHes via
 * the existing update endpoint; empty optional fields become null so
 * values can be cleared. The download cap is NOT here — it keeps its
 * inline editor on the Job detail metadata block (single source of truth).
 *
 * Shared between the Job detail page (Edit button) and the Jobs list
 * (row-level ⋯ menu).
 */
export function EditJobModal({
  job,
  onClose,
  onSaved,
}: {
  job: Job;
  onClose: () => void;
  onSaved: (updated: Job) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  // HSD-71: a job can run over several days. Editing the first date without
  // seeing the rest used to let you push day one past day two, so the extra
  // days are edited here too rather than living only in the Schedule section.
  const [firstDay, setFirstDay] = useState(job.shoot_date ?? "");
  const [extraDays, setExtraDays] = useState<string[]>(
    job.extra_shoot_dates ?? [],
  );

  /** Why this extra day can't be used, or null when it's fine. */
  function dayProblem(value: string, index: number): string | null {
    if (!value) return null;
    if (firstDay && value === firstDay)
      return "That's already the first shoot day.";
    if (firstDay && value < firstDay)
      return "Extra days come after the first shoot day.";
    if (extraDays.some((d, j) => j !== index && d === value))
      return "That day is already in the list.";
    return null;
  }

  const dayErrors = extraDays.map((d, i) => dayProblem(d, i));

  async function submit(payload: Record<string, unknown>) {
    onSaved(await updateJob(job.id, payload));
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    setFieldErrors({});

    const data = new FormData(e.currentTarget);
    const name = String(data.get("name") ?? "").trim();
    if (!name) {
      setFieldErrors({ name: "Job name is required." });
      return;
    }
    if (dayErrors.some(Boolean)) {
      setFormError("Fix the shoot days before saving.");
      return;
    }

    const payload: Record<string, unknown> = {
      name,
      shoot_date: firstDay || null,
      extra_shoot_dates: extraDays.filter(Boolean),
      location: (String(data.get("location") ?? "").trim()) || null,
      client_name: (String(data.get("client_name") ?? "").trim()) || null,
      client_email: (String(data.get("client_email") ?? "").trim()) || null,
    };

    setSaving(true);
    try {
      await submit(payload);
    } catch (err) {
      // Moving or dropping a day can strand bookings. The backend refuses
      // until we say so explicitly, so ask before destroying anyone's time.
      if (err instanceof ApiError && err.status === 409) {
        const ok = window.confirm(
          `${err.message} Those participants stay signed up but lose their time. Continue?`,
        );
        if (ok) {
          try {
            await submit({ ...payload, clear_slot_bookings: true });
            return;
          } catch {
            setFormError("Couldn't save. Try again?");
          }
        }
      } else if (err instanceof ApiError && err.status === 422) {
        setFormError("One of the fields isn't valid. Check the values.");
      } else {
        setFormError("Couldn't save. Try again?");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-ink/40 px-4 py-8 overflow-y-auto"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-2xl rounded-dialog bg-paper p-6 shadow-xl">
        <h2 className="font-display text-xl font-semibold tracking-tight">
          Edit job
        </h2>

        <form onSubmit={onSubmit} className="mt-5" noValidate>
          <div className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
            <div>
              <FormField
                label="Job name"
                name="name"
                required
                defaultValue={job.name}
                error={fieldErrors.name}
              />
              <FormField
                label={extraDays.length ? "First shoot day" : "Shoot date"}
                name="shoot_date"
                type="date"
                value={firstDay}
                onChange={(e) => setFirstDay(e.target.value)}
                error={fieldErrors.shoot_date}
              />

              {/* Extra days, editable here so the first date can't be moved
                  past them by accident. */}
              <div className="mb-4">
                {extraDays.map((d, i) => (
                  <div key={i} className="mb-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="date"
                        value={d}
                        min={
                          firstDay
                            ? new Date(new Date(firstDay).getTime() + 86400000)
                                .toISOString()
                                .slice(0, 10)
                            : undefined
                        }
                        onChange={(e) =>
                          setExtraDays((days) =>
                            days.map((x, j) => (j === i ? e.target.value : x)),
                          )
                        }
                        className={
                          "rounded-md border bg-paper px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/30 " +
                          (dayErrors[i]
                            ? "border-red-500 focus:border-red-500"
                            : "border-muted-200 focus:border-accent")
                        }
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setExtraDays((days) => days.filter((_, j) => j !== i))
                        }
                        className="text-xs text-muted-600 hover:text-red-600 transition"
                      >
                        Remove
                      </button>
                    </div>
                    {dayErrors[i] ? (
                      <p className="mt-1 text-xs text-red-600">
                        {dayErrors[i]}
                      </p>
                    ) : null}
                  </div>
                ))}
                <button
                  type="button"
                  disabled={!firstDay}
                  onClick={() => setExtraDays((days) => [...days, ""])}
                  className="text-xs font-medium text-accent hover:underline disabled:text-muted-400 disabled:no-underline disabled:cursor-not-allowed"
                >
                  + Add another shoot day
                </button>
              </div>

              <FormField
                label="Location"
                name="location"
                defaultValue={job.location ?? ""}
                error={fieldErrors.location}
              />
            </div>
            <div>
              <FormField
                label="Client name"
                name="client_name"
                defaultValue={job.client_name ?? ""}
                error={fieldErrors.client_name}
              />
              <FormField
                label="Client email"
                name="client_email"
                type="email"
                defaultValue={job.client_email ?? ""}
                error={fieldErrors.client_email}
              />
            </div>
          </div>

          {formError ? (
            <p className="mb-3 text-sm text-red-600" role="alert">
              {formError}
            </p>
          ) : null}

          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="text-sm font-medium text-muted-600 hover:text-ink px-3 py-2 rounded-md transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="btn-primary text-sm disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

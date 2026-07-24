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

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    setFieldErrors({});
    setSaving(true);
    try {
      const data = new FormData(e.currentTarget);
      const name = String(data.get("name") ?? "").trim();
      if (!name) {
        setFieldErrors({ name: "Job name is required." });
        setSaving(false);
        return;
      }
      const updated = await updateJob(job.id, {
        name,
        shoot_date: (String(data.get("shoot_date") ?? "").trim()) || null,
        location: (String(data.get("location") ?? "").trim()) || null,
        client_name: (String(data.get("client_name") ?? "").trim()) || null,
        client_email: (String(data.get("client_email") ?? "").trim()) || null,
      });
      onSaved(updated);
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) {
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
                label="Shoot date"
                name="shoot_date"
                type="date"
                defaultValue={job.shoot_date ?? ""}
                error={fieldErrors.shoot_date}
              />
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

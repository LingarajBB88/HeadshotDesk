"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { FormField } from "@/components/FormField";
import { createJob } from "@/lib/jobs";
import { classifyFormError } from "@/lib/form-errors";

export default function NewJobPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    setFieldErrors({});
    setSubmitting(true);
    try {
      const data = new FormData(e.currentTarget);
      const job = await createJob({
        name: String(data.get("name") ?? "").trim(),
        client_name: (String(data.get("client_name") ?? "").trim()) || null,
        client_email: (String(data.get("client_email") ?? "").trim()) || null,
        shoot_date: (String(data.get("shoot_date") ?? "").trim()) || null,
        location: (String(data.get("location") ?? "").trim()) || null,
      });
      router.push(`/jobs/${job.id}`);
    } catch (err) {
      const c = classifyFormError(err);
      if (c.fieldErrors) setFieldErrors(c.fieldErrors);
      else if (c.formError) setFormError(c.formError);
      else setFormError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-xl">
      <Link href="/jobs" className="text-sm text-muted-600 hover:text-ink transition">
        &larr; Back to jobs
      </Link>
      <h1 className="mt-4 font-display text-3xl font-semibold tracking-tight">
        New job
      </h1>
      <p className="mt-1 text-sm text-muted-600">
        Set up a new shoot. You can edit any of these later.
      </p>

      <form onSubmit={onSubmit} className="mt-8" noValidate>
        <FormField
          label="Job name"
          name="name"
          required
          hint="e.g. “Acme HQ team headshots”"
          error={fieldErrors.name}
        />
        <FormField
          label="Client name"
          name="client_name"
          hint="The company or contact you're shooting for. Optional."
          error={fieldErrors.client_name}
        />
        <FormField
          label="Client email"
          name="client_email"
          type="email"
          hint="Optional — only used if you want to CC the client on delivery."
          error={fieldErrors.client_email}
        />
        <FormField
          label="Shoot date"
          name="shoot_date"
          type="date"
          required
          min={new Date().toISOString().slice(0, 10)}
          hint="Today or later."
          error={fieldErrors.shoot_date}
        />
        <FormField
          label="Location"
          name="location"
          required
          hint="Where the shoot is happening. Shows on participant emails."
          error={fieldErrors.location}
        />

        {formError ? (
          <p className="mb-4 text-sm text-red-600" role="alert">
            {formError}
          </p>
        ) : null}

        <div className="flex gap-3 mt-6">
          <button
            type="submit"
            disabled={submitting}
            className="btn-primary disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {submitting ? "Creating…" : "Create job"}
          </button>
          <Link href="/jobs" className="btn-secondary">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}

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
      const rawCap = String(data.get("download_cap") ?? "").trim();
      const parsedCap = rawCap === "" ? null : Number(rawCap);
      const job = await createJob({
        name: String(data.get("name") ?? "").trim(),
        client_name: (String(data.get("client_name") ?? "").trim()) || null,
        client_email: (String(data.get("client_email") ?? "").trim()) || null,
        shoot_date: (String(data.get("shoot_date") ?? "").trim()) || null,
        location: (String(data.get("location") ?? "").trim()) || null,
        download_cap:
          parsedCap !== null && Number.isFinite(parsedCap) && parsedCap >= 0
            ? Math.floor(parsedCap)
            : null,
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
    <div className="max-w-4xl">
      <Link href="/jobs" className="text-sm text-muted-600 hover:text-ink transition">
        &larr; Back to jobs
      </Link>
      <h1 className="mt-4 font-display text-3xl font-semibold tracking-tight">
        New job
      </h1>
      <p className="mt-1 text-sm text-muted-600">
        Set up a new shoot. You can edit any of these later.{" "}
        <a
          href="/help/create-a-job"
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent hover:underline"
        >
          What does each field do?
        </a>
      </p>

      <form onSubmit={onSubmit} className="mt-8" noValidate>
        {/* Two-column split: shoot details (what/where/when) on the left,
            client block (who it's for) on the right. Groups related fields
            and pre-shapes the form for HSD-36 — when the Client entity
            ships, the right column becomes a client picker + logo. Columns
            stack on mobile. */}
        <div className="grid grid-cols-1 gap-x-10 md:grid-cols-2">
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-600 mb-4">
              Shoot details
            </h2>
            <FormField
              label="Job name"
              name="name"
              required
              hint="e.g. “Acme HQ team headshots”"
              error={fieldErrors.name}
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
            <FormField
              label="Headshots per participant"
              name="download_cap"
              type="number"
              min={0}
              max={1000}
              defaultValue={1}
              hint="How many headshots each participant can download from their gallery. Defaults to 1. Change later if the package is different."
              error={fieldErrors.download_cap}
            />
          </section>

          <section>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-600 mb-4">
              Client
            </h2>
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
              hint="Optional. Only used if you want to CC the client on delivery."
              error={fieldErrors.client_email}
            />

            {/* Client logo — coming with the Client entity (HSD-36). Show a
                disabled placeholder so the photographer knows it's on the
                way; keeps this form pre-shaped for that work. */}
            <div className="mb-4">
              <span className="block text-sm font-medium text-ink mb-1.5">
                Client logo
              </span>
              <div className="rounded-md border border-dashed border-muted-200 bg-muted-50 px-3 py-4 text-center">
                <p className="text-xs text-muted-600">
                  Coming soon: upload your client&apos;s logo once and it&apos;ll
                  appear on their signup page and galleries.
                </p>
              </div>
            </div>
          </section>
        </div>

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

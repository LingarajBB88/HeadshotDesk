"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

import { FormField } from "@/components/FormField";
import { Logo } from "@/components/Logo";
import { ApiError } from "@/lib/api";
import { classifyFormError } from "@/lib/form-errors";
import { getPublicJob, publicSignup, type PublicJob } from "@/lib/participants";

export default function PublicSignupPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;

  const [job, setJob] = useState<PublicJob | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const j = await getPublicJob(slug);
        if (!cancelled) setJob(j);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) {
          setLoadError("This signup link isn't active. Ask your photographer for a new link.");
        } else {
          setLoadError("Could not load signup page.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    setFieldErrors({});
    setSubmitting(true);
    try {
      const data = new FormData(e.currentTarget);
      await publicSignup(slug, {
        name: String(data.get("name") ?? "").trim(),
        email: String(data.get("email") ?? "").trim(),
        title: (String(data.get("title") ?? "").trim()) || null,
      });
      setSubmitted(true);
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
    <main className="min-h-dvh flex items-center justify-center px-6 py-12 bg-muted-50">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-8">
          <Logo size="md" wordmark />
        </div>

        <div className="bg-paper border border-muted-200 rounded-dialog p-8 shadow-sm">
          {loadError ? (
            <p className="text-sm text-red-600">{loadError}</p>
          ) : !job ? (
            <p className="text-sm text-muted-600">Loading…</p>
          ) : submitted ? (
            <>
              <h1 className="font-display text-2xl font-semibold tracking-tight">
                You&apos;re on the list
              </h1>
              <p className="mt-2 text-sm text-muted-600">
                We&apos;ve added you to <strong className="text-ink">{job.name}</strong>.
                You&apos;ll get an email with your photo gallery once the shoot is delivered.
              </p>
              {job.shoot_date ? (
                <p className="mt-4 text-sm text-muted-600">
                  <span className="font-medium text-ink">Shoot date:</span> {job.shoot_date}
                </p>
              ) : null}
              {job.location ? (
                <p className="mt-1 text-sm text-muted-600">
                  <span className="font-medium text-ink">Location:</span> {job.location}
                </p>
              ) : null}
            </>
          ) : (
            <>
              <h1 className="font-display text-2xl font-semibold tracking-tight">
                Sign up for headshots
              </h1>
              <p className="mt-1 text-sm text-muted-600">
                You&apos;re registering for{" "}
                <strong className="text-ink">{job.name}</strong>
                {job.client_name ? <> with {job.client_name}</> : null}.
              </p>

              {(job.shoot_date || job.location) && (
                <dl className="mt-4 mb-6 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-muted-50 rounded-md p-3">
                  {job.shoot_date ? (
                    <div>
                      <dt className="font-medium text-muted-600 uppercase tracking-wider">
                        Date
                      </dt>
                      <dd className="text-ink">{job.shoot_date}</dd>
                    </div>
                  ) : null}
                  {job.location ? (
                    <div>
                      <dt className="font-medium text-muted-600 uppercase tracking-wider">
                        Location
                      </dt>
                      <dd className="text-ink">{job.location}</dd>
                    </div>
                  ) : null}
                </dl>
              )}

              <form onSubmit={onSubmit} noValidate>
                <FormField
                  label="Your name"
                  name="name"
                  autoComplete="name"
                  required
                  error={fieldErrors.name}
                />
                <FormField
                  label="Email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  hint="Where we'll send your photo gallery."
                  error={fieldErrors.email}
                />
                <FormField
                  label="Title or role"
                  name="title"
                  hint="Optional — shown alongside your photos."
                  error={fieldErrors.title}
                />

                {formError ? (
                  <p className="mb-4 text-sm text-red-600" role="alert">
                    {formError}
                  </p>
                ) : null}

                <button
                  type="submit"
                  disabled={submitting}
                  className="btn-primary w-full disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {submitting ? "Submitting…" : "I'm in"}
                </button>
              </form>
            </>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-muted-600">
          Powered by HeadshotDesk
        </p>
      </div>
    </main>
  );
}

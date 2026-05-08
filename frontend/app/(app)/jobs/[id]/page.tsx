"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { ParticipantsSection } from "@/components/ParticipantsSection";
import { SignupLinkBar } from "@/components/SignupLinkBar";
import { StatusPill } from "@/components/StatusPill";
import { ApiError } from "@/lib/api";
import { archiveJob, getJob, type Job } from "@/lib/jobs";

export default function JobDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [archiving, setArchiving] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        const j = await getJob(id);
        if (!cancelled) setJob(j);
      } catch (e) {
        if (!cancelled) {
          if (e instanceof ApiError && e.status === 404) {
            setError("Job not found.");
          } else {
            setError("Could not load job.");
          }
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function handleArchive() {
    if (!job) return;
    if (!confirm("Archive this job? It will be hidden from your active list.")) return;
    setArchiving(true);
    try {
      const updated = await archiveJob(job.id);
      setJob(updated);
    } catch {
      alert("Could not archive job.");
    } finally {
      setArchiving(false);
    }
  }

  if (error) {
    return (
      <div>
        <Link href="/jobs" className="text-sm text-muted-600 hover:text-ink transition">
          &larr; Back to jobs
        </Link>
        <div className="mt-6 rounded-card border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      </div>
    );
  }

  if (!job) {
    return <p className="text-sm text-muted-600">Loading…</p>;
  }

  return (
    <div>
      <Link href="/jobs" className="text-sm text-muted-600 hover:text-ink transition">
        &larr; Back to jobs
      </Link>

      <div className="mt-4 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight break-words">
              {job.name}
            </h1>
            <StatusPill status={job.status} />
          </div>
          {job.client_name ? (
            <p className="mt-1 text-muted-600">{job.client_name}</p>
          ) : null}
        </div>
        {job.status !== "archived" ? (
          <button
            onClick={handleArchive}
            disabled={archiving}
            className="btn-secondary disabled:opacity-60 self-start sm:self-auto"
          >
            {archiving ? "Archiving…" : "Archive"}
          </button>
        ) : null}
      </div>

      <dl className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-6 max-w-2xl">
        <Detail label="Shoot date" value={job.shoot_date ?? "—"} />
        <Detail label="Location" value={job.location ?? "—"} />
        <Detail label="Client email" value={job.client_email ?? "—"} />
        <Detail
          label="Created"
          value={new Date(job.created_at).toLocaleDateString()}
        />
        <Detail
          label="Last updated"
          value={new Date(job.updated_at).toLocaleDateString()}
        />
      </dl>

      {/* Signup link is the primary share-out for this job — give it a top-level
          spot, not buried under Participants. Hidden when archived since the
          public page returns 404 for archived jobs. */}
      {job.status !== "archived" ? (
        <div className="mt-10 max-w-2xl">
          <SignupLinkBar
            url={
              typeof window !== "undefined"
                ? `${window.location.origin}/s/${job.public_slug}`
                : `/s/${job.public_slug}`
            }
          />
        </div>
      ) : null}

      <div className="mt-12">
        <ParticipantsSection jobId={job.id} />
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wider text-muted-600">
        {label}
      </dt>
      <dd className="mt-1 text-sm text-ink">{value}</dd>
    </div>
  );
}

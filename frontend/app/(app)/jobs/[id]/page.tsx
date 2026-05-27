"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { CollapsibleSection } from "@/components/CollapsibleSection";
import {
  JobProgressStepper,
  JobStatTiles,
  ShootDayHero,
  type JobStats,
} from "@/components/JobOverview";
import { ParticipantsSection } from "@/components/ParticipantsSection";
import { PhotosSection } from "@/components/PhotosSection";
import { SignupLinkBar } from "@/components/SignupLinkBar";
import { StatusPill } from "@/components/StatusPill";
import { ApiError } from "@/lib/api";
import { listFiles } from "@/lib/files";
import { archiveJob, getJob, updateJob, type Job } from "@/lib/jobs";
import { listParticipants } from "@/lib/participants";

export default function JobDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [archiving, setArchiving] = useState(false);
  // Bumped whenever Photos changes — drives ParticipantsSection to refetch so
  // the photo-count status pills stay in sync without a hard refresh.
  const [participantsRefreshKey, setParticipantsRefreshKey] = useState(0);
  // Counts powering the HSD-34 stat tiles. Fetched alongside the job and
  // re-fetched whenever the photo/participant data is invalidated. Nulls
  // render as "—" so the tiles never look broken during load.
  const [stats, setStats] = useState<JobStats>({
    participantsTotal: null,
    participantsShot: null,
    photosUploaded: null,
    galleriesReady: null,
    downloadsUsed: null,
  });

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

  // Fetch participants + files in parallel for the stat tiles. Re-runs when
  // `participantsRefreshKey` bumps (e.g. after a photo upload or a
  // participant being marked shot from the shoot queue).
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      const [pRes, fRes] = await Promise.allSettled([
        listParticipants(id),
        listFiles(id),
      ]);
      if (cancelled) return;
      const participants =
        pRes.status === "fulfilled" ? pRes.value.items : null;
      const files = fRes.status === "fulfilled" ? fRes.value : null;
      setStats({
        participantsTotal: participants?.length ?? null,
        participantsShot:
          participants?.filter((p) => p.shot_at != null).length ?? null,
        photosUploaded: files?.total ?? null,
        // "Galleries ready" = participants with at least one photo assigned.
        // True delivery count comes when F5c email delivery ships.
        galleriesReady:
          participants?.filter((p) => p.photo_count > 0).length ?? null,
        // Round-2 polish: sum of per-participant unique downloads, exposed
        // by the participants list endpoint. Feeds the Downloads stat tile.
        downloadsUsed:
          participants?.reduce((sum, p) => sum + (p.downloads_used ?? 0), 0) ??
          null,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [id, participantsRefreshKey]);

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
          {/* Client name moved into the shoot-day hero card below (HSD-34). */}
        </div>
        {job.status !== "archived" ? (
          <div className="flex gap-2 self-start sm:self-auto">
            <Link href={`/jobs/${job.id}/shoot`} className="btn-primary">
              Start shooting
            </Link>
            <button
              onClick={handleArchive}
              disabled={archiving}
              className="btn-secondary disabled:opacity-60"
            >
              {archiving ? "Archiving…" : "Archive"}
            </button>
          </div>
        ) : null}
      </div>

      {/* Sticky stepper — pulled out of the Overview collapsible so it stays
          pinned to the top of the viewport while the user scrolls into
          Participants and Photos. CSS sticky only persists within the
          element's containing block, so the stepper has to live at page-root
          level (not inside a CollapsibleSection) to remain visible past the
          Overview zone. Pin offset is 0 because the app header in the
          parent layout isn't itself sticky. */}
      <div className="sticky top-0 z-10 -mx-4 sm:-mx-6 px-4 sm:px-6 bg-paper/95 backdrop-blur border-b border-muted-200 pt-2 pb-3">
        <JobProgressStepper job={job} />
      </div>

      {/* Overview — stat tiles + metadata/hero/signup grid. Stepper is now
          sticky above so it isn't collapsed away. */}
      <div className="mt-6">
        <CollapsibleSection title="Overview" defaultOpen>
          <JobStatTiles job={job} stats={stats} />

          {/* Inline two-column grid: metadata on the left, shoot-day hero
              + signup link on the right. Cap editable via DownloadCapDetail;
              the Downloads stat tile above just displays consumption. */}
          <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-5">
            <dl className="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-1 gap-x-8 gap-y-5">
              <DownloadCapDetail
                job={job}
                onChanged={(updated) => setJob(updated)}
                editable={job.status !== "archived"}
              />
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
            <div className="md:col-span-3 flex flex-col gap-4">
              <ShootDayHero job={job} />
              {/* Signup link tucked under the shoot-day hero so the right
                  column owns both 'where + when' and 'how to share'. Hidden
                  when archived since the public page 404s for archived jobs. */}
              {job.status !== "archived" ? (
                <SignupLinkBar
                  url={
                    typeof window !== "undefined"
                      ? `${window.location.origin}/s/${job.public_slug}`
                      : `/s/${job.public_slug}`
                  }
                />
              ) : null}
            </div>
          </div>
        </CollapsibleSection>
      </div>

      {/* Simple hairline separators between Job details / Participants / Photos.
          Lightweight visual segregation without uppercase zone labels. */}
      <div className="mt-12 border-t border-muted-200 pt-12">
        <ParticipantsSection
          jobId={job.id}
          refreshKey={participantsRefreshKey}
        />
      </div>

      <div className="mt-12 border-t border-muted-200 pt-12">
        <PhotosSection
          jobId={job.id}
          jobName={job.name}
          onChanged={() => setParticipantsRefreshKey((k) => k + 1)}
        />
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

function DownloadCapDetail({
  job,
  onChanged,
  editable,
}: {
  job: Job;
  onChanged: (updated: Job) => void;
  editable: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState<string>(String(job.download_cap));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const formattedHelper = (() => {
    if (job.download_cap === 0) return "Downloads disabled.";
    if (job.download_cap === 1) return "1 headshot per participant.";
    return `${job.download_cap} headshots per participant.`;
  })();

  async function save() {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1000) {
      setError("Enter a number between 0 and 1000.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const updated = await updateJob(job.id, { download_cap: Math.floor(parsed) });
      onChanged(updated);
      setEditing(false);
    } catch {
      setError("Couldn't save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wider text-muted-600">
        Headshots per participant
      </dt>
      <dd className="mt-1 text-sm text-ink">
        {editing ? (
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              max={1000}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="w-20 rounded-md border border-muted-200 bg-paper px-2 py-1 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
              disabled={saving}
              autoFocus
            />
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="text-xs font-medium text-accent hover:underline disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setValue(String(job.download_cap));
                setError(null);
              }}
              disabled={saving}
              className="text-xs text-muted-600 hover:text-ink"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex items-baseline gap-3">
            <span>{formattedHelper}</span>
            {editable ? (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="text-xs font-medium text-accent hover:underline"
              >
                Change
              </button>
            ) : null}
          </div>
        )}
        {error ? (
          <p className="mt-1 text-xs text-red-600">{error}</p>
        ) : null}
      </dd>
    </div>
  );
}

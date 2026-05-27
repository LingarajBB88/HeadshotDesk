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
import { SectionHeader } from "@/components/SectionHeader";
import { SignupLinkBar } from "@/components/SignupLinkBar";
import { StatusPill } from "@/components/StatusPill";
import { ApiError } from "@/lib/api";
import { listFiles } from "@/lib/files";
import { archiveJob, getJob, type Job } from "@/lib/jobs";
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

      {/* Round-2 polish: page now reads as five named zones — Overview,
          Job details, Sharing, Participants, Photos. Light section headers
          (small uppercase label + hairline) carry the structure; no card
          backgrounds or heavy borders to avoid competing with the
          shoot-day hero. */}
      <SectionHeader>Overview</SectionHeader>

      {/* HSD-34: progress stepper → stat tiles → hero card. Together they
          give a glanceable answer to "where am I in this job?" before the
          user drills into Participants or Photos. */}
      <JobProgressStepper job={job} />

      <JobStatTiles
        job={job}
        stats={stats}
        onJobChanged={(updated) => setJob(updated)}
        editable={job.status !== "archived"}
      />

      <div className="mt-6">
        <ShootDayHero job={job} />
      </div>

      {/* Job details — reference data the photographer rarely needs once
          setup is done. Collapsed by default; cap-editing lives in the
          Downloads tile above so collapsing this doesn't bury the only
          editable knob. */}
      <SectionHeader>Job details</SectionHeader>
      <CollapsibleSection title="Show details" defaultOpen={false}>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-5">
          <Detail
            label="Headshots per participant"
            value={formatCap(job.download_cap)}
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
      </CollapsibleSection>

      {/* Sharing — public signup link is the primary share-out. Hidden when
          archived since the public page returns 404 for archived jobs. */}
      {job.status !== "archived" ? (
        <>
          <SectionHeader>Sharing</SectionHeader>
          <div className="max-w-2xl">
            <SignupLinkBar
              url={
                typeof window !== "undefined"
                  ? `${window.location.origin}/s/${job.public_slug}`
                  : `/s/${job.public_slug}`
              }
            />
          </div>
        </>
      ) : null}

      <SectionHeader>Participants</SectionHeader>
      <ParticipantsSection
        jobId={job.id}
        refreshKey={participantsRefreshKey}
      />

      <SectionHeader>Photos</SectionHeader>
      <PhotosSection
        jobId={job.id}
        jobName={job.name}
        onChanged={() => setParticipantsRefreshKey((k) => k + 1)}
      />
    </div>
  );
}

function formatCap(cap: number): string {
  if (cap === 0) return "Downloads disabled";
  if (cap === 1) return "1 headshot per participant";
  return `${cap} headshots per participant`;
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

/* DownloadCapDetail was removed in Job detail polish round 2 — cap editing
   now lives in the Downloads stat tile (see <DownloadsTile> in JobOverview).
   The Job details collapsible just shows the current cap as a read-only row. */

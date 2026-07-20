"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { CollapsibleSection } from "@/components/CollapsibleSection";
import { FormField } from "@/components/FormField";
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
import {
  archiveJob,
  deliverJob,
  getJob,
  updateJob,
  type DeliveryResult,
  type Job,
} from "@/lib/jobs";
import { listParticipants } from "@/lib/participants";

export default function JobDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [archiving, setArchiving] = useState(false);
  // F5c: how many participants are eligible for the next Deliver click —
  // have at least one photo, have an email, and haven't been delivered yet.
  // Surfaced from the participants fetch below so the Deliver button can
  // show "Deliver to N" and disable itself when there's no one to send to.
  const [deliverableCount, setDeliverableCount] = useState<number | null>(null);
  const [deliverConfirmOpen, setDeliverConfirmOpen] = useState(false);
  const [delivering, setDelivering] = useState(false);
  const [deliverResult, setDeliverResult] = useState<DeliveryResult | null>(null);
  // Edit-job modal (name, shoot date, location, client details). The cap has
  // its own inline editor in the metadata block; not duplicated here.
  const [editOpen, setEditOpen] = useState(false);
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

      // F5c: eligibility count for the Deliver button — participants who
      // have at least one photo, an email on file, and haven't been
      // delivered yet. Mirrors the backend's deliver_galleries filter.
      setDeliverableCount(
        participants?.filter(
          (p) =>
            p.gallery_sent_at == null && p.photo_count > 0 && !!p.email,
        ).length ?? null,
      );
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

  async function handleDeliver() {
    if (!job) return;
    setDelivering(true);
    setDeliverResult(null);
    try {
      const result = await deliverJob(job.id);
      setDeliverResult(result);
      // Pull the latest job (status may have flipped to delivered) and
      // bump the refresh key so participant gallery_sent_at re-fetches.
      const updated = await getJob(job.id);
      setJob(updated);
      setParticipantsRefreshKey((k) => k + 1);
    } catch {
      setDeliverResult({
        sent: 0,
        skipped_already_delivered: 0,
        skipped_no_photos: 0,
        skipped_no_email: 0,
        errors: ["Couldn't reach the server. Try again?"],
      });
    } finally {
      setDelivering(false);
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
          <div className="flex flex-wrap gap-2 self-start sm:self-auto">
            <Link href={`/jobs/${job.id}/shoot`} className="btn-primary">
              Start shooting
            </Link>
            {/* F5c Deliver button — only visible when there's actually
                someone to email. Disabled with a tooltip when the count
                is 0 so the photographer understands why. */}
            <button
              type="button"
              onClick={() => setDeliverConfirmOpen(true)}
              disabled={!deliverableCount || delivering}
              title={
                deliverableCount === 0
                  ? "No one to deliver to yet — participants need a photo and an email."
                  : undefined
              }
              className="btn-secondary disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {delivering
                ? "Sending…"
                : deliverableCount
                  ? `Deliver to ${deliverableCount}`
                  : "Deliver"}
            </button>
            <button
              type="button"
              onClick={() => setEditOpen(true)}
              className="btn-secondary"
            >
              Edit
            </button>
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

      {/* Edit-job modal — name, shoot date, location, client name/email.
          PATCHes via the existing update endpoint; cap editing stays in the
          metadata block's inline editor. */}
      {editOpen && job ? (
        <EditJobModal
          job={job}
          onClose={() => setEditOpen(false)}
          onSaved={(updated) => {
            setJob(updated);
            setEditOpen(false);
          }}
        />
      ) : null}

      {/* F5c — Deliver confirmation modal. Surfaces the recipient count
          before sending so a stray click can't email an entire job. */}
      {deliverConfirmOpen ? (
        <DeliverConfirmModal
          jobName={job.name}
          count={deliverableCount ?? 0}
          delivering={delivering}
          onCancel={() => setDeliverConfirmOpen(false)}
          onConfirm={async () => {
            await handleDeliver();
            setDeliverConfirmOpen(false);
          }}
        />
      ) : null}

      {/* F5c — Inline result toast (sits at the top of the page after a
          Deliver run so the photographer sees what actually happened). */}
      {deliverResult ? (
        <DeliverResultToast
          result={deliverResult}
          onDismiss={() => setDeliverResult(null)}
        />
      ) : null}

      {/* Whole Job overview (stepper + stat tiles + metadata/hero/signup
          grid) wrapped in a CollapsibleSection so the photographer can
          collapse it once setup is done and the focus shifts to Participants
          and Photos. Open by default — the overview is the page's headline
          on first load. */}
      <div className="mt-6">
        <CollapsibleSection title="Overview" defaultOpen>
          <JobProgressStepper job={job} />

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

// ----------------------------------------------------------------------------
// F5c — Deliver confirmation + result components
// ----------------------------------------------------------------------------

// ----------------------------------------------------------------------------
// Edit-job modal — mirrors the New Job form's two-column split (shoot details
// left, client right) with values prefilled. Sparse-PATCHes only what the
// backend accepts; empty strings become null so optional fields can be
// cleared.
// ----------------------------------------------------------------------------

function EditJobModal({
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
        setFormError("One of the fields isn't valid — check the values.");
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

function DeliverConfirmModal({
  jobName,
  count,
  delivering,
  onCancel,
  onConfirm,
}: {
  jobName: string;
  count: number;
  delivering: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-ink/40 px-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md rounded-dialog bg-paper p-6 shadow-xl">
        <h2 className="font-display text-xl font-semibold tracking-tight">
          Deliver galleries?
        </h2>
        <p className="mt-2 text-sm text-muted-600">
          {count === 1
            ? `Email 1 participant on ${jobName} with their gallery link.`
            : `Email ${count} participants on ${jobName} with their gallery link.`}{" "}
          Already-delivered participants are skipped.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={delivering}
            className="text-sm font-medium text-muted-600 hover:text-ink px-3 py-2 rounded-md transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={delivering}
            className="btn-primary text-sm disabled:opacity-60"
          >
            {delivering ? "Sending…" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DeliverResultToast({
  result,
  onDismiss,
}: {
  result: DeliveryResult;
  onDismiss: () => void;
}) {
  const hasErrors = result.errors.length > 0;
  const summary = (() => {
    const parts: string[] = [];
    if (result.sent === 1) parts.push("Sent 1 email");
    else if (result.sent > 0) parts.push(`Sent ${result.sent} emails`);
    if (result.skipped_already_delivered > 0)
      parts.push(`${result.skipped_already_delivered} already delivered`);
    if (result.skipped_no_photos > 0)
      parts.push(`${result.skipped_no_photos} skipped (no photos)`);
    if (result.skipped_no_email > 0)
      parts.push(`${result.skipped_no_email} skipped (no email)`);
    return parts.length > 0 ? parts.join(" · ") : "Nothing to send.";
  })();

  return (
    <div
      className={
        "mt-4 rounded-card border px-4 py-3 text-sm flex items-start justify-between gap-3 " +
        (hasErrors
          ? "border-red-200 bg-red-50 text-red-700"
          : "border-green-200 bg-green-50 text-green-700")
      }
      role="status"
    >
      <div>
        <p className="font-medium">{summary}</p>
        {hasErrors ? (
          <ul className="mt-1 list-disc ml-5">
            {result.errors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="text-xs text-muted-600 hover:text-ink"
        aria-label="Dismiss"
      >
        ×
      </button>
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

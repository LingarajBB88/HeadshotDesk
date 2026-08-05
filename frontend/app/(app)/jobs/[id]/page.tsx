"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { CollapsibleSection } from "@/components/CollapsibleSection";
import { EditJobModal } from "@/components/EditJobModal";
import {
  JobProgressStepper,
  JobStatTiles,
  ShootDayHero,
  type JobStats,
} from "@/components/JobOverview";
import { ClientLinkBar } from "@/components/ClientLinkBar";
import { ParticipantsSection } from "@/components/ParticipantsSection";
import { PhotosSection } from "@/components/PhotosSection";
import { ScheduleSection } from "@/components/ScheduleSection";
import { SignupLinkBar } from "@/components/SignupLinkBar";
import { StatusPill } from "@/components/StatusPill";
import { ApiError } from "@/lib/api";
import { listClients } from "@/lib/clients";
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
  // Everyone with photos + email regardless of delivery state — the pool the
  // "resend to all" checkbox in the Deliver modal addresses.
  const [resendableCount, setResendableCount] = useState<number | null>(null);
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

      // F5c: eligibility counts for the Deliver button/modal. Deliverable =
      // photo + email + not yet sent (mirrors the backend's default filter).
      // Resendable = photo + email regardless of sent state (the pool the
      // resend-to-all checkbox addresses).
      const withPhotoAndEmail =
        participants?.filter((p) => p.photo_count > 0 && !!p.email) ?? null;
      setDeliverableCount(
        withPhotoAndEmail?.filter((p) => p.gallery_sent_at == null).length ??
          null,
      );
      setResendableCount(withPhotoAndEmail?.length ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [id, participantsRefreshKey]);

  // HSD-36: the linked client's logo for the job header. Resolved from the
  // clients list; missing logo (or no client) renders nothing.
  const [clientLogoUrl, setClientLogoUrl] = useState<string | null>(null);
  useEffect(() => {
    const clientId = job?.client_id;
    if (!clientId) {
      setClientLogoUrl(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const cs = await listClients();
        if (!cancelled) {
          setClientLogoUrl(
            cs.find((c) => c.id === clientId)?.logo_url ?? null,
          );
        }
      } catch {
        /* logo is decorative — never block the page on it */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [job?.client_id]);

  // Live sync: signups and slot bookings happen on the public signup page,
  // in another tab or on a participant's phone. This page would otherwise
  // only show what existed when it loaded. Poll while the tab is visible so
  // Participants, stats, and the Schedule's Booked list stay current —
  // same pattern as the gallery live sync.
  useEffect(() => {
    if (!id) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        setParticipantsRefreshKey((k) => k + 1);
      }
    }, 15000);
    // Also refresh immediately when the photographer comes back to the tab.
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        setParticipantsRefreshKey((k) => k + 1);
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
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

  async function handleDeliver(includeAlreadyDelivered: boolean) {
    if (!job) return;
    setDelivering(true);
    setDeliverResult(null);
    try {
      const result = await deliverJob(job.id, { includeAlreadyDelivered });
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
            {clientLogoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={clientLogoUrl}
                alt={job.client_name ? `${job.client_name} logo` : "Client logo"}
                className="h-9 max-w-[120px] object-contain"
              />
            ) : null}
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
            {/* F5c Deliver button — enabled whenever anyone is emailable
                (photos + email), even if all have been delivered already:
                the modal's resend-to-all checkbox covers that case. */}
            <button
              type="button"
              onClick={() => setDeliverConfirmOpen(true)}
              disabled={!resendableCount || delivering}
              title={
                resendableCount === 0
                  ? "No one to deliver to yet. Participants need a photo and an email."
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
          unsentCount={deliverableCount ?? 0}
          totalCount={resendableCount ?? 0}
          delivering={delivering}
          onCancel={() => setDeliverConfirmOpen(false)}
          onConfirm={async (includeAll) => {
            await handleDeliver(includeAll);
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
              <PicksDetail
                job={job}
                onChanged={(updated) => setJob(updated)}
                editable={job.status !== "archived"}
              />
            </dl>
            <div className="md:col-span-3 flex flex-col gap-4">
              <ShootDayHero job={job} />
              {/* Signup link tucked under the shoot-day hero so the right
                  column owns both 'where + when' and 'how to share'. Hidden
                  when archived since the public page 404s for archived jobs. */}
              {job.status !== "archived" ? (
                <>
                  <SignupLinkBar
                    url={
                      typeof window !== "undefined"
                        ? `${window.location.origin}/s/${job.public_slug}`
                        : `/s/${job.public_slug}`
                    }
                  />
                  {/* HSD-67: live status link for the photographer's client. */}
                  <ClientLinkBar
                    job={job}
                    onJobChanged={(updated) => setJob(updated)}
                  />
                </>
              ) : null}
            </div>
          </div>

          {/* Reference data you read once and never act on: contact address
              and timestamps. Kept (support asks for them) but demoted to a
              single quiet line so the settings above stay the focus. */}
          <p className="mt-8 pt-4 border-t border-muted-200 text-xs text-muted-600">
            {job.client_email ? (
              <>
                Client contact{" "}
                <a
                  href={`mailto:${job.client_email}`}
                  className="text-accent hover:underline"
                >
                  {job.client_email}
                </a>
                {" · "}
              </>
            ) : null}
            Created {new Date(job.created_at).toLocaleDateString()}
            {" · "}
            Updated {new Date(job.updated_at).toLocaleDateString()}
          </p>
        </CollapsibleSection>
      </div>

      {/* HSD-55: schedule section for time-slot jobs — slot settings +
          who booked what. Queue jobs skip it entirely. */}
      {job.shoot_mode === "time_slot" ? (
        <div className="mt-12 border-t border-muted-200 pt-12">
          <ScheduleSection
            job={job}
            refreshKey={participantsRefreshKey}
            onJobChanged={(updated) => setJob(updated)}
          />
        </div>
      ) : null}

      {/* Simple hairline separators between Job details / Participants / Photos.
          Lightweight visual segregation without uppercase zone labels. */}
      <div className="mt-12 border-t border-muted-200 pt-12">
        <ParticipantsSection
          jobId={job.id}
          refreshKey={participantsRefreshKey}
          shootMode={job.shoot_mode}
          publicSlug={job.public_slug}
          onScheduleChanged={() => setParticipantsRefreshKey((k) => k + 1)}
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

// ----------------------------------------------------------------------------
// F5c — Deliver confirmation + result components
// ----------------------------------------------------------------------------

function DeliverConfirmModal({
  jobName,
  unsentCount,
  totalCount,
  delivering,
  onCancel,
  onConfirm,
}: {
  jobName: string;
  /** Participants with photos + email who haven't been delivered yet. */
  unsentCount: number;
  /** Everyone with photos + email, regardless of delivery state. */
  totalCount: number;
  delivering: boolean;
  onCancel: () => void;
  onConfirm: (includeAlreadyDelivered: boolean) => void;
}) {
  const alreadyDelivered = Math.max(totalCount - unsentCount, 0);
  // Resend-to-all checkbox. Default ON when there's no one new to send to —
  // in that case a resend is the only reason to be in this modal.
  const [includeAll, setIncludeAll] = useState(unsentCount === 0);

  const effectiveCount = includeAll ? totalCount : unsentCount;

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
          {effectiveCount === 1
            ? `Email 1 participant on ${jobName} with their gallery link.`
            : `Email ${effectiveCount} participants on ${jobName} with their gallery link.`}
        </p>

        {alreadyDelivered > 0 ? (
          <label className="mt-4 flex items-start gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={includeAll}
              onChange={(e) => setIncludeAll(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-accent cursor-pointer"
            />
            <span className="text-sm text-muted-600">
              Also resend to the{" "}
              {alreadyDelivered === 1
                ? "1 participant who already got"
                : `${alreadyDelivered} participants who already got`}{" "}
              their gallery email.
            </span>
          </label>
        ) : (
          <p className="mt-2 text-xs text-muted-400">
            Already-delivered participants are skipped.
          </p>
        )}

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
            onClick={() => onConfirm(includeAll)}
            disabled={delivering || effectiveCount === 0}
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

// F5b.2 — participant favourites. One checkbox, saved on toggle: a
// separate "how many stars" number next to the download cap read as two
// competing limits. Participants can star as many photos as they're
// allowed to download, which is how packages are actually sold ("pick 1",
// "pick 3"), so the cap simply follows download_cap.
function PicksDetail({
  job,
  onChanged,
  editable,
}: {
  job: Job;
  onChanged: (updated: Job) => void;
  editable: boolean;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle(next: boolean) {
    setSaving(true);
    setError(null);
    try {
      onChanged(
        await updateJob(job.id, {
          picks_enabled: next,
          // Keep the stored cap in step with the download allowance.
          pick_cap: job.download_cap,
        }),
      );
    } catch {
      setError("Couldn't save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  // One line, no label above it, no explanation underneath: the sentence
  // is the setting.
  return (
    <div>
      <dd className="text-sm text-ink">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={job.picks_enabled}
            onChange={(e) => toggle(e.target.checked)}
            disabled={saving || !editable}
            className="accent-accent"
          />
          <span>Participants choose their favourite photos</span>
          {saving ? (
            <span className="text-xs text-muted-600">Saving…</span>
          ) : null}
        </label>
        {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
      </dd>
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
    if (job.download_cap === 0) return "None — downloads are off for now.";
    if (job.download_cap === 1) return "1 photo.";
    return `Up to ${job.download_cap} photos.`;
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
      {/* Paired with the favourites setting below. Both are "per person"
          numbers, which read as the same thing at a glance, so each says
          plainly what it controls: keeping vs. flagging for retouch. */}
      <dt className="text-xs font-medium uppercase tracking-wider text-muted-600">
        Photos each person can download
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

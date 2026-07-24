"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { getJob, getSchedule, type Job, type ScheduleEntry } from "@/lib/jobs";
import {
  listParticipants,
  markShot,
  resetShot,
  type Participant,
} from "@/lib/participants";

/**
 * Shoot queue — the day-of-shoot interface.
 *
 * Photographer workflow:
 *   1. Set Capture One file naming to "Clipboard Contents" rename token.
 *   2. Click a participant in the Pending list → name copied to clipboard.
 *   3. Fire shots in Capture One → files auto-named after the participant.
 *   4. Click "Done" → participant moves to the Shot list.
 *
 * The page is intentionally large-text and minimal because it's used during
 * a live shoot, often glanced at from across the studio.
 */
export default function ShootQueuePage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [job, setJob] = useState<Job | null>(null);
  const [participants, setParticipants] = useState<Participant[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // HSD-55: booked slot per participant on time-slot jobs. Used to order
  // the pending list by appointment and show the time next to each name.
  const [slotByParticipant, setSlotByParticipant] = useState<
    Record<string, ScheduleEntry>
  >({});

  async function loadParticipants() {
    if (!id) return;
    try {
      const res = await listParticipants(id);
      setParticipants(res.items);
    } catch {
      setError("Could not load participants.");
    }
  }

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        const [j] = await Promise.all([getJob(id), loadParticipants()]);
        if (!cancelled) setJob(j);
        if (j.shoot_mode === "time_slot") {
          const entries = await getSchedule(id);
          if (!cancelled) {
            setSlotByParticipant(
              Object.fromEntries(entries.map((e) => [e.participant_id, e])),
            );
          }
        }
      } catch {
        if (!cancelled) setError("Could not load job.");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleSelect(p: Participant) {
    // Copy participant name to clipboard so Capture One's
    // "Clipboard Contents" rename token picks it up on the next shot.
    try {
      await navigator.clipboard.writeText(p.name);
    } catch {
      // Browser blocked clipboard (rare on https). Just continue.
    }
    setActiveId(p.id);
  }

  async function handleMarkShot(p: Participant) {
    setBusy(p.id);
    try {
      await markShot(p.id);
      await loadParticipants();
      // Auto-advance: clear active so the photographer picks the next person.
      setActiveId(null);
    } catch {
      // No-op; state stays consistent on next refresh.
    } finally {
      setBusy(null);
    }
  }

  async function handleReset(p: Participant) {
    setBusy(p.id);
    try {
      await resetShot(p.id);
      await loadParticipants();
    } finally {
      setBusy(null);
    }
  }

  if (error) {
    return (
      <div>
        <Link href={`/jobs/${id}`} className="text-sm text-muted-600 hover:text-ink">
          &larr; Back to job
        </Link>
        <p className="mt-6 text-sm text-red-600">{error}</p>
      </div>
    );
  }
  if (!job || !participants) {
    return <p className="text-sm text-muted-600">Loading…</p>;
  }

  // Time-slot jobs: pending ordered by appointment (unbooked people sink
  // to the bottom alphabetically). Queue jobs keep signup order.
  const slotTimeOf = (p: Participant) =>
    slotByParticipant[p.id]?.slot_start ?? "9999";
  const pending = participants
    .filter((p) => !p.shot_at)
    .sort((a, b) =>
      job.shoot_mode === "time_slot"
        ? slotTimeOf(a).localeCompare(slotTimeOf(b)) ||
          a.name.localeCompare(b.name)
        : 0,
    );
  const shot = participants.filter((p) => p.shot_at);

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href={`/jobs/${id}`}
            className="text-sm text-muted-600 hover:text-ink transition"
          >
            &larr; Back to job
          </Link>
          <h1 className="mt-3 font-display text-3xl sm:text-4xl font-semibold tracking-tight">
            Shooting: {job.name}
          </h1>
          <p className="mt-1 text-sm text-muted-600">
            Click a name to copy it to your clipboard. Capture One picks it up
            automatically using the “Clipboard Contents” rename token.
          </p>
        </div>
        <div className="text-right text-sm text-muted-600">
          <p>
            <span className="text-ink font-medium">{shot.length}</span> shot ·{" "}
            <span className="text-ink font-medium">{pending.length}</span> pending
          </p>
        </div>
      </div>

      {/* Two-column layout: Pending on the left, Already shot on the right.
          Stacks on mobile (single column). */}
      <div className="mt-10 grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">
        {/* Pending */}
        <section>
          <h2 className="font-display text-xl font-semibold tracking-tight">
            Pending ({pending.length})
          </h2>
          {pending.length === 0 ? (
            participants.length === 0 ? (
              <div className="mt-4 rounded-card border border-dashed border-muted-200 bg-paper p-8 text-center">
                <p className="text-sm font-medium text-ink">No participants yet</p>
                <p className="mt-1 text-xs text-muted-600">
                  Add people on the job page, then come back here to start shooting.
                </p>
                <Link
                  href={`/jobs/${id}`}
                  className="mt-3 inline-block text-xs font-medium text-accent hover:underline"
                >
                  Back to job
                </Link>
              </div>
            ) : (
              <div className="mt-4 rounded-card border border-dashed border-muted-200 bg-paper p-8 text-center">
                <p className="text-sm font-medium text-ink">All done</p>
                <p className="mt-1 text-xs text-muted-600">
                  Everyone&apos;s been photographed. Reset anyone if you need to re-shoot.
                </p>
              </div>
            )
          ) : (
            <ul className="mt-4 space-y-3">
              {pending.map((p) => (
                <li key={p.id}>
                  <ShootCard
                    participant={p}
                    slotTime={
                      slotByParticipant[p.id]
                        ? slotByParticipant[p.id].slot_start.slice(11, 16)
                        : null
                    }
                    active={activeId === p.id}
                    busy={busy === p.id}
                    onSelect={() => handleSelect(p)}
                    onMarkShot={() => handleMarkShot(p)}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Already shot */}
        <section>
          <h2 className="font-display text-xl font-semibold tracking-tight text-muted-600">
            Already shot ({shot.length})
          </h2>
          {shot.length === 0 ? (
            <div className="mt-4 rounded-card border border-dashed border-muted-200 bg-paper p-8 text-center">
              <p className="text-sm text-muted-600">
                Nobody photographed yet. Click someone in the Pending list to start.
              </p>
            </div>
          ) : (
            <ul className="mt-4 rounded-card border border-muted-200 bg-paper divide-y divide-muted-200">
              {shot.map((p) => (
                <li
                  key={p.id}
                  className="px-5 py-3 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-ink truncate">{p.name}</p>
                    <p className="text-xs text-muted-600 truncate">
                      {p.email ?? "—"}
                      {p.title ? ` · ${p.title}` : ""}
                      {p.shot_at ? (
                        <>
                          {" "}
                          ·{" "}
                          <span className="text-muted-400">
                            shot {new Date(p.shot_at).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </>
                      ) : null}
                    </p>
                  </div>
                  <button
                    onClick={() => handleReset(p)}
                    disabled={busy === p.id}
                    className="text-xs text-muted-600 hover:text-ink transition shrink-0 disabled:opacity-60"
                  >
                    Reset
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

// --- Big tappable card for the active queue --------------------------------

function ShootCard({
  participant: p,
  slotTime,
  active,
  busy,
  onSelect,
  onMarkShot,
}: {
  participant: Participant;
  /** HSD-55: booked appointment (HH:MM) on time-slot jobs, null otherwise. */
  slotTime?: string | null;
  active: boolean;
  busy: boolean;
  onSelect: () => void;
  onMarkShot: () => void;
}) {
  return (
    <div
      className={
        "rounded-card border bg-paper p-5 sm:p-6 flex flex-wrap items-center justify-between gap-4 transition " +
        (active
          ? "border-accent ring-2 ring-accent/30"
          : "border-muted-200 hover:border-accent")
      }
    >
      <button
        onClick={onSelect}
        className="text-left min-w-0 flex-1 focus:outline-none"
        aria-label={`Select ${p.name}`}
      >
        <p className="font-display text-2xl sm:text-3xl font-semibold tracking-tight text-ink truncate">
          {slotTime ? (
            <span className="mr-2 align-middle inline-block rounded-md bg-accent-muted px-2 py-0.5 font-mono text-base font-semibold text-accent">
              {slotTime}
            </span>
          ) : null}
          {p.name}
        </p>
        <p className="mt-0.5 text-sm text-muted-600 truncate">
          {p.email ?? "—"}
          {p.title ? ` · ${p.title}` : ""}
        </p>
        {active ? (
          <p className="mt-1 text-xs font-medium text-accent">
            Name copied to clipboard. Fire your shots in Capture One.
          </p>
        ) : null}
      </button>
      <button
        onClick={onMarkShot}
        disabled={busy}
        className="btn-primary disabled:opacity-60"
      >
        {busy ? "Saving…" : "Done"}
      </button>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { getJob, getSchedule, type Job, type ScheduleEntry } from "@/lib/jobs";
import {
  listParticipants,
  markShot,
  resetShot,
  setNoShow,
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
  // Live shoots run long lists. Typing a few letters is faster than scrolling
  // when someone turns up out of order.
  const [search, setSearch] = useState("");
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

  async function handleNoShow(p: Participant, noShow: boolean) {
    setBusy(p.id);
    try {
      await setNoShow(p.id, noShow);
      await loadParticipants();
      if (noShow) setActiveId((cur) => (cur === p.id ? null : cur));
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
  // Search matches name, email or title, so "sales" finds a whole department.
  const q = search.trim().toLowerCase();
  const matches = (p: Participant) =>
    !q ||
    [p.name, p.email ?? "", p.title ?? ""].some((f) =>
      f.toLowerCase().includes(q),
    );
  const pending = participants
    .filter((p) => !p.shot_at && !p.no_show_at)
    .filter(matches)
    .sort((a, b) =>
      job.shoot_mode === "time_slot"
        ? slotTimeOf(a).localeCompare(slotTimeOf(b)) ||
          a.name.localeCompare(b.name)
        : 0,
    );
  const shot = participants.filter((p) => p.shot_at).filter(matches);
  // No-shows are parked in their own list rather than deleted: a straggler
  // who turns up later just gets moved back.
  const noShows = participants
    .filter((p) => p.no_show_at && !p.shot_at)
    .filter(matches);
  const pendingTotal = participants.filter(
    (p) => !p.shot_at && !p.no_show_at,
  ).length;

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
            <span className="text-ink font-medium">
              {participants.filter((p) => p.shot_at).length}
            </span>{" "}
            shot ·{" "}
            <span className="text-ink font-medium">{pendingTotal}</span> pending
            {noShows.length ? (
              <>
                {" "}
                ·{" "}
                <span className="text-ink font-medium">
                  {participants.filter((p) => p.no_show_at && !p.shot_at).length}
                </span>{" "}
                no show
              </>
            ) : null}
          </p>
        </div>
      </div>

      {/* Search: fast way to find someone who turns up out of order. */}
      <div className="mt-6 relative max-w-sm">
        {/* type="text", not "search": Chrome draws its own ✕ on search
            inputs, which sat next to ours and looked like a bug. */}
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, email or title"
          className="w-full rounded-input border border-muted-200 bg-paper px-4 py-2.5 pr-9 text-sm text-ink placeholder:text-muted-400 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
        />
        {search ? (
          <button
            onClick={() => setSearch("")}
            aria-label="Clear search"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-400 hover:text-ink transition"
          >
            &times;
          </button>
        ) : null}
      </div>

      {/* Two-column layout: Pending on the left, Already shot on the right.
          Stacks on mobile (single column). */}
      <div className="mt-10 grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">
        {/* Pending */}
        <section>
          {/* While searching, show both numbers: "3" alone next to a filtered
              list reads as the whole job shrinking. */}
          <h2 className="font-display text-xl font-semibold tracking-tight">
            Pending ({q ? `${pending.length} of ${pendingTotal}` : pending.length})
          </h2>
          {pending.length === 0 ? (
            q ? (
              <div className="mt-4 rounded-card border border-dashed border-muted-200 bg-paper p-8 text-center">
                <p className="text-sm text-muted-600">
                  Nobody pending matches &ldquo;{search}&rdquo;.
                </p>
              </div>
            ) : participants.length === 0 ? (
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
                        ? // HSD-71: on a multi-day shoot the time alone is
                          // ambiguous, so prefix the day when the job runs
                          // on more than one date.
                          (job?.extra_shoot_dates?.length
                            ? `${new Date(
                                slotByParticipant[p.id].slot_start.slice(0, 10),
                              ).toLocaleDateString(undefined, {
                                day: "numeric",
                                month: "short",
                              })} · `
                            : "") +
                          slotByParticipant[p.id].slot_start.slice(11, 16)
                        : null
                    }
                    active={activeId === p.id}
                    busy={busy === p.id}
                    onSelect={() => handleSelect(p)}
                    onMarkShot={() => handleMarkShot(p)}
                    onNoShow={() => handleNoShow(p, true)}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Already shot */}
        <section>
          <h2 className="font-display text-xl font-semibold tracking-tight text-muted-600">
            Already shot (
            {q
              ? `${shot.length} of ${participants.filter((p) => p.shot_at).length}`
              : shot.length}
            )
          </h2>
          {shot.length === 0 ? (
            <div className="mt-4 rounded-card border border-dashed border-muted-200 bg-paper p-8 text-center">
              <p className="text-sm text-muted-600">
                {q
                  ? // Without this, searching a name that hasn't been shot
                    // yet claimed nobody had been photographed at all.
                    `Nobody photographed matches “${search}”.`
                  : "Nobody photographed yet. Click someone in the Pending list to start."}
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

      {/* No-shows. Only appears once someone is flagged, so it stays out of
          the way on a shoot where everybody turns up. */}
      {noShows.length > 0 ? (
        <section className="mt-10">
          <h2 className="font-display text-xl font-semibold tracking-tight text-muted-600">
            No shows ({noShows.length})
          </h2>
          <p className="mt-1 text-sm text-muted-600">
            Included in the attendance report you can send your client. If
            someone turns up late, put them back in the queue.
          </p>
          <ul className="mt-4 rounded-card border border-muted-200 bg-paper divide-y divide-muted-200">
            {noShows.map((p) => (
              <li
                key={p.id}
                className="px-5 py-3 flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="font-medium text-ink truncate">{p.name}</p>
                  <p className="text-xs text-muted-600 truncate">
                    {p.email ?? "—"}
                    {p.title ? ` · ${p.title}` : ""}
                    {slotByParticipant[p.id]
                      ? ` · booked ${slotByParticipant[p.id].slot_start.slice(11, 16)}`
                      : ""}
                  </p>
                </div>
                <button
                  onClick={() => handleNoShow(p, false)}
                  disabled={busy === p.id}
                  className="text-xs text-muted-600 hover:text-ink transition shrink-0 disabled:opacity-60"
                >
                  Back to queue
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
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
  onNoShow,
}: {
  participant: Participant;
  /** HSD-55: booked appointment (HH:MM) on time-slot jobs, null otherwise. */
  slotTime?: string | null;
  active: boolean;
  busy: boolean;
  onSelect: () => void;
  onMarkShot: () => void;
  onNoShow: () => void;
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
          <p className="mt-1 flex items-center gap-2 text-xs font-medium text-accent">
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
            </span>
            Shooting now. Name copied to clipboard, fire your shots in Capture One.
          </p>
        ) : null}
      </button>
      <div className="flex items-center gap-3 shrink-0">
        <button
          onClick={onNoShow}
          disabled={busy}
          className="text-xs text-muted-600 hover:text-ink transition disabled:opacity-60"
        >
          No show
        </button>
        <button
          onClick={onMarkShot}
          disabled={busy}
          className="btn-primary disabled:opacity-60"
        >
          {busy ? "Saving…" : "Done"}
        </button>
      </div>
    </div>
  );
}

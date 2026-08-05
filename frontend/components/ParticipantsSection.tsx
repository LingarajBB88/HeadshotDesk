"use client";

import { useEffect, useRef, useState } from "react";

import { ApiError } from "@/lib/api";
import { classifyFormError } from "@/lib/form-errors";
import {
  bookSlotForParticipant,
  cancelParticipantBooking,
  getSchedule,
  type ScheduleEntry,
} from "@/lib/jobs";
import {
  addParticipant,
  deleteParticipant,
  importCsv,
  listParticipants,
  listPublicSlots,
  resendGallery,
  type CsvImportResult,
  type Participant,
  type PublicSlot,
} from "@/lib/participants";

import { CollapsibleSection } from "./CollapsibleSection";
import { FormField } from "./FormField";
import { ParticipantStatusPill } from "./ParticipantStatusPill";
import { SearchInput } from "./SearchInput";

// F5c — per-row gallery resend link. Calls the backend's force-send endpoint;
// disabled (with a tooltip) when the participant has no email or no photos so
// the photographer understands why the action is unavailable.
function ResendGalleryButton({
  participant,
  onResent,
}: {
  participant: Participant;
  onResent: () => Promise<void>;
}) {
  const [sending, setSending] = useState(false);
  const [justSent, setJustSent] = useState(false);
  const blocked = !participant.email
    ? "No email on file"
    : participant.photo_count === 0
      ? "No photos uploaded for this participant yet"
      : null;
  const label = participant.gallery_sent_at ? "Resend" : "Email";

  async function onClick() {
    setSending(true);
    try {
      await resendGallery(participant.id);
      setJustSent(true);
      await onResent();
      window.setTimeout(() => setJustSent(false), 1500);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Could not send.";
      alert(msg);
    } finally {
      setSending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!!blocked || sending}
      title={blocked ?? undefined}
      className="text-xs text-accent hover:underline transition disabled:text-muted-400 disabled:cursor-not-allowed disabled:no-underline"
      aria-label={`${label} gallery to ${participant.name}`}
    >
      {sending ? "Sending…" : justSent ? "Sent!" : label}
    </button>
  );
}

// Small "Delivered Xh ago" indicator — keeps the photographer aware of which
// participants have already been emailed. Pairs with ResendGalleryButton.
function DeliveredIndicator({ sentAt }: { sentAt: string }) {
  const relative = (() => {
    const ms = Date.now() - new Date(sentAt).getTime();
    const mins = Math.round(ms / 60_000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.round(hours / 24);
    return `${days}d ago`;
  })();
  return (
    <span
      className="inline-flex items-center gap-1 text-[11px] text-muted-600"
      title={`Delivered ${new Date(sentAt).toLocaleString()}`}
    >
      <svg viewBox="0 0 16 16" className="h-3 w-3 text-green-600" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <polyline points="3 8 7 12 13 4" />
      </svg>
      Delivered {relative}
    </span>
  );
}

// Shared button for "Copy gallery link" — used in both the mobile card list
// and the desktop table. Briefly shows "Copied!" after a successful copy.
function CopyGalleryLinkButton({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    if (typeof window === "undefined") return;
    const url = `${window.location.origin}/g/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Browsers without clipboard support (or denied permission) — show a
      // prompt as a fallback so the photographer can still get the link out.
      window.prompt("Copy this link:", url);
    }
  }

  return (
    <button
      type="button"
      onClick={onCopy}
      className="text-xs text-accent hover:underline transition"
      aria-label="Copy gallery link"
    >
      {copied ? "Copied!" : "Copy link"}
    </button>
  );
}

// HSD-55 follow-up — the Time cell on time-slot jobs. Shows the booked time
// and lets the photographer assign, move, or clear it via a compact select.
// Options are the free slots plus the participant's current one.
function TimeSlotCell({
  jobId,
  participant,
  entry,
  slots,
  onChanged,
}: {
  jobId: string;
  participant: Participant;
  entry: ScheduleEntry | undefined;
  slots: PublicSlot[];
  onChanged: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const current = entry?.slot_start ?? "";

  async function onChange(value: string) {
    // Guard existing bookings: moving or clearing someone's confirmed time
    // is easy to do by accident from a dropdown, and the participant is
    // counting on that time. New assignments (no current slot) don't ask.
    if (current) {
      const fmt = (iso: string) => iso.slice(11, 16);
      const ok = window.confirm(
        value === ""
          ? `Clear ${participant.name}'s ${fmt(current)} slot? They stay signed up without a time.`
          : `Move ${participant.name} from ${fmt(current)} to ${fmt(value)}?`,
      );
      if (!ok) return;
    }
    setBusy(true);
    try {
      if (value === "") {
        await cancelParticipantBooking(jobId, participant.id);
      } else {
        await bookSlotForParticipant(jobId, participant.id, value);
      }
      await onChanged();
    } catch (err) {
      alert(
        err instanceof ApiError && err.status === 409
          ? "That slot was just taken. Pick another."
          : "Couldn't update the time. Try again?",
      );
      await onChanged();
    } finally {
      setBusy(false);
    }
  }

  const options = slots.filter((s) => s.available || s.start === current);

  return (
    <select
      value={current}
      onChange={(e) => onChange(e.target.value)}
      disabled={busy || slots.length === 0}
      aria-label={`Time slot for ${participant.name}`}
      title={slots.length === 0 ? "Save the slot settings first" : undefined}
      className={
        "rounded-md border px-1.5 py-1 text-xs outline-none focus:border-accent transition disabled:opacity-60 " +
        (current
          ? "border-muted-200 bg-paper font-mono text-ink"
          : "border-dashed border-muted-200 bg-muted-50 text-muted-600")
      }
    >
      <option value="">No time</option>
      {options.map((s) => (
        <option key={s.start} value={s.start}>
          {s.start.slice(11, 16)}
        </option>
      ))}
    </select>
  );
}

type Props = {
  jobId: string;
  /** Bumped by the parent when something elsewhere changes participant photo counts. */
  refreshKey?: number;
  /** HSD-55: when "time_slot", the table gains a Time column with an
      assign/move/clear picker, and the Add form offers a slot. */
  shootMode?: string;
  publicSlug?: string;
  /** Called after a booking changes here, so sibling sections (the Schedule
      grid) can refetch immediately instead of waiting for the next poll. */
  onScheduleChanged?: () => void;
};

export function ParticipantsSection({
  jobId,
  refreshKey = 0,
  shootMode,
  publicSlug,
  onScheduleChanged,
}: Props) {
  const [participants, setParticipants] = useState<Participant[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [importResult, setImportResult] = useState<CsvImportResult | null>(null);
  const [search, setSearch] = useState("");
  const timeSlots = shootMode === "time_slot";
  const [schedule, setSchedule] = useState<ScheduleEntry[]>([]);
  const [slots, setSlots] = useState<PublicSlot[]>([]);
  const slotByParticipant = new Map(
    schedule.map((e) => [e.participant_id, e]),
  );

  // Derived: filtered participants for display. Matches name OR email OR title.
  // On time-slot jobs the running order is what matters on shoot day, so
  // rows sort by booked time (unbooked last), not by name.
  const filteredParticipants = participants
    ? participants
        .filter((p) => {
          if (!search.trim()) return true;
          const q = search.toLowerCase();
          return (
            p.name.toLowerCase().includes(q) ||
            (p.email ?? "").toLowerCase().includes(q) ||
            (p.title ?? "").toLowerCase().includes(q)
          );
        })
        .sort((a, b) => {
          if (!timeSlots) return 0; // queue jobs keep signup order
          const ta = slotByParticipant.get(a.id)?.slot_start ?? "";
          const tb = slotByParticipant.get(b.id)?.slot_start ?? "";
          if (ta && tb) return ta.localeCompare(tb);
          if (ta) return -1;
          if (tb) return 1;
          return a.name.localeCompare(b.name);
        })
    : null;

  async function refresh() {
    try {
      const res = await listParticipants(jobId);
      setParticipants(res.items);
      setError(null);
    } catch {
      setError("Could not load participants.");
    }
    if (timeSlots) {
      // Bookings + availability for the Time column. Failures degrade to an
      // empty picker rather than blocking the participant list.
      try {
        setSchedule(await getSchedule(jobId));
      } catch {
        setSchedule([]);
      }
      if (publicSlug) {
        try {
          setSlots(await listPublicSlots(publicSlug));
        } catch {
          setSlots([]);
        }
      }
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, refreshKey, timeSlots, publicSlug]);

  async function refreshAfterBookingChange() {
    await refresh();
    onScheduleChanged?.();
  }

  async function handleDelete(p: Participant) {
    if (!confirm(`Remove ${p.name}? Their info will be deleted.`)) return;
    try {
      await deleteParticipant(p.id);
      await refresh();
    } catch {
      alert("Could not remove participant.");
    }
  }

  return (
    <CollapsibleSection
      title="Participants"
      count={participants?.length}
      description={
        <>
          Add people manually, upload a CSV, or share the signup link.{" "}
          <a
            href="/help/add-participants"
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent hover:underline"
          >
            Learn more
          </a>
        </>
      }
      defaultOpen={false}
      // Auto-open while searching or while the Add form is open — clicking
      // Add participant on a collapsed section used to toggle an invisible
      // form, so the button appeared to do nothing (live test 2026-07-27).
      forceOpen={search.trim().length > 0 || adding}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {participants && participants.length > 0 ? (
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Search participants…"
            />
          ) : null}
          <button
            onClick={() => setAdding((v) => !v)}
            className="btn-primary text-xs"
          >
            {adding ? "Cancel" : "Add participant"}
          </button>
        </div>
      }
    >
      {adding ? (
        <AddParticipantForm
          jobId={jobId}
          slots={timeSlots ? slots : null}
          onAdded={async () => {
            setAdding(false);
            await refreshAfterBookingChange();
          }}
          onCancel={() => setAdding(false)}
        />
      ) : null}

      <CsvUpload
        jobId={jobId}
        onImported={async (result) => {
          setImportResult(result);
          await refresh();
        }}
      />

      {importResult ? <ImportResultBanner result={importResult} onDismiss={() => setImportResult(null)} /> : null}

      <div className="mt-6">
        {error ? (
          <p className="text-sm text-red-600">{error}</p>
        ) : participants === null ? (
          <p className="text-sm text-muted-600">Loading…</p>
        ) : participants.length === 0 ? (
          <div className="rounded-card border border-dashed border-muted-200 bg-paper p-8 text-center">
            <p className="text-sm text-ink font-medium">No participants yet</p>
            <p className="mt-1 text-xs text-muted-600">
              Use the “Add participant” button, drop a CSV above, or share the signup link with the team.
            </p>
          </div>
        ) : filteredParticipants && filteredParticipants.length === 0 ? (
          <div className="rounded-card border border-dashed border-muted-200 bg-paper p-6 text-center">
            <p className="text-sm text-muted-600">
              No participants match &ldquo;{search}&rdquo;.
            </p>
          </div>
        ) : (
          <>
            {/* Mobile: stacked cards */}
            <ul className="sm:hidden rounded-card border border-muted-200 bg-paper divide-y divide-muted-200">
              {(filteredParticipants ?? participants).map((p) => (
                <li key={p.id} className="px-5 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium truncate">{p.name}</p>
                      <ParticipantStatusPill p={p} />
                    </div>
                    <p className="mt-0.5 text-xs text-muted-600 truncate">
                      {p.email ?? "—"}
                      {p.title ? ` · ${p.title}` : ""}
                    </p>
                    {timeSlots ? (
                      <div className="mt-1">
                        <TimeSlotCell
                          jobId={jobId}
                          participant={p}
                          entry={slotByParticipant.get(p.id)}
                          slots={slots}
                          onChanged={refreshAfterBookingChange}
                        />
                      </div>
                    ) : null}
                    {p.gallery_sent_at ? (
                      <div className="mt-1">
                        <DeliveredIndicator sentAt={p.gallery_sent_at} />
                      </div>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <CopyGalleryLinkButton token={p.gallery_token} />
                    <ResendGalleryButton participant={p} onResent={refresh} />
                    <button
                      onClick={() => handleDelete(p)}
                      className="text-xs text-muted-600 hover:text-red-600 transition"
                      aria-label={`Remove ${p.name}`}
                    >
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>

            {/* Desktop: table */}
            <div className="hidden sm:block overflow-hidden rounded-card border border-muted-200 bg-paper">
              <table className="w-full text-sm">
                <thead className="bg-muted-50 text-left text-xs font-medium uppercase tracking-wider text-muted-600">
                  <tr>
                    <th className="px-5 py-3">Name</th>
                    <th className="px-5 py-3">Email</th>
                    <th className="px-5 py-3">Title</th>
                    {timeSlots ? <th className="px-5 py-3">Time</th> : null}
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-muted-200">
                  {(filteredParticipants ?? participants).map((p) => (
                    <tr key={p.id} className="hover:bg-muted-50 transition">
                      <td className="px-5 py-3 font-medium">{p.name}</td>
                      <td className="px-5 py-3 text-muted-600">
                        {p.email ?? "—"}
                      </td>
                      <td className="px-5 py-3 text-muted-600">
                        {p.title ?? "—"}
                      </td>
                      {timeSlots ? (
                        <td className="px-5 py-3">
                          <TimeSlotCell
                            jobId={jobId}
                            participant={p}
                            entry={slotByParticipant.get(p.id)}
                            slots={slots}
                            onChanged={refreshAfterBookingChange}
                          />
                        </td>
                      ) : null}
                      <td className="px-5 py-3">
                        <div className="flex flex-col gap-1">
                          <ParticipantStatusPill p={p} />
                          {p.gallery_sent_at ? (
                            <DeliveredIndicator sentAt={p.gallery_sent_at} />
                          ) : null}
                          {/* F5b.2: their favourites, so you know whose
                              retouch set is decided. */}
                          {p.picks_used ? (
                            <span
                              className="text-[11px] text-amber-600"
                              title="Photos this participant starred"
                            >
                              ★ {p.picks_used} starred
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="inline-flex items-center gap-4">
                          <CopyGalleryLinkButton token={p.gallery_token} />
                          <ResendGalleryButton
                            participant={p}
                            onResent={refresh}
                          />
                          <button
                            onClick={() => handleDelete(p)}
                            className="text-xs text-muted-600 hover:text-red-600 transition"
                            aria-label={`Remove ${p.name}`}
                          >
                            Remove
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </CollapsibleSection>
  );
}

// --- Add participant form ---------------------------------------------------

function AddParticipantForm({
  jobId,
  slots,
  onAdded,
  onCancel,
}: {
  jobId: string;
  /** HSD-55: available slots for the optional time picker on time-slot
      jobs; null hides the picker (queue jobs). */
  slots: PublicSlot[] | null;
  onAdded: () => Promise<void>;
  onCancel: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [slot, setSlot] = useState<string>("");
  const availableSlots = slots?.filter((s) => s.available) ?? [];

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    setFieldErrors({});
    setSubmitting(true);
    try {
      const data = new FormData(e.currentTarget);
      const created = await addParticipant(jobId, {
        name: String(data.get("name") ?? "").trim(),
        email: (String(data.get("email") ?? "").trim()) || null,
        title: (String(data.get("title") ?? "").trim()) || null,
      });
      // Book the chosen time right after the add. A lost race isn't worth
      // failing the whole add over: the person is in, they just need a
      // different time from the Time column.
      if (slot) {
        try {
          await bookSlotForParticipant(jobId, created.id, slot);
        } catch {
          alert(
            `${created.name} was added, but that time was just taken. ` +
              "Assign another from the Time column.",
          );
        }
      }
      await onAdded();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setFieldErrors({ email: err.message });
      } else {
        const c = classifyFormError(err);
        if (c.fieldErrors) setFieldErrors(c.fieldErrors);
        else if (c.formError) setFormError(c.formError);
        else setFormError("Something went wrong. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mt-4 rounded-card border border-muted-200 bg-muted-50 p-4"
      noValidate
    >
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <FormField label="Name" name="name" required error={fieldErrors.name} />
        <FormField
          label="Email"
          name="email"
          type="email"
          error={fieldErrors.email}
        />
        <FormField label="Title" name="title" error={fieldErrors.title} />
      </div>
      {slots !== null ? (
        <label className="block mt-3 mb-3">
          <span className="block text-xs font-medium text-muted-600">
            Time slot (optional)
          </span>
          <select
            value={slot}
            onChange={(e) => setSlot(e.target.value)}
            disabled={availableSlots.length === 0}
            className="mt-1 rounded-md border border-muted-200 bg-paper px-2 py-1.5 text-sm outline-none focus:border-accent disabled:opacity-60"
          >
            <option value="">
              {availableSlots.length === 0
                ? "No open slots"
                : "No time yet (walk-in)"}
            </option>
            {availableSlots.map((s) => (
              <option key={s.start} value={s.start}>
                {s.start.slice(11, 16)}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {formError ? (
        <p className="text-sm text-red-600 mb-2" role="alert">
          {formError}
        </p>
      ) : null}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="btn-primary text-xs disabled:opacity-60"
        >
          {submitting ? "Adding…" : "Add"}
        </button>
        <button type="button" onClick={onCancel} className="btn-secondary text-xs">
          Cancel
        </button>
      </div>
    </form>
  );
}

// --- CSV upload -------------------------------------------------------------

function downloadCsvTemplate() {
  // Just the header row — keeps the file unambiguous, no dummy data to
  // delete. `time` is optional and books the slot on import.
  const csv = "name,email,title,time\n";
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "headshotdesk-participants-template.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function CsvUpload({
  jobId,
  onImported,
}: {
  jobId: string;
  onImported: (result: CsvImportResult) => Promise<void>;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  async function handleFile(file: File) {
    setError(null);
    setUploading(true);
    try {
      const result = await importCsv(jobId, file);
      await onImported(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "CSV upload failed.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="mt-4 rounded-card border border-dashed border-muted-200 bg-paper p-4 flex flex-wrap items-center gap-3 justify-between">
      <div className="text-xs text-muted-600">
        Upload a CSV, Excel or Numbers file with columns{" "}
        <code className="bg-muted-50 px-1 rounded">name</code>,{" "}
        <code className="bg-muted-50 px-1 rounded">email</code>,{" "}
        <code className="bg-muted-50 px-1 rounded">title</code>,{" "}
        <code className="bg-muted-50 px-1 rounded">time</code> (header row
        required, only <code className="bg-muted-50 px-1 rounded">name</code>{" "}
        mandatory). A time like{" "}
        <code className="bg-muted-50 px-1 rounded">09:20</code> books that
        slot straight away. New to this?{" "}
        <button
          onClick={downloadCsvTemplate}
          className="text-accent hover:underline"
          type="button"
        >
          Download a blank template
        </button>
        .
      </div>
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.tsv,.txt,.xlsx,.xlsm,.numbers,text/csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="btn-secondary text-xs disabled:opacity-60"
          type="button"
        >
          {uploading ? "Uploading…" : "Choose CSV"}
        </button>
      </div>
      {error ? (
        <p className="basis-full text-sm text-red-600 mt-1">{error}</p>
      ) : null}
    </div>
  );
}

// --- Import result banner ---------------------------------------------------

function ImportResultBanner({
  result,
  onDismiss,
}: {
  result: CsvImportResult;
  onDismiss: () => void;
}) {
  return (
    <div className="mt-4 rounded-card border border-accent-muted bg-accent-muted p-4 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium text-ink">
            Imported {result.created} participant{result.created === 1 ? "" : "s"}.
            {result.skipped_duplicates > 0
              ? ` Skipped ${result.skipped_duplicates} duplicate${result.skipped_duplicates === 1 ? "" : "s"}.`
              : ""}
            {result.slots_booked
              ? ` Booked ${result.slots_booked} time${result.slots_booked === 1 ? "" : "s"} from the file.`
              : ""}
          </p>
          {result.errors.length > 0 ? (
            <ul className="mt-2 text-xs text-muted-600 list-disc pl-5 space-y-0.5">
              {result.errors.slice(0, 8).map((err, i) => (
                <li key={i}>{err}</li>
              ))}
              {result.errors.length > 8 ? (
                <li>…and {result.errors.length - 8} more.</li>
              ) : null}
            </ul>
          ) : null}
        </div>
        <button onClick={onDismiss} className="text-xs text-muted-600 hover:text-ink">
          Dismiss
        </button>
      </div>
    </div>
  );
}

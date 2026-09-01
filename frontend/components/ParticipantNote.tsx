"use client";

// The photographer's private note on one participant.
//
// Written between frames ("glasses off", "reshoot, blinked in every one")
// and read days later in front of an editor. Two rules shape the design:
//
// 1. On shoot day the photographer has a camera in one hand. Adding a note
//    must not cost a dialog, a save button, or a page state to get out of.
//    So: collapsed to a single line until clicked, saves on blur, no modal.
//
// 2. It is never shown to the participant or the client. That is enforced
//    server-side by PublicParticipantOut and the client dashboard schema,
//    not here, but the label says so out loud because someone deciding how
//    bluntly to phrase a note deserves to know who can read it.

import { useEffect, useRef, useState } from "react";

import { setParticipantNotes, type Participant } from "@/lib/participants";

export function ParticipantNote({
  participant,
  onSaved,
  compact = false,
}: {
  participant: Participant;
  onSaved?: (updated: Participant) => void;
  /** Denser presentation for list rows, where space is tight. */
  compact?: boolean;
}) {
  const saved = participant.notes ?? "";
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(saved);
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const ref = useRef<HTMLTextAreaElement>(null);

  // A note edited elsewhere (another tab, the participants table) should
  // win over a stale local copy, but never while it is being typed into.
  useEffect(() => {
    if (!open) setValue(saved);
  }, [saved, open]);

  useEffect(() => {
    if (open) ref.current?.focus();
  }, [open]);

  async function save() {
    const next = value.trim();
    setOpen(false);
    if (next === saved.trim()) return; // Nothing changed, no request.
    setStatus("saving");
    try {
      const updated = await setParticipantNotes(participant.id, next || null);
      setStatus("idle");
      onSaved?.(updated);
    } catch {
      // Keep what they typed on screen. Losing a note written mid-shoot
      // because the wifi dipped would be worse than an error message.
      setStatus("error");
      setOpen(true);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          "block w-full text-left " +
          (compact ? "text-xs" : "text-sm") +
          (saved
            ? " text-muted-600 hover:text-ink"
            : " text-muted-600/70 hover:text-accent")
        }
        title="Private note, only you see this"
      >
        {saved ? (
          <span className="whitespace-pre-line">{saved}</span>
        ) : (
          <span>+ Note</span>
        )}
        {status === "saving" ? (
          <span className="ml-2 text-xs text-muted-600">Saving…</span>
        ) : null}
      </button>
    );
  }

  return (
    <div>
      <textarea
        ref={ref}
        value={value}
        maxLength={2000}
        rows={compact ? 2 : 3}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          // Escape abandons the edit. Cmd/Ctrl+Enter saves without
          // reaching for the mouse, which matters with a camera in hand.
          if (e.key === "Escape") {
            setValue(saved);
            setOpen(false);
          }
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            (e.target as HTMLTextAreaElement).blur();
          }
        }}
        placeholder="Glasses off. Retouch: soften the scar, she asked."
        className="w-full rounded-md border border-muted-200 bg-paper px-2 py-1.5 text-sm outline-none focus:border-accent"
      />
      <p className="mt-0.5 text-xs text-muted-600">
        {status === "error"
          ? "Couldn't save. Click away to try again."
          : "Private to you. Participants and clients never see this."}
      </p>
    </div>
  );
}

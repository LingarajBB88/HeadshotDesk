"use client";

import { useState } from "react";

/**
 * HSD-65 — "Send this to a client you're pitching."
 *
 * Photographers close more shoots when the client can see what the
 * experience will be like rather than hearing it described. This copies a
 * link to the client-facing benefits page, personalized with the studio
 * name so it reads as the photographer's own material.
 */
export function PitchLinkCard({ studioName }: { studioName: string }) {
  const [copied, setCopied] = useState(false);

  const url =
    typeof window !== "undefined"
      ? `${window.location.origin}/for-clients?studio=${encodeURIComponent(studioName)}`
      : "/for-clients";

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt("Copy this link:", url);
    }
  }

  return (
    <div className="rounded-card border border-accent/30 bg-accent-muted p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-ink">
            Pitching a shoot? Send this to your client
          </h2>
          <p className="mt-1 text-sm text-muted-600 max-w-2xl">
            A page written for the person booking you: how little work it is
            for them, what their colleagues experience, and the privacy
            questions their HR team will ask. It carries your studio name.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button type="button" onClick={copy} className="btn-primary text-xs">
            {copied ? "Copied!" : "Copy link"}
          </button>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary text-xs"
          >
            Preview
          </a>
        </div>
      </div>
    </div>
  );
}

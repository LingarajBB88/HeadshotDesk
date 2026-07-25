"use client";

import { useState } from "react";

import { revokeClientLink, shareClientLink, type Job } from "@/lib/jobs";

/**
 * HSD-67 — Share bar for the client dashboard (/c/{token}).
 * The photographer's client (HR contact, coordinator) bookmarks the link
 * and watches signups, bookings, and delivery progress live, without
 * pinging the photographer. Token-only; revoking kills the link instantly.
 */
export function ClientLinkBar({
  job,
  onJobChanged,
}: {
  job: Job;
  onJobChanged: (updated: Job) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const url =
    job.client_token && typeof window !== "undefined"
      ? `${window.location.origin}/c/${job.client_token}`
      : null;

  async function handleShare() {
    setBusy(true);
    try {
      const res = await shareClientLink(job.id);
      onJobChanged({ ...job, client_token: res.client_token });
    } catch {
      alert("Couldn't create the client link. Try again?");
    } finally {
      setBusy(false);
    }
  }

  async function handleRevoke() {
    if (
      !confirm(
        "Revoke the client dashboard link? Anyone holding it loses access immediately.",
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      await revokeClientLink(job.id);
      onJobChanged({ ...job, client_token: null });
    } catch {
      alert("Couldn't revoke the link. Try again?");
    } finally {
      setBusy(false);
    }
  }

  async function handleCopy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt("Copy this link:", url);
    }
  }

  return (
    <div className="rounded-card border border-muted-200 bg-paper p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink">Client dashboard</p>
          <p className="mt-0.5 text-xs text-muted-600">
            A live progress page for your client: signups, bookings, and
            delivery status. No login needed, no emails shown.
          </p>
        </div>
      </div>
      {url ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-md bg-muted-50 px-2 py-1.5 text-xs text-muted-600">
            {url}
          </code>
          <button
            type="button"
            onClick={handleCopy}
            className="btn-secondary text-xs"
          >
            {copied ? "Copied!" : "Copy link"}
          </button>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-accent hover:underline"
          >
            Open
          </a>
          <button
            type="button"
            onClick={handleRevoke}
            disabled={busy}
            className="text-xs text-muted-600 hover:text-red-600 transition"
          >
            Revoke
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={handleShare}
          disabled={busy}
          className="btn-secondary text-xs mt-3 disabled:opacity-60"
        >
          {busy ? "Creating…" : "Share client dashboard"}
        </button>
      )}
    </div>
  );
}

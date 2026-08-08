"use client";

import { useState } from "react";

/**
 * Compact bar showing the public signup URL with copy + open-in-new-tab.
 * Designed to live near the top of the job detail page so it's easy to share.
 */
export function SignupLinkBar({
  url,
  jobId,
}: {
  url: string;
  /** When given, offers a printable QR card for the booth. */
  jobId?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Browser may block clipboard in non-HTTPS contexts; user can still copy manually.
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-card border border-muted-200 bg-paper p-3">
      <span className="text-xs font-medium text-muted-600 shrink-0">
        Signup link:
      </span>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs font-mono text-accent hover:underline truncate flex-1 min-w-0"
        title="Open signup page in a new tab"
      >
        {url} ↗
      </a>
      <button
        onClick={handleCopy}
        className="btn-secondary text-xs shrink-0"
        type="button"
      >
        {copied ? "Copied!" : "Copy"}
      </button>
      {/* The card is what actually gets used on the day: people scan it at
          the booth instead of you typing their details in. */}
      {jobId ? (
        <a
          href={`/jobs/${jobId}/qr`}
          target="_blank"
          rel="noopener"
          className="btn-secondary text-xs shrink-0"
        >
          QR card
        </a>
      ) : null}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";

import { getStudio } from "@/lib/studio";

/**
 * Compact bar showing the public signup URL with copy + open-in-new-tab.
 * Designed to live near the top of the job detail page so it's easy to share.
 *
 * Also the place we mention Settings. The studio profile is invisible until
 * someone fills it in, so an empty one gives no hint that it exists or that
 * it changes what participants see. Here is where a photographer is looking
 * at the exact page those details would appear on, which is the only moment
 * the suggestion is worth anything.
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
  // Null while we don't know yet, so the hint never flashes in and out for
  // someone who has already filled everything in.
  const [studioEmpty, setStudioEmpty] = useState<boolean | null>(null);
  const [hintDismissed, setHintDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await getStudio();
        if (cancelled) return;
        setStudioEmpty(
          !s.website_url &&
            !s.contact_email &&
            !s.contact_phone &&
            !s.portrait_url &&
            (s.links?.length ?? 0) === 0,
        );
      } catch {
        // A failed lookup means no hint. Nagging someone because a request
        // timed out would be worse than staying quiet.
        if (!cancelled) setStudioEmpty(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setHintDismissed(
      typeof window !== "undefined" &&
        window.localStorage.getItem("hd_studio_hint_dismissed") === "1",
    );
  }, []);

  function dismissHint() {
    setHintDismissed(true);
    try {
      window.localStorage.setItem("hd_studio_hint_dismissed", "1");
    } catch {
      // Private browsing. The hint comes back next time; harmless.
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Browser may block clipboard in non-HTTPS contexts; user can still copy manually.
    }
  }

  const showHint = studioEmpty === true && !hintDismissed;

  return (
    <div className="rounded-card border border-muted-200 bg-paper p-3">
    <div className="flex flex-wrap items-center gap-2">
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

      {showHint ? (
        <p className="mt-2.5 flex flex-wrap items-center gap-x-2 border-t border-muted-200 pt-2.5 text-xs text-muted-600">
          <span>
            Right now this page doesn&apos;t say who you are. Add your
            website and contact details in{" "}
            <a href="/settings" className="text-accent hover:underline">
              Settings
            </a>{" "}
            so participants can reach you.
          </span>
          <button
            onClick={dismissHint}
            type="button"
            className="ml-auto shrink-0 text-muted-600 transition hover:text-ink"
          >
            Dismiss
          </button>
        </p>
      ) : null}
    </div>
  );
}

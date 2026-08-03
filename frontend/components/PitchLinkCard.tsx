"use client";

import { useEffect, useState } from "react";

import { fetchMe } from "@/lib/auth";

/**
 * HSD-65 — "Send this to a client you're pitching."
 *
 * Photographers close more shoots when the client can see what the
 * experience will be like rather than hearing it described. This copies a
 * link to the client-facing benefits page, personalized with the studio
 * name so it reads as the photographer's own material.
 *
 * Two shapes: the full card for the jobs home, and a compact one for the
 * job page's share column, where it sits next to the signup link and the
 * client dashboard link — the place a photographer is already thinking
 * about what to send someone.
 */
export function PitchLinkCard({
  studioName,
  variant = "full",
}: {
  /** Omit to resolve the studio name from the session. */
  studioName?: string;
  variant?: "full" | "compact";
}) {
  const [copied, setCopied] = useState(false);
  const [studio, setStudio] = useState<string | null>(studioName ?? null);

  useEffect(() => {
    if (studioName) {
      setStudio(studioName);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const me = await fetchMe();
        if (!cancelled) setStudio(me?.account.name ?? null);
      } catch {
        /* card just stays hidden */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [studioName]);

  if (!studio) return null;

  const url =
    typeof window !== "undefined"
      ? `${window.location.origin}/for-clients?studio=${encodeURIComponent(studio)}`
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

  if (variant === "compact") {
    return (
      <div className="rounded-card border border-muted-200 bg-paper p-4">
        <p className="text-sm font-medium text-ink">Pitch another client</p>
        <p className="mt-0.5 text-xs text-muted-600">
          A page that sells the shoot for you, in your studio&apos;s name.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={copy}
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
            Preview
          </a>
          <a
            href="/sample"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-accent hover:underline"
            title="The clickable participant walkthrough your client can try"
          >
            Sample experience
          </a>
        </div>
      </div>
    );
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
          <a
            href="/sample"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-accent hover:underline whitespace-nowrap"
            title="The clickable participant walkthrough your client can try"
          >
            Sample experience
          </a>
        </div>
      </div>
    </div>
  );
}

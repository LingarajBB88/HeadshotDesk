"use client";

import { useEffect, useState } from "react";

import { fetchMe } from "@/lib/auth";

/**
 * "Put the sample experience on your own website."
 *
 * A copy-paste HTML block: an iframe of /embed/sample carrying the studio
 * name, plus a few lines of script that let the frame follow the height of
 * the step being shown. Site builders that strip scripts still get a
 * working frame at the fixed starting height.
 */
export function embedSnippet(origin: string, studio: string): string {
  const src = `${origin}/embed/sample?studio=${encodeURIComponent(studio)}`;
  return [
    `<iframe id="headshotdesk-sample" src="${src}" title="Sample headshot day experience" loading="lazy" style="width:100%;height:900px;border:0;border-radius:12px;"></iframe>`,
    `<script>window.addEventListener("message",function(e){if(e.origin!=="${origin}"||!e.data||e.data.type!=="headshotdesk:height")return;var f=document.getElementById("headshotdesk-sample");if(f)f.style.height=e.data.height+"px";});</script>`,
  ].join("\n");
}

export function EmbedSnippetCard() {
  const [studio, setStudio] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
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
  }, []);

  if (!studio || typeof window === "undefined") return null;

  const origin = window.location.origin;
  const snippet = embedSnippet(origin, studio);
  const preview = `${origin}/embed/sample?studio=${encodeURIComponent(studio)}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setOpen(true);
    }
  }

  return (
    <div className="rounded-card border border-muted-200 bg-paper p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-ink">
            Show the experience on your own website
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-600">
            A block of HTML for your headshots page. Visitors click through
            the signup, the time slots and a sample gallery without leaving
            your site. It carries your studio name and uses drawn
            placeholders, never real photos.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button type="button" onClick={copy} className="btn-primary text-xs">
            {copied ? "Copied!" : "Copy HTML"}
          </button>
          <a
            href={preview}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary text-xs"
          >
            Preview
          </a>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="whitespace-nowrap text-xs text-accent hover:underline"
          >
            {open ? "Hide code" : "Show code"}
          </button>
        </div>
      </div>
      {open ? (
        <>
          <textarea
            readOnly
            value={snippet}
            rows={5}
            onFocus={(e) => e.currentTarget.select()}
            aria-label="HTML to paste into your website"
            className="mt-4 w-full rounded-md border border-muted-200 bg-muted-50 p-3 font-mono text-xs text-ink"
          />
          <p className="mt-2 text-xs text-muted-600">
            Paste it into an HTML or embed block: Code block on Squarespace,
            Embed HTML on Wix, Custom HTML on WordPress, Embed code on Showit.
          </p>
        </>
      ) : null}
    </div>
  );
}

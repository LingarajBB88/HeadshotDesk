"use client";

import Link from "next/link";
import { useRef, useState } from "react";

import { createDemoJob, type DemoJobResult } from "@/lib/admin";

/**
 * Admin-only: build the walkthrough demo job (HSD-81) from a folder of
 * headshots. Lives in the admin's own account; building again replaces
 * the previous demo, so every walkthrough starts from the same state.
 */
export function DemoJobCard() {
  const input = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DemoJobResult | null>(null);

  async function build() {
    if (!files.length) return;
    setBusy(true);
    setError(null);
    try {
      setResult(await createDemoJob(files));
      setFiles([]);
      if (input.current) input.current.value = "";
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-10 rounded-card border border-muted-200 bg-paper p-5">
      <h2 className="text-lg font-semibold text-ink">Demo job</h2>
      <p className="mt-1 max-w-2xl text-sm text-muted-600">
        Builds a two-day team shoot in your account for walkthroughs: day one
        photographed and mostly delivered, with favourites, a download, a no
        show and private notes; day two booked and waiting. Choose headshots
        you have permission to show. Files named after a person
        (&ldquo;Mara Visser_001.jpg&rdquo;) keep that name; others get a
        made-up one. Building again replaces the previous demo. Nobody is
        emailed.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
          className="text-sm text-muted-600 file:mr-3 file:rounded-md file:border file:border-muted-200 file:bg-paper file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-ink"
        />
        <button
          type="button"
          onClick={build}
          disabled={busy || files.length === 0}
          className="btn-primary text-sm disabled:opacity-60"
        >
          {busy ? "Building…" : `Build demo job${files.length ? ` from ${files.length} photos` : ""}`}
        </button>
      </div>
      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
      {result ? (
        <p className="mt-3 text-sm text-green-700">
          Ready: {result.people_photographed} people photographed, {result.photos} photos,{" "}
          {result.day_two_bookings} booked for day two.{" "}
          <Link href={`/jobs/${result.job_id}`} className="font-medium text-accent hover:underline">
            Open the demo job
          </Link>
        </p>
      ) : null}
    </div>
  );
}

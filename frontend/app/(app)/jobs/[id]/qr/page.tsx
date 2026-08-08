"use client";

// Printable QR card for the booth. The photographer prints this, stands it
// next to the camera, and walk-ins scan it instead of dictating their name
// and email across a busy room.
//
// Deliberately not a modal: printing needs a real page so the browser's own
// print dialog handles paper size and margins.

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { getJob, type Job } from "@/lib/jobs";

export default function SignupQrPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  // What the client's staff will actually be told to do. Time-slot jobs say
  // "pick a time"; walk-up jobs say "join the queue".
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        const j = await getJob(id);
        if (!cancelled) setJob(j);
      } catch {
        if (!cancelled) setError("Could not load this job.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!job) return <p className="text-sm text-muted-600">Loading…</p>;

  const apiBase =
    process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
  const qrSrc = `${apiBase}/api/v1/public/jobs/${job.public_slug}/qr.svg`;
  const signupUrl = `${origin}/s/${job.public_slug}`;
  const timeSlots = job.shoot_mode === "time_slot";

  return (
    <div>
      {/* Toolbar: screen only. */}
      <div className="print:hidden flex flex-wrap items-center justify-between gap-3">
        <Link
          href={`/jobs/${job.id}`}
          className="text-sm text-muted-600 hover:text-ink transition"
        >
          &larr; Back to job
        </Link>
        <div className="flex items-center gap-2">
          <a
            href={qrSrc}
            download={`${job.public_slug}-qr.svg`}
            className="btn-secondary text-xs"
          >
            Download QR
          </a>
          <button onClick={() => window.print()} className="btn-primary text-xs">
            Print card
          </button>
        </div>
      </div>

      <p className="print:hidden mt-4 max-w-2xl text-sm text-muted-600">
        Print this and stand it next to the camera. Anyone who scans it lands
        on the signup page, so walk-ins add themselves instead of you typing
        their details in mid shoot.
      </p>

      {/* The card itself. Fixed aspect so what you see is what prints. */}
      <div className="mt-6 print:mt-0 flex justify-center">
        <div className="w-full max-w-xl rounded-card border border-muted-200 bg-paper px-10 py-12 text-center print:border-0 print:shadow-none print:max-w-none">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-600">
            {job.client_name || "Headshots"}
          </p>
          <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight text-ink">
            {timeSlots ? "Book your headshot" : "Join the headshot queue"}
          </h1>
          <p className="mt-3 text-base text-muted-600">
            {timeSlots
              ? "Scan to pick a time that suits you."
              : "Scan to add your name. We'll photograph you in order."}
          </p>

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qrSrc}
            alt={`QR code linking to ${signupUrl}`}
            className="mx-auto mt-8 h-64 w-64"
          />

          <p className="mt-6 break-all font-mono text-sm text-muted-600">
            {signupUrl}
          </p>

          <div className="mt-8 border-t border-muted-200 pt-5 text-sm text-muted-600">
            <p className="font-medium text-ink">{job.name}</p>
            {job.location ? <p className="mt-0.5">{job.location}</p> : null}
            {job.shoot_date ? (
              <p className="mt-0.5">
                {new Date(job.shoot_date).toLocaleDateString(undefined, {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                })}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

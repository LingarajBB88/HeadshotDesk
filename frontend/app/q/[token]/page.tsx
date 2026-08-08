"use client";

// Live queue position for walk-up shoots. A participant signs up, keeps this
// page open on their phone, and can go back to their desk instead of standing
// in a line. Polls every 20 seconds while the tab is visible.
//
// Walk-up jobs have no appointments on purpose. What people want isn't a time
// on a calendar, it's an answer to "how long?" — so that's what this shows.

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

import { Logo } from "@/components/Logo";
import { api, ApiError } from "@/lib/api";

type QueueStatus = {
  name: string;
  job_name: string;
  status: "waiting" | "next" | "photographed" | "missed";
  position: number | null;
  people_ahead: number;
  estimated_wait_minutes: number | null;
  estimated_time: string | null;
  pace_measured: boolean;
  queue_length: number;
};

const POLL_MS = 20_000;

export default function QueuePage() {
  const params = useParams<{ token: string }>();
  const token = params.token;

  const [data, setData] = useState<QueueStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    async function load() {
      try {
        const d = await api<QueueStatus>(`/api/v1/public/queue/${token}`);
        if (!cancelled) {
          setData(d);
          setError(null);
        }
      } catch (e) {
        if (cancelled) return;
        setError(
          e instanceof ApiError && e.status === 404
            ? "We couldn't find your place in the queue. Check the link, or ask your photographer."
            : "Couldn't refresh just now. Trying again shortly.",
        );
      }
    }

    load();
    // Pause polling on a backgrounded tab: a phone in someone's pocket
    // shouldn't keep hitting the API for twenty minutes.
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [token]);

  return (
    <main className="min-h-dvh bg-muted-50 px-4 py-10">
      <div className="mx-auto max-w-md">
        <div className="mb-6 flex justify-center">
          <Logo size="sm" wordmark />
        </div>

        <div className="rounded-dialog border border-muted-200 bg-paper p-8 text-center shadow-sm">
          {!data && error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : !data ? (
            <p className="text-sm text-muted-600">Loading…</p>
          ) : data.status === "photographed" ? (
            <>
              <h1 className="font-display text-3xl font-semibold tracking-tight">
                All done
              </h1>
              <p className="mt-3 text-sm text-muted-600">
                You&apos;ve been photographed. Your gallery arrives by email
                once the photos are ready.
              </p>
            </>
          ) : data.status === "missed" ? (
            <>
              <h1 className="font-display text-3xl font-semibold tracking-tight">
                You&apos;re out of the queue
              </h1>
              <p className="mt-3 text-sm text-muted-600">
                You were marked as not attending. Have a word with your
                photographer if you&apos;d still like a headshot.
              </p>
            </>
          ) : data.status === "next" ? (
            <>
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-accent">
                You&apos;re next
              </p>
              <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight">
                Head over now
              </h1>
              <p className="mt-3 text-sm text-muted-600">
                {data.name}, you&apos;re at the front of the queue for{" "}
                <strong className="text-ink">{data.job_name}</strong>.
              </p>
            </>
          ) : (
            <>
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-600">
                Your place in the queue
              </p>
              <p className="mt-4 font-display text-6xl font-semibold tracking-tight text-ink">
                {data.position}
              </p>
              <p className="mt-2 text-sm text-muted-600">
                {data.people_ahead === 1
                  ? "1 person ahead of you"
                  : `${data.people_ahead} people ahead of you`}
              </p>

              {data.estimated_wait_minutes !== null ? (
                <div className="mt-6 rounded-card bg-accent-muted px-5 py-4">
                  <p className="text-sm text-accent">
                    {data.pace_measured ? "Roughly" : "Very roughly"}{" "}
                    <strong>
                      {data.estimated_wait_minutes < 1
                        ? "a couple of minutes"
                        : `${data.estimated_wait_minutes} minutes`}
                    </strong>
                    {data.estimated_time ? (
                      <>
                        , so around{" "}
                        <strong>
                          {new Date(data.estimated_time).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </strong>
                      </>
                    ) : null}
                    .
                  </p>
                  {!data.pace_measured ? (
                    <p className="mt-1.5 text-xs text-accent/80">
                      The estimate sharpens once a few people have been
                      photographed.
                    </p>
                  ) : null}
                </div>
              ) : null}

              <p className="mt-6 text-xs text-muted-600">
                Keep this page open. It updates on its own, so you can carry on
                with your day and come back when you&apos;re near the front.
              </p>
            </>
          )}

          {data && error ? (
            <p className="mt-4 text-xs text-muted-400">{error}</p>
          ) : null}
        </div>
      </div>
    </main>
  );
}

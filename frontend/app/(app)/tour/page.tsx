"use client";

// Product tour for photographers.
//
// A self-contained walkthrough rather than an overlay on the real app. A
// brand-new account is empty, and pointing at an empty jobs list saying
// "here are your jobs" teaches nothing. This shows each screen with
// realistic content and explains what it's FOR.
//
// The tradeoff, stated plainly: this is a replica, so it can drift from the
// real UI. The mocks are deliberately simplified to make drift matter less,
// and each stop links to its help article, which is the source of truth.
//
// Lives inside (app) so it inherits auth: it's for people who have signed
// up, and the entry point is the card on the jobs page after verification.

import Link from "next/link";
import { useEffect, useState } from "react";

import { TourMock } from "@/components/TourMocks";
import { TOUR_STOPS } from "@/lib/tour";

const SEEN_KEY = "hd_tour_seen";

/** Remember that the tour has been finished, so the offer stops appearing. */
export function markTourSeen() {
  try {
    window.localStorage.setItem(SEEN_KEY, "1");
  } catch {
    // Private browsing. The offer reappearing is a small cost.
  }
}

export function hasSeenTour(): boolean {
  try {
    return window.localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

export default function TourPage() {
  const [index, setIndex] = useState(0);
  const stop = TOUR_STOPS[index];
  const isLast = index === TOUR_STOPS.length - 1;

  // Deep-linkable, so "the bit about the watch folder" can be sent to
  // someone directly. Also survives a refresh mid-tour.
  useEffect(() => {
    const fromHash = TOUR_STOPS.findIndex(
      (s) => s.id === window.location.hash.replace("#", ""),
    );
    if (fromHash >= 0) setIndex(fromHash);
  }, []);

  function go(next: number) {
    const clamped = Math.max(0, Math.min(next, TOUR_STOPS.length - 1));
    setIndex(clamped);
    window.history.replaceState(null, "", `#${TOUR_STOPS[clamped].id}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Arrow keys, because anyone clicking Next eight times will try them.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(index + 1);
      if (e.key === "ArrowLeft") go(index - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            How HeadshotDesk works
          </h1>
          <p className="mt-1 text-sm text-muted-600">
            Eight screens, about three minutes. Nothing here is your data:
            it&apos;s a walkthrough, so click freely.
          </p>
        </div>
        <Link
          href="/jobs"
          onClick={markTourSeen}
          className="text-sm text-muted-600 hover:text-ink transition"
        >
          Skip the tour
        </Link>
      </div>

      {/* Rail. Doubles as progress and as a way to jump straight to the
          part someone came back for. */}
      <div className="mt-6 flex flex-wrap gap-2">
        {TOUR_STOPS.map((s, i) => (
          <button
            key={s.id}
            onClick={() => go(i)}
            aria-current={i === index}
            className={
              "rounded-card border px-3 py-1.5 text-xs font-medium transition " +
              (i === index
                ? "border-accent bg-accent text-accent-fg"
                : i < index
                  ? "border-muted-200 bg-muted-50 text-muted-600"
                  : "border-muted-200 bg-paper text-muted-600 hover:border-accent")
            }
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-2">
        {/* Explanation first on mobile: the words are the point, the mock
            is the illustration. */}
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-600">
            Step {index + 1} of {TOUR_STOPS.length}
          </p>
          <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight">
            {stop.title}
          </h2>
          <p className="mt-2 text-base text-ink">{stop.lead}</p>

          {stop.body.map((p, i) => (
            <p key={i} className="mt-3 text-sm text-muted-600">
              {p}
            </p>
          ))}

          {stop.points ? (
            <ul className="mt-4 space-y-2">
              {stop.points.map((p, i) => (
                <li key={i} className="flex gap-2 text-sm text-muted-600">
                  <span className="text-accent" aria-hidden>
                    •
                  </span>
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          ) : null}

          {stop.help ? (
            <p className="mt-4 text-sm">
              <a
                href={`/help/${stop.help}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:underline"
              >
                Read the full details
              </a>
            </p>
          ) : null}

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <button
              onClick={() => go(index - 1)}
              disabled={index === 0}
              className="btn-secondary text-sm disabled:opacity-40"
            >
              Back
            </button>
            {isLast ? (
              <Link
                href="/jobs/new"
                onClick={markTourSeen}
                className="btn-primary text-sm"
              >
                Create your first job
              </Link>
            ) : (
              <button onClick={() => go(index + 1)} className="btn-primary text-sm">
                Next
              </button>
            )}
            {isLast ? (
              <Link
                href="/jobs"
                onClick={markTourSeen}
                className="text-sm text-muted-600 hover:text-ink transition"
              >
                Go to my jobs
              </Link>
            ) : null}
          </div>
        </div>

        <div className="lg:sticky lg:top-6 lg:self-start">
          <TourMock kind={stop.mock} />
          <p className="mt-2 text-center text-[11px] text-muted-600">
            Sample data. Not a real shoot.
          </p>
        </div>
      </div>
    </div>
  );
}

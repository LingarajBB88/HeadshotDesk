"use client";

// The offer to take the tour, shown at the top of the jobs page.
//
// Dismissable rather than a forced full-screen wizard: someone who already
// knows what they're doing shouldn't have to click through eight screens to
// reach their work. It disappears once the tour is finished or dismissed,
// and Help keeps a permanent link for anyone who wants it later.
//
// Only shown to accounts with no jobs yet. A photographer mid-season
// doesn't need "here's how it works" above their job list.

import Link from "next/link";
import { useEffect, useState } from "react";

const DISMISSED_KEY = "hd_tour_dismissed";
const SEEN_KEY = "hd_tour_seen";

export function TourOfferCard({ show }: { show: boolean }) {
  // Rendered only after mount: localStorage isn't available during SSR, and
  // flashing the card at someone who dismissed it last week is worse than
  // showing it a moment late.
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!show) return;
    try {
      const done =
        window.localStorage.getItem(SEEN_KEY) === "1" ||
        window.localStorage.getItem(DISMISSED_KEY) === "1";
      setVisible(!done);
    } catch {
      setVisible(true);
    }
  }, [show]);

  if (!visible) return null;

  function dismiss() {
    try {
      window.localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // Private browsing. It'll offer again; not worth handling.
    }
    setVisible(false);
  }

  return (
    <div className="mb-6 rounded-card border border-accent/30 bg-accent-muted p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-ink">
            New here? Take the three-minute tour
          </h2>
          <p className="mt-1 text-sm text-muted-600">
            A walk through every screen: the signup link, shoot day, how
            photos sort themselves, and what your participants receive.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <Link href="/tour" className="btn-primary text-sm">
            Start the tour
          </Link>
          <button
            onClick={dismiss}
            className="text-sm text-muted-600 hover:text-ink transition"
          >
            No thanks
          </button>
        </div>
      </div>
    </div>
  );
}

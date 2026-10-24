"use client";

import Link from "next/link";
import type { ComponentProps } from "react";

import { track, type TrackedEvent } from "@/lib/track";

/**
 * A <Link> that records a Plausible event on click. `where` says which of
 * the page's buttons it was (hero, nav, footer CTA), so the dashboard can
 * tell which placement converts.
 */
export function TrackedLink({
  event,
  where,
  onClick,
  ...rest
}: ComponentProps<typeof Link> & { event: TrackedEvent; where: string }) {
  return (
    <Link
      {...rest}
      onClick={(e) => {
        track(event, { where });
        onClick?.(e);
      }}
    />
  );
}

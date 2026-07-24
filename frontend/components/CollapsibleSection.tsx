"use client";

import { useState, type ReactNode } from "react";

/**
 * Collapsible section with a clickable header. Used for Participants and
 * Photos on the job detail page so photographers can hide chunks they're
 * not focused on.
 */
export function CollapsibleSection({
  title,
  count,
  description,
  actions,
  defaultOpen = true,
  forceOpen,
  children,
}: {
  title: string;
  count?: number;
  description?: ReactNode;
  actions?: ReactNode;
  defaultOpen?: boolean;
  /** When true, render the section open regardless of internal toggle state.
   *  Used by ParticipantsSection to auto-open the section while the user has
   *  an active search query so results aren't hidden behind a collapsed
   *  header. Internal state still tracks the user's chevron clicks so
   *  behavior on clear-search is honored. */
  forceOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const isOpen = forceOpen || open;
  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 text-left"
          aria-expanded={isOpen}
        >
          <Chevron open={isOpen} />
          <h2 className="font-display text-xl font-semibold tracking-tight">
            {title}
            {typeof count === "number" ? (
              <span className="ml-2 text-sm font-normal text-muted-600">
                ({count})
              </span>
            ) : null}
          </h2>
        </button>
        {actions}
      </div>
      {description && isOpen ? (
        <p className="mt-0.5 ml-7 text-xs text-muted-600">{description}</p>
      ) : null}
      {isOpen ? <div className="mt-4">{children}</div> : null}
    </section>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      className={
        "h-4 w-4 text-muted-600 transition-transform " +
        (open ? "rotate-90" : "")
      }
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polyline points="6 4 10 8 6 12" />
    </svg>
  );
}

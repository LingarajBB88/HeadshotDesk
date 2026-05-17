"use client";

import { useEffect, useState } from "react";

/**
 * Compact search input with a built-in clear button.
 *
 * Uses controlled state from the parent so the parent can read the query.
 * Designed to be slotted into a section header — sized small, full-width on
 * mobile, fixed width on desktop.
 */
export function SearchInput({
  value,
  onChange,
  placeholder = "Search…",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  // Debounce: small delay so onChange isn't called for every keystroke.
  // For client-side filtering of <1000 items this isn't strictly needed,
  // but it keeps re-renders cheap and feels smoother.
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);
  useEffect(() => {
    const t = setTimeout(() => {
      if (local !== value) onChange(local);
    }, 80);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [local]);

  return (
    <div className="relative w-full sm:w-64">
      <input
        type="search"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-md border border-muted-200 bg-paper pl-8 pr-8 py-1.5 text-sm outline-none transition focus:ring-2 focus:ring-accent/30 focus:border-accent"
      />
      <svg
        className="absolute left-2.5 top-2 h-4 w-4 text-muted-400 pointer-events-none"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden
      >
        <circle cx="7" cy="7" r="5" />
        <line x1="11" y1="11" x2="14" y2="14" strokeLinecap="round" />
      </svg>
      {local ? (
        <button
          type="button"
          onClick={() => {
            setLocal("");
            onChange("");
          }}
          className="absolute right-1.5 top-1.5 h-5 w-5 text-muted-400 hover:text-ink rounded"
          aria-label="Clear search"
        >
          ×
        </button>
      ) : null}
    </div>
  );
}

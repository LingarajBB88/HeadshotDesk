"use client";

import { useState } from "react";

/**
 * Shared table sorting: one hook, one header cell, used by every table in
 * the app so they all behave the same way (click to sort, click again to
 * reverse, arrow shows the direction).
 *
 * Sorting is client-side on purpose — these tables are tens to low
 * hundreds of rows, so a round trip would be slower than sorting in place
 * and would lose the photographer's scroll position mid-shoot.
 */
export type SortDir = "asc" | "desc";

export type SortState<K extends string> = {
  key: K;
  dir: SortDir;
};

export function useSort<K extends string>(initial: SortState<K>) {
  const [sort, setSort] = useState<SortState<K>>(initial);

  function toggle(key: K) {
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
        : // New column starts ascending: names A-Z, times earliest first,
          // which is what people expect on first click.
          { key, dir: "asc" },
    );
  }

  /** Sort a copy of `rows` using a per-key value accessor. */
  function sorted<T>(
    rows: T[],
    value: (row: T, key: K) => string | number | null | undefined,
  ): T[] {
    const factor = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = value(a, sort.key);
      const bv = value(b, sort.key);
      // Empty values always sink to the bottom, whichever direction —
      // "no time yet" is never the interesting end of the list.
      const aEmpty = av === null || av === undefined || av === "";
      const bEmpty = bv === null || bv === undefined || bv === "";
      if (aEmpty && bEmpty) return 0;
      if (aEmpty) return 1;
      if (bEmpty) return -1;
      if (typeof av === "number" && typeof bv === "number") {
        return (av - bv) * factor;
      }
      return String(av).localeCompare(String(bv), undefined, {
        numeric: true,
        sensitivity: "base",
      }) * factor;
    });
  }

  return { sort, toggle, sorted };
}

export function SortableHeader<K extends string>({
  label,
  sortKey,
  sort,
  onSort,
  align = "left",
  className = "",
}: {
  label: string;
  sortKey: K;
  sort: SortState<K>;
  onSort: (key: K) => void;
  align?: "left" | "right";
  className?: string;
}) {
  const active = sort.key === sortKey;
  return (
    <th
      className={`px-4 py-3 ${align === "right" ? "text-right" : ""} ${className}`}
      aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={
          "inline-flex items-center gap-1 hover:text-ink transition " +
          (active ? "text-ink" : "")
        }
        title={`Sort by ${label.toLowerCase()}`}
      >
        {label}
        <span
          aria-hidden
          className={active ? "text-accent" : "text-muted-400 opacity-0 group-hover:opacity-100"}
        >
          {active ? (sort.dir === "asc" ? "↑" : "↓") : "↕"}
        </span>
      </button>
    </th>
  );
}

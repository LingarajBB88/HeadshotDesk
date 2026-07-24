"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { Logo } from "@/components/Logo";
import {
  HELP_ARTICLES,
  HELP_CATEGORIES,
  searchHelp,
} from "@/lib/help";

// Help center index: search-first, with a categorized directory underneath.
// Search returns section-level deep links so one query lands the reader on
// the exact setting they asked about.

export default function HelpIndexPage() {
  const [query, setQuery] = useState("");
  const results = useMemo(() => searchHelp(query), [query]);
  const searching = query.trim().length >= 2;

  return (
    <main className="min-h-dvh bg-muted-50">
      <header className="mx-auto max-w-3xl px-4 sm:px-6 h-16 flex items-center justify-between">
        <Link href="/" aria-label="HeadshotDesk home">
          <Logo size="sm" wordmark />
        </Link>
        <Link href="/login" className="text-sm text-muted-600 hover:text-ink transition">
          Sign in
        </Link>
      </header>

      <div className="mx-auto max-w-3xl px-4 sm:px-6 pt-8 sm:pt-14 pb-16">
        <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight">
          Help
        </h1>
        <p className="mt-2 text-sm sm:text-base text-muted-600">
          Every screen and setting, explained in plain words.
        </p>

        {/* Search */}
        <div className="mt-6">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search: download limit, CSV, watch folder…"
            autoFocus
            className="w-full rounded-card border border-muted-200 bg-paper px-4 py-3 text-base outline-none transition focus:ring-2 focus:ring-accent/30 focus:border-accent"
            aria-label="Search help articles"
          />
        </div>

        {searching ? (
          <div className="mt-6">
            {results.length === 0 ? (
              <p className="text-sm text-muted-600">
                Nothing found for &ldquo;{query}&rdquo;. Try a different word, or{" "}
                <a
                  href="mailto:info@pantherstudios.nl?subject=HeadshotDesk help"
                  className="text-accent hover:underline"
                >
                  email us
                </a>
                .
              </p>
            ) : (
              <ul className="space-y-3">
                {results.map((r) => (
                  <li key={`${r.article.slug}-${r.sectionId ?? "top"}`}>
                    <Link
                      href={`/help/${r.article.slug}${r.sectionId ? `#${r.sectionId}` : ""}`}
                      className="block rounded-card border border-muted-200 bg-paper p-4 hover:border-accent transition"
                    >
                      <p className="text-sm font-semibold text-ink">
                        {r.article.title}
                        {r.sectionHeading ? (
                          <span className="font-normal text-muted-600">
                            {" "}
                            › {r.sectionHeading}
                          </span>
                        ) : null}
                      </p>
                      <p className="mt-1 text-xs text-muted-600 leading-relaxed">
                        {r.snippet}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <div className="mt-10 space-y-10">
            {HELP_CATEGORIES.map((cat) => {
              const articles = HELP_ARTICLES.filter((a) => a.category === cat);
              if (articles.length === 0) return null;
              return (
                <section key={cat}>
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-600">
                    {cat}
                  </h2>
                  <ul className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {articles.map((a) => (
                      <li key={a.slug}>
                        <Link
                          href={`/help/${a.slug}`}
                          className="block h-full rounded-card border border-muted-200 bg-paper p-4 hover:border-accent transition"
                        >
                          <p className="text-sm font-semibold text-ink">{a.title}</p>
                          <p className="mt-1 text-xs text-muted-600 leading-relaxed">
                            {a.summary}
                          </p>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        )}

        <p className="mt-12 text-xs text-muted-600">
          Can&apos;t find it?{" "}
          <a
            href="mailto:info@pantherstudios.nl?subject=HeadshotDesk help"
            className="text-accent hover:underline"
          >
            Email us
          </a>{" "}
          and we&apos;ll answer, then improve this page.
        </p>
      </div>
    </main>
  );
}

"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { Logo } from "@/components/Logo";
import {
  HELP_ARTICLES,
  HELP_CATEGORIES,
  helpSectionAnchor,
  searchHelp,
} from "@/lib/help";

// Help center: single-page encyclopedia layout (Lingaraj, 2026-07-23).
// Everything lives on ONE page: a sticky sidebar lists every topic grouped
// by category, the content column renders all articles in reading order so
// one topic flows into the next, and search jumps straight to the matching
// section anchor. No per-article navigation, no dead ends.

export default function HelpPage() {
  const [query, setQuery] = useState("");
  const results = useMemo(() => searchHelp(query), [query]);
  const searching = query.trim().length >= 2;

  function jump(anchor: string) {
    setQuery("");
    // Update the hash so the position is shareable, then scroll.
    window.location.hash = anchor;
  }

  return (
    <main className="min-h-dvh bg-muted-50">
      <header className="mx-auto max-w-6xl px-4 sm:px-6 h-16 flex items-center justify-between">
        <Link href="/" aria-label="HeadshotDesk home">
          <Logo size="sm" wordmark />
        </Link>
        <Link href="/login" className="text-sm text-muted-600 hover:text-ink transition">
          Sign in
        </Link>
      </header>

      <div className="mx-auto max-w-6xl px-4 sm:px-6 pb-16 lg:grid lg:grid-cols-[260px_1fr] lg:gap-10">
        {/* Sidebar: search + full topic tree. Sticky on desktop so the map
            of everything stays in view while reading. */}
        <aside className="lg:sticky lg:top-0 lg:self-start lg:max-h-dvh lg:overflow-y-auto py-6">
          <div className="relative">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search help…"
              className="w-full rounded-card border border-muted-200 bg-paper px-3 py-2 text-sm outline-none transition focus:ring-2 focus:ring-accent/30 focus:border-accent"
              aria-label="Search help"
            />
            {searching ? (
              <div className="absolute left-0 right-0 top-11 z-20 rounded-card border border-muted-200 bg-paper shadow-lg max-h-96 overflow-y-auto lg:w-[340px]">
                {results.length === 0 ? (
                  <p className="p-3 text-xs text-muted-600">
                    Nothing found. Try a different word.
                  </p>
                ) : (
                  <ul className="divide-y divide-muted-200">
                    {results.map((r) => {
                      const anchor = r.sectionId
                        ? helpSectionAnchor(r.article.slug, r.sectionId)
                        : r.article.slug;
                      return (
                        <li key={`${r.article.slug}-${r.sectionId ?? "top"}`}>
                          <button
                            type="button"
                            onClick={() => jump(anchor)}
                            className="block w-full p-3 text-left hover:bg-muted-50 transition"
                          >
                            <p className="text-xs font-semibold text-ink">
                              {r.article.title}
                              {r.sectionHeading ? (
                                <span className="font-normal text-muted-600">
                                  {" "}
                                  › {r.sectionHeading}
                                </span>
                              ) : null}
                            </p>
                            <p className="mt-0.5 text-[11px] text-muted-600 leading-relaxed">
                              {r.snippet}
                            </p>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            ) : null}
          </div>

          <nav className="mt-6 space-y-6" aria-label="All help topics">
            {HELP_CATEGORIES.map((cat) => {
              const articles = HELP_ARTICLES.filter((a) => a.category === cat);
              if (articles.length === 0) return null;
              return (
                <div key={cat}>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-600">
                    {cat}
                  </p>
                  <ul className="mt-2 space-y-1">
                    {articles.map((a) => (
                      <li key={a.slug}>
                        <a
                          href={`#${a.slug}`}
                          className="block rounded-md px-2 py-1 text-sm text-muted-600 hover:text-ink hover:bg-muted-100 transition"
                        >
                          {a.title}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </nav>

          <p className="mt-8 text-[11px] text-muted-600">
            Can&apos;t find it?{" "}
            <a
              href="mailto:info@pantherstudios.nl?subject=HeadshotDesk help"
              className="text-accent hover:underline"
            >
              Email us
            </a>
            .
          </p>
        </aside>

        {/* Content: every article, in reading order. One long page. */}
        <div className="py-6">
          <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight">
            Help
          </h1>
          <p className="mt-2 text-sm sm:text-base text-muted-600">
            Every screen and setting, explained in plain words. Read top to
            bottom or jump from the list.
          </p>

          <div className="mt-8 space-y-10">
            {HELP_CATEGORIES.map((cat) => {
              const articles = HELP_ARTICLES.filter((a) => a.category === cat);
              if (articles.length === 0) return null;
              return (
                <section key={cat}>
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-600">
                    {cat}
                  </h2>
                  <div className="mt-3 space-y-6">
                    {articles.map((article) => (
                      <article
                        key={article.slug}
                        id={article.slug}
                        className="scroll-mt-6 rounded-dialog border border-muted-200 bg-paper p-6 sm:p-8"
                      >
                        <h3 className="font-display text-xl sm:text-2xl font-semibold tracking-tight">
                          <a href={`#${article.slug}`} className="hover:text-accent">
                            {article.title}
                          </a>
                        </h3>
                        <p className="mt-1 text-sm text-muted-600">
                          {article.summary}
                        </p>

                        {article.sections.map((section) => {
                          const anchor = helpSectionAnchor(article.slug, section.id);
                          return (
                            <section
                              key={anchor}
                              id={anchor}
                              className="mt-6 scroll-mt-6"
                            >
                              <h4 className="font-display text-base font-semibold tracking-tight">
                                <a href={`#${anchor}`} className="hover:text-accent">
                                  {section.heading}
                                </a>
                              </h4>
                              {section.body?.map((p, i) => (
                                <p
                                  key={i}
                                  className="mt-2 text-sm text-ink leading-relaxed"
                                >
                                  {p}
                                </p>
                              ))}
                              {section.items ? (
                                <dl className="mt-3 space-y-2.5">
                                  {section.items.map((item) => (
                                    <div key={item.term}>
                                      <dt className="text-sm font-semibold text-ink">
                                        {item.term}
                                      </dt>
                                      <dd className="mt-0.5 text-sm text-muted-600 leading-relaxed">
                                        {item.def}
                                      </dd>
                                    </div>
                                  ))}
                                </dl>
                              ) : null}
                            </section>
                          );
                        })}
                      </article>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      </div>
    </main>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { Logo } from "@/components/Logo";
import {
  HELP_ARTICLES,
  HELP_CATEGORIES,
  helpSectionAnchor,
  searchHelp,
} from "@/lib/help";

// Help center: single-page encyclopedia with collapsible topics.
// Topics are CLOSED by default so the page reads as a scannable index;
// clicking a topic in the sidebar, a search result, or a card header opens
// it (and only it needs to be open). Deep links (#slug or #slug--section)
// open the right card on load, which also keeps the old /help/[slug]
// redirects working.

/** Article slug from any anchor ("slug" or "slug--section"). */
function slugFromAnchor(anchor: string): string {
  return anchor.split("--")[0];
}

export default function HelpPage() {
  const [query, setQuery] = useState("");
  const results = useMemo(() => searchHelp(query), [query]);
  const searching = query.trim().length >= 2;

  // Which article cards are expanded. Closed by default.
  const [open, setOpen] = useState<Record<string, boolean>>({});
  // Anchor waiting to be scrolled to once its card has rendered open.
  const [pendingScroll, setPendingScroll] = useState<string | null>(null);

  function openAndScroll(anchor: string) {
    const slug = slugFromAnchor(anchor);
    setOpen((prev) => ({ ...prev, [slug]: true }));
    setPendingScroll(anchor);
    setQuery("");
    // Keep the URL shareable.
    window.history.replaceState(null, "", `#${anchor}`);
  }

  // Scroll after the expanded card is in the DOM.
  useEffect(() => {
    if (!pendingScroll) return;
    const el = document.getElementById(pendingScroll);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    setPendingScroll(null);
  }, [pendingScroll, open]);

  // Deep links: open the card the hash points at (covers the /help/[slug]
  // redirects and links shared with #anchors).
  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, "");
    if (!hash) return;
    const slug = slugFromAnchor(hash);
    if (HELP_ARTICLES.some((a) => a.slug === slug)) {
      setOpen((prev) => ({ ...prev, [slug]: true }));
      setPendingScroll(hash);
    }
  }, []);

  function toggle(slug: string) {
    setOpen((prev) => ({ ...prev, [slug]: !prev[slug] }));
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
        {/* Sidebar: search + full topic tree. */}
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
                            onClick={() => openAndScroll(anchor)}
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
                        <button
                          type="button"
                          onClick={() => openAndScroll(a.slug)}
                          className="block w-full rounded-md px-2 py-1 text-left text-sm text-muted-600 hover:text-ink hover:bg-muted-100 transition"
                        >
                          {a.title}
                        </button>
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

        {/* Content: every topic as a collapsible card, in reading order. */}
        <div className="py-6">
          <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight">
            Help
          </h1>
          <p className="mt-2 text-sm sm:text-base text-muted-600">
            Every screen and setting, explained in plain words. Open a topic
            from the list, or expand them here as you read.
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
                  <div className="mt-3 space-y-3">
                    {articles.map((article) => {
                      const isOpen = !!open[article.slug];
                      return (
                        <article
                          key={article.slug}
                          id={article.slug}
                          className="scroll-mt-6 rounded-dialog border border-muted-200 bg-paper"
                        >
                          {/* Card header: whole row toggles. */}
                          <button
                            type="button"
                            onClick={() => toggle(article.slug)}
                            aria-expanded={isOpen}
                            className="flex w-full items-center justify-between gap-4 px-6 py-4 text-left sm:px-8"
                          >
                            <span>
                              <span className="block font-display text-lg sm:text-xl font-semibold tracking-tight">
                                {article.title}
                              </span>
                              {!isOpen ? (
                                <span className="mt-0.5 block text-sm text-muted-600">
                                  {article.summary}
                                </span>
                              ) : null}
                            </span>
                            <svg
                              className={
                                "h-4 w-4 shrink-0 text-muted-600 transition-transform " +
                                (isOpen ? "rotate-180" : "")
                              }
                              viewBox="0 0 16 16"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              aria-hidden
                            >
                              <polyline points="4 6 8 10 12 6" />
                            </svg>
                          </button>

                          {isOpen ? (
                            <div className="px-6 pb-6 sm:px-8 sm:pb-8">
                              {article.intro?.map((p, i) => (
                                <p
                                  key={i}
                                  className="mt-1 text-sm sm:text-[15px] text-ink leading-relaxed"
                                >
                                  {p}
                                </p>
                              ))}

                              {article.sections.map((section) => {
                                const anchor = helpSectionAnchor(
                                  article.slug,
                                  section.id,
                                );
                                return (
                                  <section
                                    key={anchor}
                                    id={anchor}
                                    className="mt-6 scroll-mt-6"
                                  >
                                    <h4 className="font-display text-base font-semibold tracking-tight">
                                      {section.heading}
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

                              <button
                                type="button"
                                onClick={() => toggle(article.slug)}
                                className="mt-6 text-xs text-muted-600 hover:text-ink transition"
                              >
                                Minimize this topic
                              </button>
                            </div>
                          ) : null}
                        </article>
                      );
                    })}
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

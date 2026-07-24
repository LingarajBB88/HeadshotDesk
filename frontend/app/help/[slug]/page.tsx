import Link from "next/link";
import { notFound } from "next/navigation";

import { Logo } from "@/components/Logo";
import { HELP_ARTICLES, getHelpArticle } from "@/lib/help";

// Single help article. Server-rendered from the structured data in
// lib/help.ts. Sections carry stable anchor ids so app screens and search
// results can deep-link to an exact setting.

export function generateStaticParams() {
  return HELP_ARTICLES.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const article = getHelpArticle(slug);
  return {
    title: article ? `${article.title} | HeadshotDesk Help` : "Help | HeadshotDesk",
    description: article?.summary,
  };
}

export default async function HelpArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const article = getHelpArticle(slug);
  if (!article) notFound();

  const related = (article.related ?? [])
    .map((slug) => getHelpArticle(slug))
    .filter((a): a is NonNullable<typeof a> => Boolean(a));

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

      <div className="mx-auto max-w-3xl px-4 sm:px-6 pt-6 sm:pt-10 pb-16">
        <Link href="/help" className="text-sm text-muted-600 hover:text-ink transition">
          &larr; All help articles
        </Link>

        <article className="mt-4 rounded-dialog border border-muted-200 bg-paper p-6 sm:p-8">
          <p className="text-xs font-medium uppercase tracking-wider text-accent">
            {article.category}
          </p>
          <h1 className="mt-2 font-display text-2xl sm:text-3xl font-semibold tracking-tight">
            {article.title}
          </h1>
          <p className="mt-2 text-sm text-muted-600">{article.summary}</p>

          {/* On this page */}
          {article.sections.length > 2 ? (
            <nav
              aria-label="On this page"
              className="mt-6 rounded-card bg-muted-50 px-4 py-3"
            >
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-600">
                On this page
              </p>
              <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                {article.sections.map((s) => (
                  <li key={s.id}>
                    <a
                      href={`#${s.id}`}
                      className="text-xs text-accent hover:underline"
                    >
                      {s.heading}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          ) : null}

          {article.sections.map((section) => (
            <section key={section.id} id={section.id} className="mt-8 scroll-mt-6">
              <h2 className="font-display text-lg font-semibold tracking-tight">
                <a href={`#${section.id}`} className="hover:text-accent">
                  {section.heading}
                </a>
              </h2>
              {section.body?.map((p, i) => (
                <p key={i} className="mt-2 text-sm text-ink leading-relaxed">
                  {p}
                </p>
              ))}
              {section.items ? (
                <dl className="mt-3 space-y-3">
                  {section.items.map((item) => (
                    <div key={item.term}>
                      <dt className="text-sm font-semibold text-ink">{item.term}</dt>
                      <dd className="mt-0.5 text-sm text-muted-600 leading-relaxed">
                        {item.def}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : null}
            </section>
          ))}

          {related.length > 0 ? (
            <footer className="mt-10 border-t border-muted-200 pt-6">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-600">
                Related
              </p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {related.map((r) => (
                  <li key={r.slug}>
                    <Link
                      href={`/help/${r.slug}`}
                      className="inline-block rounded-md bg-muted-50 px-3 py-1.5 text-xs text-accent hover:bg-accent-muted transition"
                    >
                      {r.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </footer>
          ) : null}
        </article>

        <p className="mt-6 text-xs text-muted-600">
          Still stuck?{" "}
          <a
            href="mailto:info@pantherstudios.nl?subject=HeadshotDesk help"
            className="text-accent hover:underline"
          >
            Email us
          </a>
          .
        </p>
      </div>
    </main>
  );
}

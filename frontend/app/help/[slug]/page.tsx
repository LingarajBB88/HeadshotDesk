import { notFound, redirect } from "next/navigation";

import { HELP_ARTICLES, getHelpArticle } from "@/lib/help";

// The help center is a single-page encyclopedia (see /help). Old per-article
// URLs stay alive as redirects to the matching anchor so contextual links
// from app screens (and any shared links) keep working.

export function generateStaticParams() {
  return HELP_ARTICLES.map((a) => ({ slug: a.slug }));
}

export default async function HelpArticleRedirect({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!getHelpArticle(slug)) notFound();
  redirect(`/help#${slug}`);
}

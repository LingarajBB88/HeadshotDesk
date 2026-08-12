// The photographer's public profile: /p/{handle}.
//
// Two audiences, one page. A participant who got an email and wants to know
// who is photographing them tomorrow, and a search engine indexing the
// photographer's name. Both want the same thing first: a face, a name, and
// what this person does.
//
// Server-rendered on purpose. The SEO value is the whole reason the page
// exists, and a client-rendered profile is an empty div to a crawler.
//
// The API 404s unless the profile is published AND the owner confirmed
// their email, so there's no visibility check to repeat here.

/* eslint-disable @next/next/no-img-element */
// Plain <img> rather than next/image: these are served from the API origin,
// which differs between local, preview, and production. Keeping that list
// in next.config in sync with the environment is a deploy-time failure
// waiting to happen, and the optimizer buys little on a page with at most
// nine images.

import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getPublicProfile, type PublicProfile } from "@/lib/studio";

export const revalidate = 300;

const SITE = process.env.NEXT_PUBLIC_APP_URL ?? "https://headshotdesk.com";

type Props = { params: Promise<{ handle: string }> };

function summarise(profile: PublicProfile): string {
  if (profile.tagline) return profile.tagline;
  const where = profile.city ? ` in ${profile.city}` : "";
  return `Headshot photography${where} by ${profile.name}.`;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { handle } = await params;
  const profile = await getPublicProfile(handle);
  if (!profile) {
    // Without this, an unpublished profile would inherit the site-wide
    // title and get indexed as a HeadshotDesk page that 404s.
    return { title: "Profile not found", robots: { index: false } };
  }

  const title = profile.city
    ? `${profile.name} — Headshot photographer in ${profile.city}`
    : `${profile.name} — Headshot photographer`;
  const description = summarise(profile);
  const url = `${SITE}/p/${profile.handle}`;
  const image = profile.portfolio[0]?.url ?? profile.portrait_url ?? undefined;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "profile",
      title,
      description,
      url,
      images: image ? [{ url: image }] : undefined,
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title,
      description,
      images: image ? [image] : undefined,
    },
  };
}

/**
 * schema.org, so the photographer's name, area, and contact details are
 * legible to a search engine rather than inferred from prose. ProfilePage
 * wrapping a LocalBusiness is the honest description: a business page, not
 * an article.
 */
function structuredData(profile: PublicProfile) {
  const url = `${SITE}/p/${profile.handle}`;
  return {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    mainEntity: {
      "@type": "LocalBusiness",
      additionalType: "https://schema.org/ProfessionalService",
      name: profile.name,
      description: summarise(profile),
      url,
      ...(profile.website_url ? { sameAs: [profile.website_url] } : {}),
      ...(profile.portrait_url ? { image: profile.portrait_url } : {}),
      ...(profile.contact_email ? { email: profile.contact_email } : {}),
      ...(profile.contact_phone ? { telephone: profile.contact_phone } : {}),
      ...(profile.city
        ? {
            address: {
              "@type": "PostalAddress",
              addressLocality: profile.city,
              ...(profile.country ? { addressCountry: profile.country } : {}),
            },
          }
        : {}),
    },
  };
}

export default async function ProfilePage({ params }: Props) {
  const { handle } = await params;
  const profile = await getPublicProfile(handle);
  if (!profile) notFound();

  const place = [profile.city, profile.country].filter(Boolean).join(", ");
  const hasContact =
    profile.website_url || profile.contact_email || profile.contact_phone;

  return (
    <main className="mx-auto max-w-3xl px-5 py-12 sm:py-16">
      <script
        type="application/ld+json"
        // Serialised server-side from our own API response, never from
        // participant input.
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData(profile)),
        }}
      />

      <header className="flex flex-col gap-5 sm:flex-row sm:items-center">
        {profile.portrait_url ? (
          <img
            src={profile.portrait_url}
            alt={profile.name}
            width={112}
            height={112}
            className="h-28 w-28 shrink-0 rounded-full object-cover"
          />
        ) : null}
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            {profile.name}
          </h1>
          {profile.tagline ? (
            <p className="mt-1 text-lg text-muted-600">{profile.tagline}</p>
          ) : null}
          {place ? (
            <p className="mt-1 text-sm text-muted-600">{place}</p>
          ) : null}
        </div>
      </header>

      {profile.about ? (
        <section className="mt-10">
          {/* whitespace-pre-line keeps the paragraph breaks someone typed,
              without opening the door to arbitrary markup on a public page. */}
          <p className="whitespace-pre-line text-[15px] leading-relaxed text-ink">
            {profile.about}
          </p>
        </section>
      ) : null}

      {profile.portfolio.length > 0 ? (
        <section className="mt-12">
          <h2 className="text-sm font-medium uppercase tracking-wider text-muted-600">
            Work
          </h2>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {profile.portfolio.map((image) => (
              <figure key={image.id} className="m-0">
                <img
                  src={image.url}
                  alt={image.caption ?? `Headshot by ${profile.name}`}
                  loading="lazy"
                  className="aspect-[4/5] w-full rounded-card object-cover"
                />
                {image.caption ? (
                  <figcaption className="mt-1.5 text-xs text-muted-600">
                    {image.caption}
                  </figcaption>
                ) : null}
              </figure>
            ))}
          </div>
        </section>
      ) : null}

      {profile.links.length > 0 ? (
        <section className="mt-12">
          <h2 className="text-sm font-medium uppercase tracking-wider text-muted-600">
            Worth reading
          </h2>
          <ul className="mt-3 space-y-1.5">
            {profile.links.map((link) => (
              <li key={link.url}>
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[15px] text-accent hover:underline"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {hasContact ? (
        <section className="mt-12 border-t border-muted-200 pt-6">
          <h2 className="text-sm font-medium uppercase tracking-wider text-muted-600">
            Get in touch
          </h2>
          <p className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-[15px]">
            {profile.website_url ? (
              <a
                href={profile.website_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:underline"
              >
                {profile.website_url.replace(/^https?:\/\//, "")}
              </a>
            ) : null}
            {profile.contact_email ? (
              <a
                href={`mailto:${profile.contact_email}`}
                className="text-accent hover:underline"
              >
                {profile.contact_email}
              </a>
            ) : null}
            {profile.contact_phone ? (
              <a
                href={`tel:${profile.contact_phone.replace(/\s+/g, "")}`}
                className="text-accent hover:underline"
              >
                {profile.contact_phone}
              </a>
            ) : null}
          </p>
        </section>
      ) : null}

      <footer className="mt-16 border-t border-muted-200 pt-5 text-xs text-muted-600">
        Bookings and galleries run on{" "}
        <a href={SITE} className="text-accent hover:underline">
          HeadshotDesk
        </a>
        .
      </footer>
    </main>
  );
}

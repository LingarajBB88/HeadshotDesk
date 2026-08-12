// The photographer's contact details, as participants see them.
//
// Shared between the signup page and the gallery because both are places a
// participant might want to ask a question or read the prep guide, and the
// answer shouldn't differ between them.
//
// Renders nothing when the photographer hasn't filled anything in. An
// empty "Contact" card is worse than no card.

import type { PublicStudio } from "@/lib/studio";

export function StudioContact({
  studio,
  className = "",
}: {
  studio: PublicStudio | null | undefined;
  className?: string;
}) {
  if (!studio) return null;
  const links = studio.links ?? [];
  const hasContact =
    studio.website_url || studio.contact_email || studio.contact_phone;
  if (
    !hasContact &&
    links.length === 0 &&
    !studio.portrait_url &&
    !studio.profile_url &&
    !studio.tagline
  ) {
    return null;
  }

  return (
    <div className={"border-t border-muted-200 pt-4 " + className}>
      <p className="text-xs font-medium uppercase tracking-wider text-muted-600">
        Your photographer
      </p>

      <div className="mt-2 flex items-center gap-3">
        {studio.portrait_url ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={studio.portrait_url}
            alt={studio.name}
            className="h-11 w-11 shrink-0 rounded-full object-cover"
          />
        ) : null}
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink">
            {/* Linked only when a published page exists, so this never
                sends someone to a 404. */}
            {studio.profile_url ? (
              <a
                href={studio.profile_url}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline"
              >
                {studio.name}
              </a>
            ) : (
              studio.name
            )}
          </p>
          {studio.tagline ? (
            <p className="truncate text-xs text-muted-600">{studio.tagline}</p>
          ) : null}
        </div>
      </div>

      {/* Links first: a "how to prepare" guide is the thing most worth
          reading before the day, and burying it under a phone number
          nobody calls would waste it. */}
      {links.length > 0 ? (
        <ul className="mt-2 space-y-1">
          {links.map((l) => (
            <li key={l.url}>
              <a
                href={l.url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="text-sm text-accent hover:underline"
              >
                {l.label}
              </a>
            </li>
          ))}
        </ul>
      ) : null}

      {hasContact ? (
        <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-600">
          {studio.website_url ? (
            <a
              href={studio.website_url}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="text-accent hover:underline"
            >
              {studio.website_url.replace(/^https?:\/\//, "")}
            </a>
          ) : null}
          {studio.contact_email ? (
            <a
              href={`mailto:${studio.contact_email}`}
              className="text-accent hover:underline"
            >
              {studio.contact_email}
            </a>
          ) : null}
          {studio.contact_phone ? (
            <a
              href={`tel:${studio.contact_phone.replace(/\s+/g, "")}`}
              className="text-accent hover:underline"
            >
              {studio.contact_phone}
            </a>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}

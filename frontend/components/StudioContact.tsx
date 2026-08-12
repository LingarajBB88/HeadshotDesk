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
  if (!hasContact && links.length === 0) return null;

  return (
    <div className={"border-t border-muted-200 pt-4 " + className}>
      <p className="text-xs font-medium uppercase tracking-wider text-muted-600">
        Your photographer
      </p>
      <p className="mt-1 text-sm font-medium text-ink">{studio.name}</p>

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

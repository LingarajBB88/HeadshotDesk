"use client";

/* eslint-disable @next/next/no-img-element */

// The client's copy of the whole shoot.
//
// Reached from the delivery email on jobs where the photographer chose to
// hand the photos to the client contact rather than emailing every member
// of staff. HR downloads the set and distributes it internally.
//
// Grouped by person, because a flat grid of 400 frames is not something
// anyone can hand out. Download-all is the primary action: this page exists
// to be emptied, not browsed.
//
// The token is the only credential, so the layout sets referrer: origin and
// noindex, same as the dashboard it sits under.

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type Photo = {
  id: string;
  filename: string;
  is_psd?: boolean;
  thumbnail_url: string;
  download_url: string;
};

type Person = { name: string; title: string | null; photos: Photo[] };

type ClientPhotos = {
  job_name: string;
  client_name: string | null;
  people: Person[];
  photo_count: number;
};

export default function ClientPhotosPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;

  const [data, setData] = useState<ClientPhotos | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `${BASE}/api/v1/public/client/${encodeURIComponent(token)}/photos`,
        );
        if (!res.ok) throw new Error(String(res.status));
        if (!cancelled) setData(await res.json());
      } catch {
        // 404 covers every refusal: wrong token, job not delivered yet, or
        // a job whose photos were never meant for the client. Saying which
        // would tell a stranger something.
        if (!cancelled) {
          setError(
            "This link isn't active. Ask your photographer for a new one.",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  // A plain link: the API streams the archive with Content-Disposition
  // attachment, so the browser shows its own download progress from the
  // first photo instead of a button saying "Preparing" until the last.
  const zipUrl = `${BASE}/api/v1/public/client/${encodeURIComponent(token)}/photos/zip`;

  if (error && !data) {
    return (
      <main className="mx-auto max-w-3xl px-5 py-16">
        <p className="text-sm text-muted-600">{error}</p>
      </main>
    );
  }
  if (!data) {
    return (
      <main className="mx-auto max-w-3xl px-5 py-16">
        <p className="text-sm text-muted-600">Loading…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-5 py-10 sm:py-14">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            {data.job_name}
          </h1>
          <p className="mt-1 text-sm text-muted-600">
            {data.photo_count} photo{data.photo_count === 1 ? "" : "s"} across{" "}
            {data.people.length} {data.people.length === 1 ? "person" : "people"}
          </p>
        </div>
        <a href={zipUrl} className="btn-primary text-sm">
          Download everything
        </a>
      </header>

      {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

      <p className="mt-3 text-xs text-muted-600">
        The download arrives as one archive with a folder per person, so you
        can forward each one without renaming anything.
      </p>

      <div className="mt-10 space-y-10">
        {data.people.map((person) => (
          <section key={person.name}>
            <h2 className="text-sm font-semibold text-ink">
              {person.name}
              {person.title ? (
                <span className="ml-2 font-normal text-muted-600">
                  {person.title}
                </span>
              ) : null}
            </h2>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-5">
              {person.photos.map((photo) => (
                <a
                  key={photo.id}
                  href={photo.download_url}
                  download={photo.filename}
                  className="group relative block"
                  title={`Download ${photo.filename}`}
                >
                  <img
                    src={photo.thumbnail_url}
                    alt={person.name}
                    loading="lazy"
                    className="aspect-[4/5] w-full rounded-card bg-muted-100 object-cover transition group-hover:opacity-90"
                  />
                  {photo.is_psd ? (
                    <span className="absolute left-2 top-2 rounded bg-ink/80 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-paper">
                      PSD
                    </span>
                  ) : null}
                </a>
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}

// Studio profile: the photographer's contact details, links, and public
// profile page at /p/{handle}.

import { api } from "./api";
import { getAccessToken } from "./auth";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export type StudioLink = { label: string; url: string };

export type PortfolioImage = {
  id: string;
  url: string;
  caption: string | null;
};

export type StudioProfile = {
  name: string;
  website_url: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  links: StudioLink[];
  handle: string | null;
  tagline: string | null;
  about: string | null;
  city: string | null;
  country: string | null;
  profile_published: boolean;
  portrait_url: string | null;
  portfolio: PortfolioImage[];
  /** Null until the page would actually resolve, so we never link a 404. */
  profile_url: string | null;
};

/** What participants see alongside a signup form or gallery. */
export type PublicStudio = {
  name: string;
  tagline?: string | null;
  city?: string | null;
  portrait_url?: string | null;
  profile_url?: string | null;
  website_url?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  links?: StudioLink[];
};

/** The full public profile page. */
export type PublicProfile = {
  handle: string;
  name: string;
  tagline: string | null;
  about: string | null;
  city: string | null;
  country: string | null;
  portrait_url: string | null;
  portfolio: PortfolioImage[];
  website_url: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  links: StudioLink[];
};

function authToken(): string {
  const t = getAccessToken();
  if (!t) throw new Error("Not authenticated");
  return t;
}

export async function getStudio(): Promise<StudioProfile> {
  return api<StudioProfile>("/api/v1/studio", { token: authToken() });
}

export type StudioUpdate = Partial<
  Pick<
    StudioProfile,
    | "website_url"
    | "contact_email"
    | "contact_phone"
    | "links"
    | "handle"
    | "tagline"
    | "about"
    | "city"
    | "country"
    | "profile_published"
  >
>;

export async function updateStudio(
  input: StudioUpdate,
): Promise<StudioProfile> {
  return api<StudioProfile>("/api/v1/studio", {
    method: "PATCH",
    token: authToken(),
    body: JSON.stringify(input),
  });
}

export async function suggestHandle(): Promise<string> {
  const r = await api<{ handle: string }>("/api/v1/studio/handle-suggestion", {
    token: authToken(),
  });
  return r.handle;
}

/**
 * Multipart upload. Deliberately not routed through `api()`: that helper
 * sets a JSON content type, and setting any Content-Type by hand on a
 * FormData body strips the multipart boundary the server needs.
 */
async function upload(
  path: string,
  form: FormData,
): Promise<StudioProfile> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${authToken()}` },
    body: form,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = (body as { detail?: unknown }).detail;
    throw new Error(
      typeof detail === "string" ? detail : "That upload didn't work.",
    );
  }
  return body as StudioProfile;
}

export async function uploadPortrait(file: File): Promise<StudioProfile> {
  const form = new FormData();
  form.append("file", file);
  return upload("/api/v1/studio/portrait", form);
}

export async function removePortrait(): Promise<StudioProfile> {
  return api<StudioProfile>("/api/v1/studio/portrait", {
    method: "DELETE",
    token: authToken(),
  });
}

export async function addPortfolioImage(
  file: File,
  caption?: string,
): Promise<StudioProfile> {
  const form = new FormData();
  form.append("file", file);
  if (caption) form.append("caption", caption);
  return upload("/api/v1/studio/portfolio", form);
}

export async function removePortfolioImage(
  imageId: string,
): Promise<StudioProfile> {
  return api<StudioProfile>(
    `/api/v1/studio/portfolio/${encodeURIComponent(imageId)}`,
    { method: "DELETE", token: authToken() },
  );
}

export async function setPortfolioCaption(
  imageId: string,
  caption: string | null,
): Promise<StudioProfile> {
  return api<StudioProfile>(
    `/api/v1/studio/portfolio/${encodeURIComponent(imageId)}`,
    {
      method: "PATCH",
      token: authToken(),
      body: JSON.stringify({ caption }),
    },
  );
}

export async function reorderPortfolio(
  imageIds: string[],
): Promise<StudioProfile> {
  return api<StudioProfile>("/api/v1/studio/portfolio/order", {
    method: "PATCH",
    token: authToken(),
    body: JSON.stringify({ image_ids: imageIds }),
  });
}

/** Public read, no auth. Returns null on 404 so pages can render notFound(). */
export async function getPublicProfile(
  handle: string,
): Promise<PublicProfile | null> {
  const res = await fetch(
    `${BASE}/api/v1/public/profile/${encodeURIComponent(handle)}`,
    // Profiles change rarely and are read by strangers, so a short cache
    // keeps the page fast without making an edit invisible for long.
    { next: { revalidate: 300 } },
  );
  if (!res.ok) return null;
  return (await res.json()) as PublicProfile;
}

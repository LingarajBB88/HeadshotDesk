// Studio profile: the photographer's own contact details and links, shown
// to participants on signup pages and galleries.

import { api } from "./api";
import { getAccessToken } from "./auth";

export type StudioLink = { label: string; url: string };

export type StudioProfile = {
  name: string;
  website_url: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  links: StudioLink[];
};

/** What participants see. Null on public payloads when nothing is set. */
export type PublicStudio = {
  name: string;
  website_url?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  links?: StudioLink[];
};

function authToken(): string {
  const t = getAccessToken();
  if (!t) throw new Error("Not authenticated");
  return t;
}

export async function getStudio(): Promise<StudioProfile> {
  return api<StudioProfile>("/api/v1/studio", { token: authToken() });
}

export async function updateStudio(
  input: Partial<Omit<StudioProfile, "name">>,
): Promise<StudioProfile> {
  return api<StudioProfile>("/api/v1/studio", {
    method: "PATCH",
    token: authToken(),
    body: JSON.stringify(input),
  });
}

// Participants API client — both authed (photographer) and public (signup form) calls.

import { api } from "./api";
import { getAccessToken } from "./auth";

export type Participant = {
  id: string;
  job_id: string;
  name: string;
  email: string | null;
  title: string | null;
  shot_at: string | null;  // ISO timestamp when photographed; null if pending
  photo_count: number;     // number of uploaded files assigned to them
  // Round-2 polish: unique files this participant has pulled from their
  // gallery. The Job detail Downloads tile sums these across the job to show
  // actual consumption against the cap budget. Only populated on the list
  // endpoint; single-participant endpoints leave it at 0.
  downloads_used: number;
  /** F5b.2: how many photos this participant starred as favorites. */
  picks_used?: number;
  // F5b.1: token for the participant's public /g/{token} gallery URL.
  // The photographer uses this to build the link to share.
  gallery_token: string;
  // F5c: ISO timestamp the gallery delivery email was last sent. Null means
  // the participant hasn't been emailed yet. Used by the bulk Deliver button
  // (skip already-delivered) and surfaced on the row as a "Delivered" pill.
  gallery_sent_at: string | null;
  created_at: string;
};

export type ParticipantList = {
  items: Participant[];
  total: number;
};

export type CsvImportResult = {
  created: number;
  skipped_duplicates: number;
  errors: string[];
};

export type PublicJob = {
  name: string;
  client_name: string | null;
  shoot_date: string | null;
  location: string | null;
  // HSD-55: signals the signup page to show the slot picker.
  shoot_mode: "queue" | "time_slot";
  branding: Record<string, unknown> | null;
  /** HSD-36: the client's logo, shown above the signup form. */
  client_logo_url?: string | null;
};

export type PublicSlot = {
  start: string;
  end: string;
  available: boolean;
};

function authToken(): string {
  const t = getAccessToken();
  if (!t) throw new Error("Not authenticated");
  return t;
}

// --- Authed (photographer) ---

export async function listParticipants(jobId: string): Promise<ParticipantList> {
  return api<ParticipantList>(`/api/v1/jobs/${jobId}/participants`, {
    token: authToken(),
  });
}

export async function addParticipant(
  jobId: string,
  input: { name: string; email?: string | null; title?: string | null },
): Promise<Participant> {
  const body: Record<string, unknown> = { name: input.name };
  if (input.email) body.email = input.email;
  if (input.title) body.title = input.title;
  return api<Participant>(`/api/v1/jobs/${jobId}/participants`, {
    method: "POST",
    token: authToken(),
    body: JSON.stringify(body),
  });
}

export async function deleteParticipant(participantId: string): Promise<void> {
  await api(`/api/v1/participants/${participantId}`, {
    method: "DELETE",
    token: authToken(),
  });
}

export async function markShot(participantId: string): Promise<Participant> {
  return api<Participant>(`/api/v1/participants/${participantId}/mark-shot`, {
    method: "POST",
    token: authToken(),
  });
}

export async function resetShot(participantId: string): Promise<Participant> {
  return api<Participant>(`/api/v1/participants/${participantId}/reset-shot`, {
    method: "POST",
    token: authToken(),
  });
}

// F5c — per-row Resend gallery email. Force-sends regardless of
// gallery_sent_at; the bulk Deliver button skips already-delivered.
export async function resendGallery(participantId: string): Promise<Participant> {
  return api<Participant>(
    `/api/v1/participants/${participantId}/resend-gallery`,
    { method: "POST", token: authToken() },
  );
}

export async function importCsv(
  jobId: string,
  file: File,
): Promise<CsvImportResult> {
  // FormData uploads — DON'T set Content-Type; the browser sets it with boundary.
  const fd = new FormData();
  fd.append("file", file);
  const base = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
  const res = await fetch(`${base}/api/v1/jobs/${jobId}/participants/import`, {
    method: "POST",
    headers: { Authorization: `Bearer ${authToken()}` },
    body: fd,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      (body as { detail?: string })?.detail ?? `Upload failed: ${res.status}`,
    );
  }
  return (await res.json()) as CsvImportResult;
}

// --- Public (no auth) ---

export async function getPublicJob(slug: string): Promise<PublicJob> {
  return api<PublicJob>(`/api/v1/public/jobs/${slug}`);
}

export async function listPublicSlots(slug: string): Promise<PublicSlot[]> {
  const res = await api<{ slots: PublicSlot[] }>(
    `/api/v1/public/jobs/${slug}/slots`,
  );
  return res.slots;
}

export async function bookPublicSlot(
  slug: string,
  galleryToken: string,
  slotStart: string,
): Promise<PublicSlot> {
  return api<PublicSlot>(`/api/v1/public/jobs/${slug}/book-slot`, {
    method: "POST",
    body: JSON.stringify({ gallery_token: galleryToken, slot_start: slotStart }),
  });
}

export type PublicSignupResult = {
  participant: Participant;
  created: boolean;
};

export async function publicSignup(
  slug: string,
  input: { name: string; email: string; title?: string | null; consent: boolean },
): Promise<PublicSignupResult> {
  const body: Record<string, unknown> = {
    name: input.name,
    email: input.email,
    consent: input.consent,
  };
  if (input.title) body.title = input.title;
  return api<PublicSignupResult>(`/api/v1/public/jobs/${slug}/signup`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

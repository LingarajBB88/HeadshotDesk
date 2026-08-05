// Public gallery API client — no auth, token-only.
// Mirrors backend at /api/v1/public/gallery/{token}/...

import { api, ApiError } from "./api";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export type GalleryFile = {
  id: string;
  original_filename: string;
  uploaded_at: string;
  is_downloaded: boolean;
  /** F5b.2: starred by this participant as a favorite. */
  is_picked: boolean;
};

export type GalleryJob = {
  name: string;
  client_name: string | null;
  shoot_date: string | null;
};

export type Gallery = {
  participant_name: string;
  job: GalleryJob;
  files: GalleryFile[];
  download_cap: number;
  downloads_used: number;
  /** HSD-36: client branding on the gallery header. */
  client_logo_url?: string | null;
  /** F5b.2: favorites. Cap 0 = unlimited; disabled hides the UI. */
  picks_enabled: boolean;
  pick_cap: number;
  picks_used: number;
};

export async function getGallery(token: string): Promise<Gallery> {
  return api<Gallery>(`/api/v1/public/gallery/${encodeURIComponent(token)}`);
}

/**
 * F5b.2 — star or un-star a photo. Throws ApiError 409 when the per-job
 * cap is reached (message is participant-friendly, show it as-is).
 */
export async function setPick(
  token: string,
  fileId: string,
  picked: boolean,
): Promise<{ picked_file_ids: string[]; picks_used: number; pick_cap: number }> {
  return api(
    `/api/v1/public/gallery/${encodeURIComponent(token)}` +
      `/files/${encodeURIComponent(fileId)}/pick`,
    { method: "POST", body: JSON.stringify({ picked }) },
  );
}

// Browser-stable thumbnail URL — embed directly in <img src> so the browser
// can cache it. The endpoint sets Cache-Control: public, max-age=86400.
export function thumbnailUrl(token: string, fileId: string): string {
  return (
    `${BASE}/api/v1/public/gallery/${encodeURIComponent(token)}` +
    `/files/${encodeURIComponent(fileId)}/thumbnail`
  );
}

/**
 * Triggers a download in the browser. POSTs to the download endpoint, reads
 * the blob, then synthesizes an <a download> click. We use POST (not a
 * window.open) because the endpoint has a side-effect — incrementing the
 * participant's download counter — and we want a JSON-style error path when
 * the cap's already hit.
 *
 * Throws ApiError with status 403 when the cap is exceeded.
 */
/**
 * Fetch with a hard deadline. A hung request used to leave the gallery
 * stuck on "Saving…" forever with every button disabled, because the
 * promise never settled and the finally block never ran (seen in the
 * field 2026-08-04). Now it always ends, one way or another.
 */
async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  ms: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (e) {
    if ((e as DOMException)?.name === "AbortError") {
      throw new ApiError(
        408,
        "That took too long. Check your connection and try again.",
      );
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export async function downloadFile(
  token: string,
  fileId: string,
): Promise<{ filename: string }> {
  const res = await fetchWithTimeout(
    `${BASE}/api/v1/public/gallery/${encodeURIComponent(token)}` +
      `/files/${encodeURIComponent(fileId)}/download`,
    { method: "POST" },
    60_000,
  );

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const detail =
      typeof (body as { detail?: unknown }).detail === "string"
        ? ((body as { detail: string }).detail)
        : res.statusText;
    throw new ApiError(res.status, detail, body);
  }

  // Parse the suggested filename from Content-Disposition; fall back to the
  // file's storage id if the header is absent (shouldn't happen, defensive).
  const disposition = res.headers.get("Content-Disposition") ?? "";
  const match = /filename="([^"]+)"/.exec(disposition);
  const filename = match?.[1] ?? `headshot-${fileId}`;

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Defer revoke so the browser has time to start the actual save.
  setTimeout(() => URL.revokeObjectURL(url), 1000);

  return { filename };
}

/**
 * Bulk download: POSTs a list of file_ids and streams back a single .zip.
 * Backend enforces cap atomically — if the batch needs more new picks than
 * remaining, the request 403s and NO files are claimed (no partial state).
 *
 * Throws ApiError with status 403 when the batch exceeds remaining cap, 404
 * when any of the file IDs are foreign / the token is invalid.
 */
export async function downloadZip(
  token: string,
  fileIds: string[],
): Promise<{ filename: string }> {
  const res = await fetchWithTimeout(
    `${BASE}/api/v1/public/gallery/${encodeURIComponent(token)}/files/zip`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file_ids: fileIds }),
    },
    // Zips are built server-side from full-resolution originals, so allow
    // longer than a single download before giving up.
    180_000,
  );

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const detail =
      typeof (body as { detail?: unknown }).detail === "string"
        ? ((body as { detail: string }).detail)
        : res.statusText;
    throw new ApiError(res.status, detail, body);
  }

  const disposition = res.headers.get("Content-Disposition") ?? "";
  const match = /filename="([^"]+)"/.exec(disposition);
  const filename = match?.[1] ?? `photos-${Date.now()}.zip`;

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);

  return { filename };
}

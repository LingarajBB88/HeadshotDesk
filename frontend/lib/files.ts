// Files API client.

import { api } from "./api";
import { getAccessToken } from "./auth";

export type FileItem = {
  id: string;
  job_id: string;
  participant_id: string | null;
  original_filename: string;
  width: number | null;
  height: number | null;
  size_bytes: number;
  mime_type: string;
  variant: string;
  is_favorite: boolean;
  is_selected: boolean;
  uploaded_at: string;
};

export type FileList = {
  items: FileItem[];
  total: number;
  matched: number;
  unmatched: number;
};

export type FileUploadResult = {
  uploaded: FileItem[];
  skipped: string[];
  matched: number;
  unmatched: number;
  /** How many of the incoming files matched bytes we already had on the
   *  backend (Finder copy-paste, Cmd-D, re-export of the same shot). They
   *  get merged into the existing row instead of creating a new one. */
  duplicates: number;
};

function authToken(): string {
  const t = getAccessToken();
  if (!t) throw new Error("Not authenticated");
  return t;
}

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export async function listFiles(jobId: string): Promise<FileList> {
  return api<FileList>(`/api/v1/jobs/${jobId}/files`, { token: authToken() });
}

export async function uploadFiles(
  jobId: string,
  files: File[],
): Promise<FileUploadResult> {
  // FormData uploads — DON'T set Content-Type; the browser sets it with boundary.
  const fd = new FormData();
  for (const f of files) {
    fd.append("files", f);
  }
  const res = await fetch(`${BASE}/api/v1/jobs/${jobId}/files`, {
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
  return (await res.json()) as FileUploadResult;
}

export async function deleteFile(fileId: string): Promise<void> {
  await api(`/api/v1/files/${fileId}`, {
    method: "DELETE",
    token: authToken(),
  });
}

export async function reassignFile(
  fileId: string,
  participantId: string | null,
): Promise<FileItem> {
  return api<FileItem>(`/api/v1/files/${fileId}`, {
    method: "PATCH",
    token: authToken(),
    body: JSON.stringify({ participant_id: participantId }),
  });
}

export async function bulkDeleteFiles(
  jobId: string,
  fileIds: string[],
): Promise<{ deleted: number; not_found: string[] }> {
  return api<{ deleted: number; not_found: string[] }>(
    `/api/v1/jobs/${jobId}/files/bulk-delete`,
    {
      method: "POST",
      token: authToken(),
      body: JSON.stringify({ file_ids: fileIds }),
    },
  );
}

export async function renameFile(
  fileId: string,
  newFilename: string,
): Promise<FileItem> {
  return api<FileItem>(`/api/v1/files/${fileId}`, {
    method: "PATCH",
    token: authToken(),
    body: JSON.stringify({ original_filename: newFilename }),
  });
}

/** URL to stream a file's full-resolution bytes (used by JS fetches with
 *  Authorization header — <img src> can't send headers). */
export function fileRawUrl(fileId: string): string {
  return `${BASE}/api/v1/files/${fileId}/raw`;
}

/** URL to stream a small (≤400px) thumbnail of the file. ~100x smaller than
 *  the original — preferred for gallery previews. */
export function fileThumbnailUrl(fileId: string): string {
  return `${BASE}/api/v1/files/${fileId}/thumbnail`;
}

// --- Display helpers ---

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

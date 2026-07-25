// HSD-36 — Clients API: the companies a photographer shoots for. Owns
// branding (logo) that every job for that client inherits.

import { api } from "./api";
import { getAccessToken } from "./auth";

function authToken(): string {
  const t = getAccessToken();
  if (!t) throw new Error("Not authenticated");
  return t;
}

export type Client = {
  id: string;
  name: string;
  logo_url: string | null;
  jobs_total: number;
  created_at: string;
};

export async function listClients(): Promise<Client[]> {
  const res = await api<{ items: Client[] }>("/api/v1/clients", {
    token: authToken(),
  });
  return res.items;
}

export async function createClient(name: string): Promise<Client> {
  return api<Client>("/api/v1/clients", {
    method: "POST",
    token: authToken(),
    body: JSON.stringify({ name }),
  });
}

export async function renameClient(id: string, name: string): Promise<Client> {
  return api<Client>(`/api/v1/clients/${id}`, {
    method: "PATCH",
    token: authToken(),
    body: JSON.stringify({ name }),
  });
}

export async function deleteClient(id: string): Promise<void> {
  await api(`/api/v1/clients/${id}`, {
    method: "DELETE",
    token: authToken(),
  });
}

export async function uploadClientLogo(
  id: string,
  file: File,
): Promise<Client> {
  // Multipart: bypass the JSON api() wrapper's content-type header.
  const form = new FormData();
  form.append("file", file);
  const base = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
  const res = await fetch(`${base}/api/v1/clients/${id}/logo`, {
    method: "POST",
    headers: { Authorization: `Bearer ${authToken()}` },
    body: form,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      (body as { detail?: string }).detail ?? "Logo upload failed.",
    );
  }
  return (await res.json()) as Client;
}

export async function removeClientLogo(id: string): Promise<Client> {
  return api<Client>(`/api/v1/clients/${id}/logo`, {
    method: "DELETE",
    token: authToken(),
  });
}

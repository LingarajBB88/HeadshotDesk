// HSD-66 — operator dashboard API client. Admin-only endpoints; the server
// returns 403 for non-admins, which the page turns into a redirect.

import { api } from "./api";
import { getAccessToken } from "./auth";

function authToken(): string {
  const t = getAccessToken();
  if (!t) throw new Error("Not authenticated");
  return t;
}

export type AdminAccountRow = {
  account_id: string;
  name: string;
  email: string | null;
  plan: string;
  status:
    | "trial"
    | "active"
    | "beta"
    | "soft_locked"
    | "hibernating"
    | "cancelled";
  trial_days_left: number | null;
  signed_up_at: string;
  jobs_total: number;
  jobs_this_month: number;
  participants_total: number;
  photos_uploaded: number;
  galleries_delivered: number;
  downloads_used: number;
};

export type AdminOverview = {
  accounts_total: number;
  paying_customers: number;
  trials_in_flight: number;
  soft_locked: number;
  /** Free beta seats occupied, and the size of the pool. */
  beta_seats_used: number;
  beta_seats_cap: number;
  hibernating: number;
  cancelled: number;
  mrr_eur: number;
  jobs_total: number;
  jobs_this_month: number;
  participants_total: number;
  photos_uploaded: number;
  recent_signups: AdminAccountRow[];
};

export async function getAdminOverview(): Promise<AdminOverview> {
  return api<AdminOverview>("/api/v1/admin/overview", { token: authToken() });
}

export async function updateAdminAccount(
  accountId: string,
  patch: { name?: string; plan?: string; extend_trial_days?: number },
): Promise<AdminAccountRow> {
  return api<AdminAccountRow>(`/api/v1/admin/accounts/${accountId}`, {
    method: "PATCH",
    token: authToken(),
    body: JSON.stringify(patch),
  });
}

export async function listAdminAccounts(params: {
  search?: string;
  status?: string;
}): Promise<{ items: AdminAccountRow[]; total: number }> {
  const qs = new URLSearchParams();
  if (params.search) qs.set("search", params.search);
  if (params.status) qs.set("status", params.status);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return api<{ items: AdminAccountRow[]; total: number }>(
    `/api/v1/admin/accounts${suffix}`,
    { token: authToken() },
  );
}

// HSD-81 — build (or rebuild) the walkthrough demo job in the admin's own
// account from uploaded headshots. Multipart, so plain fetch: api() sends
// JSON.
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export type DemoJobResult = {
  job_id: string;
  people_photographed: number;
  photos: number;
  day_two_bookings: number;
};

export async function createDemoJob(files: File[]): Promise<DemoJobResult> {
  const fd = new FormData();
  for (const f of files) fd.append("files", f);
  const res = await fetch(`${API_BASE}/api/v1/admin/demo-job`, {
    method: "POST",
    headers: { Authorization: `Bearer ${getAccessToken() ?? ""}` },
    body: fd,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { detail?: string })?.detail ?? `Failed: ${res.status}`);
  }
  return (await res.json()) as DemoJobResult;
}

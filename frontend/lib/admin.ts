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
  status: "trial" | "active" | "soft_locked" | "hibernating" | "cancelled";
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

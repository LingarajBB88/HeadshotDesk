// Referral links and the free beta seat pool.

import { api } from "./api";
import { getAccessToken } from "./auth";

export type MyReferral = {
  code: string;
  url: string;
  clicks: number;
  signups: number;
  converted: number;
  /** Extra trial days the referred person gets. Quoted in the pitch copy. */
  bonus_days: number;
};

export type ReferralFunnel = {
  clicks: number;
  signups: number;
  converted: number;
  click_to_signup_pct: number;
  signup_to_paid_pct: number;
};

export type BetaSeats = {
  cap: number;
  used: number;
  remaining: number;
};

export type TopReferrer = {
  account_id: string;
  account_name: string;
  code: string | null;
  clicks: number;
  signups: number;
  converted: number;
};

export type InviteCode = {
  id: string;
  code: string;
  label: string | null;
  max_uses: number;
  used_count: number;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
};

export type ReferralOverview = {
  funnel: ReferralFunnel;
  seats: BetaSeats;
  top_referrers: TopReferrer[];
  invite_codes: InviteCode[];
};

function authToken(): string {
  const t = getAccessToken();
  if (!t) throw new Error("Not authenticated");
  return t;
}

export async function getMyReferral(): Promise<MyReferral> {
  return api<MyReferral>("/api/v1/me/referral", { token: authToken() });
}

export async function getReferralOverview(): Promise<ReferralOverview> {
  return api<ReferralOverview>("/api/v1/admin/referrals", {
    token: authToken(),
  });
}

export async function createInviteCode(input: {
  label?: string | null;
  max_uses?: number;
}): Promise<InviteCode> {
  return api<InviteCode>("/api/v1/admin/invite-codes", {
    method: "POST",
    token: authToken(),
    body: JSON.stringify({
      label: input.label || null,
      max_uses: input.max_uses ?? 1,
    }),
  });
}

export async function revokeInviteCode(id: string): Promise<InviteCode> {
  return api<InviteCode>(`/api/v1/admin/invite-codes/${id}/revoke`, {
    method: "POST",
    token: authToken(),
  });
}

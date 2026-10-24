// HSD-21 — plan status, Stripe Checkout and the Customer Portal.
import { api } from "./api";
import { getAccessToken } from "./auth";

export type BillingStatus = {
  billing_enabled: boolean;
  plan: string;
  /** trial | expired | starter | pro | beta | hibernate | cancelled */
  state: string;
  can_deliver: boolean;
  read_only: boolean;
  trial_days_left: number | null;
  max_active_jobs: number | null;
  max_participants: number | null;
  active_jobs: number;
  participants: number;
  subscription_status: string | null;
  current_period_end: string | null;
  currency: string | null;
  currencies: string[];
  has_customer: boolean;
};

const token = () => getAccessToken() ?? undefined;

export function getBilling(): Promise<BillingStatus> {
  return api<BillingStatus>("/api/v1/billing", { token: token() });
}

export async function startCheckout(plan: "starter" | "pro", currency?: string): Promise<void> {
  const { url } = await api<{ url: string }>("/api/v1/billing/checkout", {
    method: "POST",
    token: token(),
    body: JSON.stringify({ plan, currency }),
  });
  window.location.href = url;
}

export async function openPortal(): Promise<void> {
  const { url } = await api<{ url: string }>("/api/v1/billing/portal", {
    method: "POST",
    token: token(),
  });
  window.location.href = url;
}

/** List prices per D-023. Display only; Stripe charges the real amount. */
export const PLAN_PRICES: Record<string, Record<string, string>> = {
  usd: { starter: "$29", pro: "$59" },
  eur: { starter: "€29", pro: "€59" },
};

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
  /** month | year, once subscribed */
  interval: string | null;
  intervals: string[];
  has_customer: boolean;
  studio_waitlist: boolean;
};

export type Interval = "month" | "year";

const token = () => getAccessToken() ?? undefined;

export function getBilling(): Promise<BillingStatus> {
  return api<BillingStatus>("/api/v1/billing", { token: token() });
}

export async function startCheckout(
  plan: "starter" | "pro",
  currency?: string,
  interval: Interval = "month",
): Promise<void> {
  const { url } = await api<{ url: string }>("/api/v1/billing/checkout", {
    method: "POST",
    token: token(),
    body: JSON.stringify({ plan, currency, interval }),
  });
  window.location.href = url;
}

export function joinStudioWaitlist(): Promise<void> {
  return api<void>("/api/v1/billing/studio-waitlist", { method: "POST", token: token() });
}

export async function openPortal(): Promise<void> {
  const { url } = await api<{ url: string }>("/api/v1/billing/portal", {
    method: "POST",
    token: token(),
  });
  window.location.href = url;
}

/**
 * List prices per D-023 (locked 2026-10-25). Display only; Stripe charges
 * the real amount. Annual is two months free.
 */
export const PLAN_PRICES: Record<string, Record<Interval, Record<string, string>>> = {
  usd: {
    month: { starter: "$25", pro: "$59", studio: "$100" },
    year: { starter: "$250", pro: "$590", studio: "$1,000" },
  },
  eur: {
    month: { starter: "€25", pro: "€59", studio: "€100" },
    year: { starter: "€250", pro: "€590", studio: "€1.000" },
  },
};

"use client";

// Plan and billing (HSD-21, D-023). Choosing a plan sends the photographer
// to Stripe Checkout; managing an existing subscription (card, plan change,
// invoices, cancel) happens in Stripe's Customer Portal. We never handle
// card details ourselves.

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { ApiError } from "@/lib/api";
import {
  getBilling,
  openPortal,
  PLAN_PRICES,
  startCheckout,
  type BillingStatus,
} from "@/lib/billing";

const PLANS: {
  id: "starter" | "pro";
  name: string;
  points: string[];
}[] = [
  {
    id: "starter",
    name: "Starter",
    points: ["One active job at a time", "Unlimited participants", "Everything else included"],
  },
  {
    id: "pro",
    name: "Pro",
    points: ["Unlimited jobs", "Unlimited participants", "Everything else included"],
  },
];

const STATE_LABEL: Record<string, string> = {
  trial: "Free month",
  expired: "Free month ended",
  starter: "Starter",
  pro: "Pro",
  beta: "Beta seat",
  hibernate: "Hibernating",
  cancelled: "Cancelled",
};

function BillingInner() {
  const params = useSearchParams();
  const [b, setB] = useState<BillingStatus | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getBilling().then(setB).catch(() => setError("Couldn't load your plan."));
  }, []);

  async function go(key: string, fn: () => Promise<void>) {
    setBusy(key);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong. Please try again.");
      setBusy(null);
    }
  }

  if (error && !b) return <p className="text-sm text-red-600">{error}</p>;
  if (!b) return <p className="text-sm text-muted-600">Loading…</p>;

  const currency = (b.currency ?? b.currencies[0] ?? "usd").toLowerCase();
  const prices = PLAN_PRICES[currency] ?? PLAN_PRICES.usd;
  const subscribed = ["starter", "pro"].includes(b.state) && !!b.subscription_status;
  const checkout = params?.get("checkout");

  return (
    <div className="max-w-3xl">
      <p className="text-sm">
        <Link href="/settings" className="text-muted-600 hover:text-ink">
          ← Studio details
        </Link>
      </p>
      <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight">Plan and billing</h1>

      {checkout === "success" ? (
        <p className="mt-4 rounded-card border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          Thank you. Your plan is active as soon as Stripe confirms the payment, usually within a minute.
        </p>
      ) : null}

      <div className="mt-6 rounded-card border border-muted-200 bg-paper p-5">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-600">Current plan</p>
        <p className="mt-1 font-display text-xl font-semibold tracking-tight">
          {STATE_LABEL[b.state] ?? b.plan}
        </p>
        <p className="mt-1 text-sm text-muted-600">
          {b.state === "trial"
            ? `${b.trial_days_left ?? 0} days left. Set up jobs, add people, shoot and upload as much as you like. Sending galleries and delivery emails needs a plan.`
            : b.state === "expired"
              ? "Your account is read-only. Your jobs and photos are kept; choose a plan to pick up where you left off."
              : b.state === "beta"
                ? "A free beta seat. Everything is included and nothing expires."
                : b.current_period_end
                  ? `Renews on ${new Date(b.current_period_end).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}.`
                  : null}
        </p>
        {b.max_active_jobs !== null ? (
          <p className="mt-2 text-sm text-muted-600">
            {b.active_jobs} of {b.max_active_jobs} active job in use. Archive a finished job to start the next.
          </p>
        ) : null}
        {b.has_customer ? (
          <button
            type="button"
            onClick={() => go("portal", openPortal)}
            disabled={busy !== null}
            className="btn-secondary mt-4 text-sm disabled:opacity-60"
          >
            {busy === "portal" ? "Opening…" : "Manage billing"}
          </button>
        ) : null}
      </div>

      {!b.billing_enabled ? (
        <p className="mt-6 text-sm text-muted-600">
          Plans open soon. Until then everything stays free.
        </p>
      ) : b.state === "beta" ? null : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {PLANS.map((p) => {
            const current = subscribed && b.state === p.id;
            return (
              <div
                key={p.id}
                className={
                  "rounded-card border p-5 " +
                  (p.id === "pro" ? "border-accent/40 bg-accent-muted" : "border-muted-200 bg-paper")
                }
              >
                <p className="font-display text-lg font-semibold tracking-tight">{p.name}</p>
                <p className="mt-1">
                  <span className="font-display text-3xl font-semibold">{prices[p.id]}</span>
                  <span className="text-sm text-muted-600"> / month</span>
                </p>
                <ul className="mt-3 flex flex-col gap-1.5 text-sm text-muted-600">
                  {p.points.map((pt) => (
                    <li key={pt}>{pt}</li>
                  ))}
                </ul>
                {current ? (
                  <p className="mt-4 text-sm font-medium text-green-700">Your plan</p>
                ) : subscribed ? (
                  <button
                    type="button"
                    onClick={() => go("portal", openPortal)}
                    disabled={busy !== null}
                    className="btn-secondary mt-4 text-sm disabled:opacity-60"
                  >
                    Switch in Manage billing
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => go(p.id, () => startCheckout(p.id, currency))}
                    disabled={busy !== null}
                    className="btn-primary mt-4 text-sm disabled:opacity-60"
                  >
                    {busy === p.id ? "Opening checkout…" : `Choose ${p.name}`}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

      <p className="mt-6 text-xs text-muted-600">
        Payments are handled by Stripe. Cancel any time from Manage billing; your jobs and photos
        are kept and galleries you already delivered stay online.
      </p>
    </div>
  );
}

export default function BillingPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-600">Loading…</p>}>
      <BillingInner />
    </Suspense>
  );
}

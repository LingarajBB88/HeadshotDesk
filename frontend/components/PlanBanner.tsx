"use client";

// One line at the top of the app about the account's plan, shown only when
// it changes what the photographer can do: during the free month (delivery
// is part of a paid plan) and when the account is read-only. Silent for
// paying accounts and while billing is switched off.

import type { Route } from "next";
import Link from "next/link";
import { useEffect, useState } from "react";

import { getBilling, type BillingStatus } from "@/lib/billing";

export function PlanBanner() {
  const [b, setB] = useState<BillingStatus | null>(null);
  useEffect(() => {
    getBilling().then(setB).catch(() => setB(null));
  }, []);
  if (!b || !b.billing_enabled) return null;

  let text: string | null = null;
  if (b.read_only) {
    text = "Your account is read-only. Your jobs and photos are kept; choose a plan to keep working.";
  } else if (b.state === "trial") {
    const d = b.trial_days_left ?? 0;
    text = `Free month: ${d} ${d === 1 ? "day" : "days"} left. Set up and shoot as much as you like; delivering photos needs a plan.`;
  }
  if (!text) return null;

  return (
    <div className="border-b border-accent/20 bg-accent-muted">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm sm:px-6">
        <span className="text-ink">{text}</span>
        <Link href={"/settings/billing" as Route} className="font-medium text-accent hover:underline">
          See plans
        </Link>
      </div>
    </div>
  );
}

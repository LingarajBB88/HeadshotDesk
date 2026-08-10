"use client";

import { useEffect, useState } from "react";

import { getMyReferral, type MyReferral } from "@/lib/referrals";

/**
 * The photographer's own share link and what it's done.
 *
 * Clicks are shown alongside signups on purpose: a link with fifty clicks
 * and no signups is telling you something different from one nobody opened,
 * and only one of those is worth changing your pitch over.
 */
export function ReferralCard() {
  const [data, setData] = useState<MyReferral | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const d = await getMyReferral();
        if (!cancelled) setData(d);
      } catch {
        if (!cancelled) setError("Couldn't load your referral link.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function copy() {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(data.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked outside https; the URL is on screen to copy by hand.
    }
  }

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!data) return <p className="text-sm text-muted-600">Loading…</p>;

  return (
    <div className="rounded-card border border-muted-200 bg-paper p-5">
      <h3 className="text-sm font-semibold text-ink">Invite another photographer</h3>
      {/* What the link grants depends on who's holding it and whether the
          beta pool still has room. Saying the wrong one means someone
          promises a friend something that doesn't arrive. */}
      <p className="mt-1 text-sm text-muted-600">
        {data.grants_seat ? (
          <>
            Share this link. Anyone who signs up through it joins the beta
            free, same as you. {data.seats_remaining} place
            {data.seats_remaining === 1 ? "" : "s"} left.
          </>
        ) : (
          <>
            Share this link. Anyone who signs up through it gets{" "}
            {data.bonus_days} extra days of trial, and we&apos;ll know they
            came from you.
          </>
        )}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2 rounded-card border border-muted-200 bg-muted-50 p-3">
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-accent">
          {data.url}
        </span>
        <button onClick={copy} className="btn-secondary text-xs shrink-0">
          {copied ? "Copied!" : "Copy link"}
        </button>
      </div>

      {/* The reward is stated before anyone has earned anything, otherwise
          it's a secret and nobody shares the link for it. */}
      {data.reward_months_each > 0 ? (
        <p className="mt-3 text-sm text-muted-600">
          When someone you introduced starts paying, you get{" "}
          <strong className="text-ink">
            {data.reward_months_each} free month
            {data.reward_months_each === 1 ? "" : "s"}
          </strong>
          .
        </p>
      ) : null}

      <dl className="mt-4 grid grid-cols-3 gap-3 text-center">
        <Stat label="Opened" value={data.clicks} />
        <Stat label="Signed up" value={data.signups} />
        <Stat label="Became customers" value={data.converted} />
      </dl>

      {data.credit_months > 0 ? (
        <p className="mt-3 rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">
          You&apos;ve earned{" "}
          <strong>
            {data.credit_months} free month
            {data.credit_months === 1 ? "" : "s"}
          </strong>
          . We&apos;ll take {data.credit_months === 1 ? "it" : "them"} off your
          next invoices.
        </p>
      ) : null}

      {data.clicks > 0 && data.signups === 0 ? (
        // The one case where the numbers are worth commenting on: people
        // are looking and not staying.
        <p className="mt-3 text-xs text-muted-600">
          People are opening the link but not signing up yet. It sometimes
          helps to say what you use it for rather than just sending the URL.
        </p>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-card border border-muted-200 bg-paper p-3">
      <dd className="text-xl font-semibold text-ink">{value}</dd>
      <dt className="mt-0.5 text-[11px] uppercase tracking-wider text-muted-600">
        {label}
      </dt>
    </div>
  );
}

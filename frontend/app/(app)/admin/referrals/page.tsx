"use client";

// Operator view: where signups come from, and how much of the free tier is
// left. The seat count is the number that costs money if nobody watches it.

import Link from "next/link";
import { useEffect, useState } from "react";

import { SortableHeader, useSort } from "@/components/SortableHeader";
import {
  createInviteCode,
  getReferralOverview,
  revokeInviteCode,
  type ReferralOverview,
} from "@/lib/referrals";

export default function AdminReferralsPage() {
  const [data, setData] = useState<ReferralOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [label, setLabel] = useState("");
  const [maxUses, setMaxUses] = useState("1");
  const [copied, setCopied] = useState<string | null>(null);

  const { sort, toggle, sorted } = useSort<"signups" | "clicks" | "name">({
    key: "signups",
    dir: "desc",
  });

  async function refresh() {
    try {
      setData(await getReferralOverview());
      setError(null);
    } catch {
      setError("Couldn't load referral data.");
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function mint() {
    setBusy(true);
    try {
      await createInviteCode({
        label: label.trim() || null,
        max_uses: Math.max(Number(maxUses) || 1, 1),
      });
      setLabel("");
      setMaxUses("1");
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function copy(code: string) {
    const base =
      typeof window !== "undefined" ? window.location.origin : "";
    try {
      await navigator.clipboard.writeText(`${base}/signup?invite=${code}`);
      setCopied(code);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // Clipboard blocked; the code is on screen.
    }
  }

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!data) return <p className="text-sm text-muted-600">Loading…</p>;

  const seatsTight = data.seats.remaining <= Math.max(data.seats.cap * 0.2, 1);

  return (
    <div>
      <Link
        href="/admin"
        className="text-sm text-muted-600 hover:text-ink transition"
      >
        &larr; Back to admin
      </Link>
      <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight">
        Referrals and free seats
      </h1>

      {/* Funnel. Clicks first, because a link nobody opens and a link
          everybody bounces off need different fixes. */}
      <div className="mt-8 grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Tile label="Link opens" value={data.funnel.clicks} />
        <Tile
          label="Signed up"
          value={data.funnel.signups}
          sub={`${data.funnel.click_to_signup_pct}% of opens`}
        />
        <Tile
          label="Became customers"
          value={data.funnel.converted}
          sub={`${data.funnel.signup_to_paid_pct}% of signups`}
        />
        <Tile
          label="Free seats used"
          value={`${data.seats.used} / ${data.seats.cap}`}
          tone={seatsTight ? "warn" : undefined}
        />
        <Tile
          label="Seats left"
          value={data.seats.remaining}
          tone={data.seats.remaining === 0 ? "warn" : undefined}
        />
      </div>

      {data.seats.remaining === 0 && data.seats.cap > 0 ? (
        <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          The free pool is empty. Invite codes still validate, but anyone
          using one now gets a normal trial instead of a free seat. Raise
          FREE_SEAT_CAP to open more.
        </p>
      ) : null}

      {/* Invite codes */}
      <h2 className="mt-12 font-display text-xl font-semibold tracking-tight">
        Invite codes
      </h2>
      <p className="mt-1 text-sm text-muted-600">
        Each code hands out free beta seats from the pool above. Max uses is a
        ceiling, not a promise: the pool always wins.
      </p>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="block text-xs font-medium text-muted-600">
            Label (who it&apos;s for)
          </span>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Amsterdam meetup"
            className="mt-1 w-56 rounded-md border border-muted-200 bg-paper px-2 py-1.5 text-sm outline-none focus:border-accent"
          />
        </label>
        <label className="block">
          <span className="block text-xs font-medium text-muted-600">
            Max uses
          </span>
          <input
            type="number"
            min={1}
            max={500}
            value={maxUses}
            onChange={(e) => setMaxUses(e.target.value)}
            className="mt-1 w-24 rounded-md border border-muted-200 bg-paper px-2 py-1.5 text-sm outline-none focus:border-accent"
          />
        </label>
        <button
          onClick={mint}
          disabled={busy}
          className="btn-primary text-xs disabled:opacity-60"
        >
          {busy ? "Creating…" : "Create code"}
        </button>
      </div>

      {data.invite_codes.length === 0 ? (
        <p className="mt-4 text-sm text-muted-600">No codes yet.</p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-card border border-muted-200 bg-paper">
          <table className="w-full text-sm">
            <thead className="bg-muted-50 text-left text-xs font-medium uppercase tracking-wider text-muted-600">
              <tr>
                <th className="px-4 py-2.5">Code</th>
                <th className="px-4 py-2.5">Label</th>
                <th className="px-4 py-2.5">Used</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-muted-200">
              {data.invite_codes.map((c) => {
                const exhausted = c.used_count >= c.max_uses;
                return (
                  <tr key={c.id}>
                    <td className="px-4 py-2.5 font-mono text-ink">{c.code}</td>
                    <td className="px-4 py-2.5 text-muted-600">
                      {c.label ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 text-muted-600">
                      {c.used_count} / {c.max_uses}
                    </td>
                    <td className="px-4 py-2.5">
                      {c.revoked_at ? (
                        <span className="text-muted-400">Revoked</span>
                      ) : exhausted ? (
                        <span className="text-muted-400">Used up</span>
                      ) : (
                        <span className="text-green-700">Active</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      <button
                        onClick={() => copy(c.code)}
                        className="text-xs text-accent hover:underline"
                      >
                        {copied === c.code ? "Copied!" : "Copy link"}
                      </button>
                      {!c.revoked_at ? (
                        <button
                          onClick={async () => {
                            await revokeInviteCode(c.id);
                            await refresh();
                          }}
                          className="ml-3 text-xs text-muted-600 hover:text-red-600"
                        >
                          Revoke
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Who's actually referring */}
      <h2 className="mt-12 font-display text-xl font-semibold tracking-tight">
        Top referrers
      </h2>
      {data.top_referrers.length === 0 ? (
        <p className="mt-2 text-sm text-muted-600">
          Nobody has shared their link yet.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-card border border-muted-200 bg-paper">
          <table className="w-full text-sm">
            <thead className="bg-muted-50 text-left text-xs font-medium uppercase tracking-wider text-muted-600">
              <tr>
                <SortableHeader
                  label="Account"
                  sortKey="name"
                  sort={sort}
                  onSort={toggle}
                />
                <SortableHeader
                  label="Opens"
                  sortKey="clicks"
                  sort={sort}
                  onSort={toggle}
                />
                <SortableHeader
                  label="Signups"
                  sortKey="signups"
                  sort={sort}
                  onSort={toggle}
                />
                <th className="px-4 py-2.5">Customers</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-muted-200">
              {sorted(data.top_referrers, (r, key) =>
                key === "name" ? r.account_name : r[key],
              ).map((r) => (
                <tr key={r.account_id}>
                  <td className="px-4 py-2.5 text-ink">{r.account_name}</td>
                  <td className="px-4 py-2.5 text-muted-600">{r.clicks}</td>
                  <td className="px-4 py-2.5 text-muted-600">{r.signups}</td>
                  <td className="px-4 py-2.5 text-muted-600">{r.converted}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Tile({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string | number;
  sub?: string;
  tone?: "warn";
}) {
  return (
    <div
      className={
        "rounded-card border p-4 " +
        (tone === "warn"
          ? "border-amber-200 bg-amber-50"
          : "border-muted-200 bg-paper")
      }
    >
      <p
        className={
          "text-2xl font-semibold " +
          (tone === "warn" ? "text-amber-800" : "text-ink")
        }
      >
        {value}
      </p>
      <p className="mt-0.5 text-xs uppercase tracking-wider text-muted-600">
        {label}
      </p>
      {sub ? <p className="mt-1 text-xs text-muted-600">{sub}</p> : null}
    </div>
  );
}

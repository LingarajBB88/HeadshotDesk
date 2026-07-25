"use client";

// HSD-66 — Operator dashboard. Admin-only view of the business: accounts,
// trial/subscription status, usage, and top-line metrics. The backend gates
// every request; a 403 here bounces the visitor back to /jobs.

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { ApiError } from "@/lib/api";
import {
  getAdminOverview,
  listAdminAccounts,
  type AdminAccountRow,
  type AdminOverview,
} from "@/lib/admin";
import { SearchInput } from "@/components/SearchInput";

const STATUS_LABELS: Record<AdminAccountRow["status"], string> = {
  trial: "Trial",
  active: "Active",
  soft_locked: "Soft-locked",
  hibernating: "Hibernating",
  cancelled: "Cancelled",
};

const STATUS_STYLES: Record<AdminAccountRow["status"], string> = {
  trial: "bg-blue-50 text-blue-700",
  active: "bg-green-100 text-green-700",
  soft_locked: "bg-amber-50 text-amber-700",
  hibernating: "bg-muted-100 text-muted-600",
  cancelled: "bg-red-50 text-red-700",
};

function StatusPill({ row }: { row: AdminAccountRow }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${STATUS_STYLES[row.status]}`}
    >
      {STATUS_LABELS[row.status]}
      {row.status === "trial" && row.trial_days_left != null
        ? ` · ${row.trial_days_left}d left`
        : ""}
      {row.status === "active" ? ` · ${row.plan}` : ""}
    </span>
  );
}

function MetricTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-card border border-muted-200 bg-paper p-4">
      <p className="text-xs text-muted-600">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-ink">{value}</p>
    </div>
  );
}

export default function AdminPage() {
  const router = useRouter();
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [accounts, setAccounts] = useState<AdminAccountRow[] | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const o = await getAdminOverview();
        if (!cancelled) setOverview(o);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 403) {
          router.replace("/jobs");
          return;
        }
        setError("Couldn't load the dashboard.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  // Accounts list refetches as search/filter change (small dataset, no
  // debounce needed at beta scale).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await listAdminAccounts({
          search: search.trim() || undefined,
          status: statusFilter || undefined,
        });
        if (!cancelled) setAccounts(res.items);
      } catch {
        if (!cancelled) setAccounts([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [search, statusFilter]);

  if (error) {
    return <p className="text-sm text-red-600">{error}</p>;
  }
  if (!overview) {
    return <p className="text-sm text-muted-600">Loading…</p>;
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink">Admin</h1>
      <p className="mt-1 text-sm text-muted-600">
        Operator view: accounts, trials, and usage across all of HeadshotDesk.
      </p>

      {/* --- Business metrics ------------------------------------------ */}
      <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <MetricTile label="MRR" value={`€${overview.mrr_eur}`} />
        <MetricTile label="Paying customers" value={overview.paying_customers} />
        <MetricTile label="Trials in flight" value={overview.trials_in_flight} />
        <MetricTile label="Soft-locked" value={overview.soft_locked} />
        <MetricTile label="Accounts" value={overview.accounts_total} />
        <MetricTile label="Jobs this month" value={overview.jobs_this_month} />
      </div>
      <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <MetricTile label="Jobs all-time" value={overview.jobs_total} />
        <MetricTile label="Participants" value={overview.participants_total} />
        <MetricTile label="Photos uploaded" value={overview.photos_uploaded} />
        <MetricTile label="Hibernating" value={overview.hibernating} />
        <MetricTile label="Cancelled" value={overview.cancelled} />
      </div>

      {/* --- Accounts table -------------------------------------------- */}
      <div className="mt-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-ink">
            Accounts{accounts ? ` (${accounts.length})` : ""}
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Search email or studio…"
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-md border border-muted-200 bg-paper px-2 py-1.5 text-sm outline-none focus:border-accent"
              aria-label="Filter by status"
            >
              <option value="">All statuses</option>
              <option value="trial">Trial</option>
              <option value="active">Active</option>
              <option value="soft_locked">Soft-locked</option>
              <option value="hibernating">Hibernating</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto rounded-card border border-muted-200 bg-paper">
          <table className="w-full text-sm">
            <thead className="bg-muted-50 text-left text-xs font-medium uppercase tracking-wider text-muted-600">
              <tr>
                <th className="px-4 py-3">Studio</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Signed up</th>
                <th className="px-4 py-3 text-right">Jobs</th>
                <th className="px-4 py-3 text-right">This month</th>
                <th className="px-4 py-3 text-right">Participants</th>
                <th className="px-4 py-3 text-right">Photos</th>
                <th className="px-4 py-3 text-right">Delivered</th>
                <th className="px-4 py-3 text-right">Downloads</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-muted-200">
              {accounts === null ? (
                <tr>
                  <td colSpan={10} className="px-4 py-6 text-muted-600">
                    Loading…
                  </td>
                </tr>
              ) : accounts.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-6 text-muted-600">
                    No accounts match.
                  </td>
                </tr>
              ) : (
                accounts.map((a) => (
                  <tr key={a.account_id} className="hover:bg-muted-50 transition">
                    <td className="px-4 py-3 font-medium text-ink">{a.name}</td>
                    <td className="px-4 py-3 text-muted-600">
                      {a.email ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill row={a} />
                    </td>
                    <td className="px-4 py-3 text-muted-600">
                      {new Date(a.signed_up_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right">{a.jobs_total}</td>
                    <td className="px-4 py-3 text-right">{a.jobs_this_month}</td>
                    <td className="px-4 py-3 text-right">
                      {a.participants_total}
                    </td>
                    <td className="px-4 py-3 text-right">{a.photos_uploaded}</td>
                    <td className="px-4 py-3 text-right">
                      {a.galleries_delivered}
                    </td>
                    <td className="px-4 py-3 text-right">{a.downloads_used}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* --- Recent signups -------------------------------------------- */}
      <div className="mt-10">
        <h2 className="text-lg font-semibold text-ink">Recent signups</h2>
        <ul className="mt-3 divide-y divide-muted-200 rounded-card border border-muted-200 bg-paper">
          {overview.recent_signups.map((a) => (
            <li
              key={a.account_id}
              className="flex flex-wrap items-center gap-3 px-4 py-2.5"
            >
              <span className="font-medium text-ink">{a.name}</span>
              <span className="text-muted-600 text-xs">{a.email ?? "—"}</span>
              <span className="ml-auto text-xs text-muted-600">
                {new Date(a.signed_up_at).toLocaleDateString()}
              </span>
              <StatusPill row={a} />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

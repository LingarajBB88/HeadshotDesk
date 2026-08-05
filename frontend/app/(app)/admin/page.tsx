"use client";

// HSD-66 — Operator dashboard. Admin-only view of the business: accounts,
// trial/subscription status, usage, and top-line metrics. The backend gates
// every request; a 403 here bounces the visitor back to /jobs.

import { useRouter } from "next/navigation";
import { Fragment, useEffect, useState } from "react";

import { ApiError } from "@/lib/api";
import {
  getAdminOverview,
  listAdminAccounts,
  updateAdminAccount,
  type AdminAccountRow,
  type AdminOverview,
} from "@/lib/admin";
import { SearchInput } from "@/components/SearchInput";
import { SortableHeader, useSort } from "@/components/SortableHeader";

// Inline per-account editor: manual admin actions (rename, change plan,
// extend trial). Server-gated; this is just the console for it.
function AccountEditor({
  row,
  onSaved,
  onClose,
}: {
  row: AdminAccountRow;
  onSaved: (updated: AdminAccountRow) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(row.name);
  const [plan, setPlan] = useState(row.plan);
  const [extendDays, setExtendDays] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const patch: {
        name?: string;
        plan?: string;
        extend_trial_days?: number;
      } = {};
      if (name.trim() && name.trim() !== row.name) patch.name = name.trim();
      if (plan !== row.plan) patch.plan = plan;
      const days = Number(extendDays);
      if (Number.isFinite(days) && days >= 1) patch.extend_trial_days = days;
      if (Object.keys(patch).length === 0) {
        onClose();
        return;
      }
      onSaved(await updateAdminAccount(row.account_id, patch));
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Couldn't save the changes.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-end gap-3 bg-muted-50 px-4 py-3">
      <label className="block">
        <span className="block text-xs font-medium text-muted-600">
          Studio name
        </span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 w-48 rounded-md border border-muted-200 bg-paper px-2 py-1.5 text-sm outline-none focus:border-accent"
        />
      </label>
      <label className="block">
        <span className="block text-xs font-medium text-muted-600">Plan</span>
        <select
          value={plan}
          onChange={(e) => setPlan(e.target.value)}
          className="mt-1 rounded-md border border-muted-200 bg-paper px-2 py-1.5 text-sm outline-none focus:border-accent"
        >
          <option value="trial">Trial</option>
          <option value="solo">Solo (€29)</option>
          <option value="pro">Pro (€44)</option>
          <option value="studio">Studio (€89)</option>
          <option value="hibernate">Hibernate (€7)</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </label>
      <label className="block">
        <span className="block text-xs font-medium text-muted-600">
          Extend trial (days)
        </span>
        <input
          type="number"
          min={1}
          max={365}
          value={extendDays}
          onChange={(e) => setExtendDays(e.target.value)}
          placeholder="e.g. 14"
          className="mt-1 w-24 rounded-md border border-muted-200 bg-paper px-2 py-1.5 text-sm outline-none focus:border-accent"
        />
      </label>
      <div className="flex items-center gap-2 pb-0.5">
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="btn-primary text-xs disabled:opacity-60"
        >
          {busy ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-muted-600 hover:text-ink transition"
        >
          Cancel
        </button>
      </div>
      {error ? (
        <p className="basis-full text-xs text-red-600" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

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
  const [editingId, setEditingId] = useState<string | null>(null);
  const { sort, toggle, sorted } = useSort<
    | "name"
    | "email"
    | "status"
    | "signed_up"
    | "jobs"
    | "jobs_month"
    | "participants"
    | "photos"
    | "delivered"
    | "downloads"
  >({ key: "signed_up", dir: "desc" });
  // Bumped to force a refetch of overview + accounts (after edits, and by
  // the 30s poll so the numbers always reflect current data).
  const [refreshKey, setRefreshKey] = useState(0);

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
        if (!overview) setError("Couldn't load the dashboard.");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, refreshKey]);

  // Live data: poll every 30s while the tab is visible, refresh on tab
  // return. Signups and usage happen out there; the console keeps up.
  useEffect(() => {
    const bump = () => {
      if (document.visibilityState === "visible") {
        setRefreshKey((k) => k + 1);
      }
    };
    const timer = window.setInterval(bump, 30000);
    document.addEventListener("visibilitychange", bump);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", bump);
    };
  }, []);

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
  }, [search, statusFilter, refreshKey]);

  // Newest signups first by default: that's what an operator checks.
  const sortedAccounts = accounts
    ? sorted(accounts, (a, key) => {
        switch (key) {
          case "email":
            return a.email ?? "";
          case "status":
            return a.status;
          case "signed_up":
            return a.signed_up_at;
          case "jobs":
            return a.jobs_total;
          case "jobs_month":
            return a.jobs_this_month;
          case "participants":
            return a.participants_total;
          case "photos":
            return a.photos_uploaded;
          case "delivered":
            return a.galleries_delivered;
          case "downloads":
            return a.downloads_used;
          default:
            return a.name;
        }
      })
    : null;

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
                <SortableHeader label="Studio" sortKey="name" sort={sort} onSort={toggle} />
                <SortableHeader label="Email" sortKey="email" sort={sort} onSort={toggle} />
                <SortableHeader label="Status" sortKey="status" sort={sort} onSort={toggle} />
                <SortableHeader label="Signed up" sortKey="signed_up" sort={sort} onSort={toggle} />
                <SortableHeader label="Jobs" sortKey="jobs" sort={sort} onSort={toggle} align="right" />
                <SortableHeader label="This month" sortKey="jobs_month" sort={sort} onSort={toggle} align="right" />
                <SortableHeader label="Participants" sortKey="participants" sort={sort} onSort={toggle} align="right" />
                <SortableHeader label="Photos" sortKey="photos" sort={sort} onSort={toggle} align="right" />
                <SortableHeader label="Delivered" sortKey="delivered" sort={sort} onSort={toggle} align="right" />
                <SortableHeader label="Downloads" sortKey="downloads" sort={sort} onSort={toggle} align="right" />
                <th className="px-4 py-3">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-muted-200">
              {accounts === null ? (
                <tr>
                  <td colSpan={11} className="px-4 py-6 text-muted-600">
                    Loading…
                  </td>
                </tr>
              ) : accounts.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-4 py-6 text-muted-600">
                    No accounts match.
                  </td>
                </tr>
              ) : (
                (sortedAccounts ?? []).map((a) => (
                  <Fragment key={a.account_id}>
                    <tr className="hover:bg-muted-50 transition">
                      <td className="px-4 py-3 font-medium text-ink">
                        {a.name}
                      </td>
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
                      <td className="px-4 py-3 text-right">
                        {a.jobs_this_month}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {a.participants_total}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {a.photos_uploaded}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {a.galleries_delivered}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {a.downloads_used}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() =>
                            setEditingId(
                              editingId === a.account_id
                                ? null
                                : a.account_id,
                            )
                          }
                          className="text-xs text-accent hover:underline"
                        >
                          {editingId === a.account_id ? "Close" : "Edit"}
                        </button>
                      </td>
                    </tr>
                    {editingId === a.account_id ? (
                      <tr>
                        <td colSpan={11} className="p-0">
                          <AccountEditor
                            row={a}
                            onSaved={(updated) => {
                              setAccounts((rows) =>
                                rows
                                  ? rows.map((r) =>
                                      r.account_id === updated.account_id
                                        ? updated
                                        : r,
                                    )
                                  : rows,
                              );
                              setEditingId(null);
                              // Metrics (MRR, trial counts) changed too.
                              setRefreshKey((k) => k + 1);
                            }}
                            onClose={() => setEditingId(null)}
                          />
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
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

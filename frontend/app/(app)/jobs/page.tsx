"use client";

import type { Route } from "next";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { EditJobModal } from "@/components/EditJobModal";
import { ReferralCard } from "@/components/ReferralCard";
import { SortableHeader, useSort } from "@/components/SortableHeader";
import { StatusPill } from "@/components/StatusPill";
import {
  archiveJob,
  getJob,
  listJobs,
  type Job,
  type JobListItem,
} from "@/lib/jobs";

/**
 * Table cell that wraps its content in a Link with `display: block` so the
 * full cell area becomes clickable. Padding lives on the link, not the td.
 */
function RowCell({
  href,
  children,
  className = "",
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <td className="p-0">
      {/* Cast for typedRoutes: the prop stays string so callers can build
          template URLs; every caller passes /jobs/{id} which is a real
          route. Next's generated Route union isn't available to standalone
          tsc, so a plain cast keeps local + Vercel builds consistent. */}
      <Link href={href as Route} className={`block px-5 py-3 ${className}`}>
        {children}
      </Link>
    </td>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={
        "py-2 -mb-px border-b-2 text-sm font-medium transition " +
        (active
          ? "border-accent text-ink"
          : "border-transparent text-muted-600 hover:text-ink")
      }
    >
      {children}
    </button>
  );
}

function EmptyState({ tab }: { tab: Tab }) {
  if (tab === "archived") {
    return (
      <div className="mt-10 rounded-card border border-dashed border-muted-200 bg-paper p-8 sm:p-10 text-center">
        <p className="text-sm text-ink font-medium">No archived jobs</p>
        <p className="mt-1 text-xs text-muted-600">
          Jobs you archive will show up here.
        </p>
      </div>
    );
  }
  return (
    <div className="mt-10 rounded-card border border-dashed border-muted-200 bg-paper p-8 sm:p-10 text-center">
      <p className="text-sm text-ink font-medium">No jobs yet</p>
      <p className="mt-1 text-xs text-muted-600">
        Create your first job to start adding participants.
      </p>
      <Link href="/jobs/new" className="btn-primary mt-4 inline-flex">
        Create your first job
      </Link>
    </div>
  );
}

/**
 * Row-level ⋯ actions menu. Edit fetches the full job (the list item is a
 * slim shape without client email / location) then opens the shared
 * EditJobModal. Archive confirms, archives, and tells the parent to
 * refresh. Hidden for archived jobs — mirrors the detail page's action
 * visibility.
 */
function RowActionsMenu({
  job,
  onEdit,
  onArchived,
}: {
  job: JobListItem;
  onEdit: (fullJob: Job) => void;
  onArchived: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on click-outside.
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  async function handleEdit() {
    setBusy(true);
    try {
      // List rows are slim (no client_email / location / cap) — fetch the
      // full job before opening the modal so all fields prefill correctly.
      const full = await getJob(job.id);
      setOpen(false);
      onEdit(full);
    } catch {
      alert("Couldn't load job details.");
    } finally {
      setBusy(false);
    }
  }

  async function handleArchive() {
    if (!confirm(`Archive “${job.name}”? It will be hidden from your active list.`)) {
      setOpen(false);
      return;
    }
    setBusy(true);
    try {
      await archiveJob(job.id);
      setOpen(false);
      onArchived();
    } catch {
      alert("Could not archive job.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="h-8 w-8 inline-flex items-center justify-center rounded-md text-muted-600 hover:text-ink hover:bg-muted-100 transition"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Actions for ${job.name}`}
      >
        <svg viewBox="0 0 16 16" className="h-4 w-4" fill="currentColor" aria-hidden>
          <circle cx="3" cy="8" r="1.5" />
          <circle cx="8" cy="8" r="1.5" />
          <circle cx="13" cy="8" r="1.5" />
        </svg>
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-9 z-20 w-36 rounded-card border border-muted-200 bg-paper py-1 shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            onClick={handleEdit}
            disabled={busy}
            className="block w-full px-3 py-2 text-left text-sm text-ink hover:bg-muted-50 disabled:opacity-60"
          >
            Edit
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={handleArchive}
            disabled={busy}
            className="block w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 disabled:opacity-60"
          >
            Archive
          </button>
        </div>
      ) : null}
    </div>
  );
}

type Tab = "active" | "archived";

export default function JobsPage() {
  const [tab, setTab] = useState<Tab>("active");
  const [jobs, setJobs] = useState<JobListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Full job being edited via the row ⋯ menu (null = modal closed).
  const [editingJob, setEditingJob] = useState<Job | null>(null);
  // Bumped to refetch the list after archive / edit-save.
  const [refreshKey, setRefreshKey] = useState(0);
  // Upcoming shoots first — the next job is the one you're preparing for.
  const { sort, toggle, sorted } = useSort<
    "name" | "client" | "date" | "status"
  >({ key: "date", dir: "desc" });
  const sortedJobs = jobs
    ? sorted(jobs, (j, key) => {
        switch (key) {
          case "client":
            return j.client_name ?? "";
          case "date":
            return j.shoot_date ?? "";
          case "status":
            return j.status;
          default:
            return j.name;
        }
      })
    : [];

  useEffect(() => {
    let cancelled = false;
    setJobs(null);  // show loading state when switching tabs
    setError(null);
    (async () => {
      try {
        // The backend returns active+archived when include_archived=true.
        // We filter client-side so the Archived tab shows ONLY archived jobs.
        const res = await listJobs({ includeArchived: tab === "archived" });
        const filtered =
          tab === "archived"
            ? res.items.filter((j) => j.status === "archived")
            : res.items;
        if (!cancelled) setJobs(filtered);
      } catch (e) {
        if (!cancelled) setError("Could not load jobs.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tab, refreshKey]);

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight">
          Jobs
        </h1>
        <Link href="/jobs/new" className="btn-primary whitespace-nowrap">
          New job
        </Link>
      </div>

      {/* Tabs */}
      <div className="mt-6 border-b border-muted-200 flex gap-6">
        <TabButton active={tab === "active"} onClick={() => setTab("active")}>
          Active
        </TabButton>
        <TabButton active={tab === "archived"} onClick={() => setTab("archived")}>
          Archived
        </TabButton>
      </div>

      {editingJob ? (
        <EditJobModal
          job={editingJob}
          onClose={() => setEditingJob(null)}
          onSaved={() => {
            setEditingJob(null);
            setRefreshKey((k) => k + 1);
          }}
        />
      ) : null}

      {error ? (
        <div className="mt-10 rounded-card border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      ) : jobs === null ? (
        <p className="mt-10 text-sm text-muted-600">Loading…</p>
      ) : jobs.length === 0 ? (
        <EmptyState tab={tab} />
      ) : (
        <>
          {/* Mobile: stacked cards. The ⋯ menu sits outside the Link so a
              menu tap doesn't navigate. */}
          <ul className="mt-6 sm:hidden space-y-3">
            {sortedJobs.map((job) => (
              <li
                key={job.id}
                className="relative rounded-card border border-muted-200 bg-paper hover:border-accent transition"
              >
                <Link href={`/jobs/${job.id}`} className="block p-4 pr-12">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-medium text-ink">{job.name}</p>
                    <StatusPill status={job.status} />
                  </div>
                  <dl className="mt-2 text-xs text-muted-600 space-y-0.5">
                    {job.client_name ? (
                      <div className="flex gap-1">
                        <dt className="font-medium">Client:</dt>
                        <dd>{job.client_name}</dd>
                      </div>
                    ) : null}
                    {job.shoot_date ? (
                      <div className="flex gap-1">
                        <dt className="font-medium">Shoot date:</dt>
                        <dd>{job.shoot_date}</dd>
                      </div>
                    ) : null}
                  </dl>
                </Link>
                {job.status !== "archived" ? (
                  <div className="absolute right-2 bottom-2">
                    <RowActionsMenu
                      job={job}
                      onEdit={(full) => setEditingJob(full)}
                      onArchived={() => setRefreshKey((k) => k + 1)}
                    />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>

          {/* Desktop: table. Every data cell wraps in a Link so the row is
              clickable AND keyboard-focusable; the last column holds the ⋯
              actions menu (outside the Link so it doesn't navigate). */}
          <div className="mt-8 hidden sm:block overflow-visible rounded-card border border-muted-200 bg-paper">
            <table className="w-full text-sm">
              <thead className="bg-muted-50 text-left text-xs font-medium uppercase tracking-wider text-muted-600">
                <tr>
                  <SortableHeader label="Name" sortKey="name" sort={sort} onSort={toggle} className="px-5" />
                  <SortableHeader label="Client" sortKey="client" sort={sort} onSort={toggle} className="px-5" />
                  <SortableHeader label="Shoot date" sortKey="date" sort={sort} onSort={toggle} className="px-5" />
                  <SortableHeader label="Status" sortKey="status" sort={sort} onSort={toggle} className="px-5" />
                  <th className="px-3 py-3 w-12">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-muted-200">
                {sortedJobs.map((job) => (
                  <tr key={job.id} className="group hover:bg-muted-50 transition">
                    <RowCell href={`/jobs/${job.id}`} className="font-medium group-hover:text-accent">
                      {job.name}
                    </RowCell>
                    <RowCell href={`/jobs/${job.id}`} className="text-muted-600">
                      {job.client_name ?? "—"}
                    </RowCell>
                    <RowCell href={`/jobs/${job.id}`} className="text-muted-600">
                      {job.shoot_date ?? "—"}
                    </RowCell>
                    <RowCell href={`/jobs/${job.id}`}>
                      <StatusPill status={job.status} />
                    </RowCell>
                    <td className="px-3 py-2 text-right">
                      {job.status !== "archived" ? (
                        <RowActionsMenu
                          job={job}
                          onEdit={(full) => setEditingJob(full)}
                          onArchived={() => setRefreshKey((k) => k + 1)}
                        />
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Referral link. Bottom of the home screen: worth finding, not worth
          interrupting anyone's actual work over. */}
      <div className="mt-12 border-t border-muted-200 pt-8">
        <ReferralCard />
      </div>
    </div>
  );
}

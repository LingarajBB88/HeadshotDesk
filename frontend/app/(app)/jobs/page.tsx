"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { StatusPill } from "@/components/StatusPill";
import { listJobs, type JobListItem } from "@/lib/jobs";

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
      <Link href={href} className={`block px-5 py-3 ${className}`}>
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

type Tab = "active" | "archived";

export default function JobsPage() {
  const [tab, setTab] = useState<Tab>("active");
  const [jobs, setJobs] = useState<JobListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

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
  }, [tab]);

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
          {/* Mobile: stacked cards */}
          <ul className="mt-6 sm:hidden space-y-3">
            {jobs.map((job) => (
              <li key={job.id}>
                <Link
                  href={`/jobs/${job.id}`}
                  className="block rounded-card border border-muted-200 bg-paper p-4 hover:border-accent transition"
                >
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
              </li>
            ))}
          </ul>

          {/* Desktop: table. Every cell wraps in a Link so the entire row is
              clickable AND keyboard-focusable (Tab + Enter both work). */}
          <div className="mt-8 hidden sm:block overflow-hidden rounded-card border border-muted-200 bg-paper">
            <table className="w-full text-sm">
              <thead className="bg-muted-50 text-left text-xs font-medium uppercase tracking-wider text-muted-600">
                <tr>
                  <th className="px-5 py-3">Name</th>
                  <th className="px-5 py-3">Client</th>
                  <th className="px-5 py-3">Shoot date</th>
                  <th className="px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-muted-200">
                {jobs.map((job) => (
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

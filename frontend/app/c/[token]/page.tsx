"use client";

// HSD-67 — Client dashboard. The photographer's client (HR contact, event
// coordinator) opens /c/{token} to watch shoot progress live: signups,
// slot bookings, photographed, delivered. Token-only, read-only, no login.
// Refreshes itself every 30 seconds while the tab is visible.

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

import { Logo } from "@/components/Logo";
import { SortableHeader, useSort } from "@/components/SortableHeader";
import { api, ApiError } from "@/lib/api";

type ClientParticipant = {
  name: string;
  status: "signed_up" | "photographed" | "delivered";
  slot_time: string | null;
};

type ClientDashboard = {
  job_name: string;
  studio_name: string;
  shoot_date: string | null;
  location: string | null;
  job_status: string;
  participants_total: number;
  photographed: number;
  delivered: number;
  photos_uploaded: number;
  shoot_mode: string;
  slots_total: number | null;
  slots_booked: number | null;
  participants: ClientParticipant[];
};

const STATUS_LABELS: Record<ClientParticipant["status"], string> = {
  signed_up: "Signed up",
  photographed: "Photographed",
  delivered: "Delivered",
};

const STATUS_STYLES: Record<ClientParticipant["status"], string> = {
  signed_up: "bg-muted-100 text-muted-600",
  photographed: "bg-blue-50 text-blue-700",
  delivered: "bg-green-100 text-green-700",
};

function Tile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-card border border-muted-200 bg-paper p-4 text-center">
      <p className="text-2xl font-semibold text-ink">{value}</p>
      <p className="mt-0.5 text-xs text-muted-600">{label}</p>
    </div>
  );
}

export default function ClientDashboardPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token;
  const [data, setData] = useState<ClientDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The client watches this in running order by default, and can re-sort
  // to answer "who hasn't been done yet?".
  const { sort, toggle, sorted } = useSort<"name" | "time" | "status">({
    key: "time",
    dir: "asc",
  });

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    async function load() {
      try {
        const d = await api<ClientDashboard>(`/api/v1/public/client/${token}`);
        if (!cancelled) {
          setData(d);
          setError(null);
        }
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) {
          setError(
            "This dashboard link is no longer active. Ask your photographer for a fresh one.",
          );
        } else if (!data) {
          setError("Couldn't load the dashboard. Try refreshing.");
        }
      }
    }

    load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <main className="min-h-dvh bg-muted-50 px-4 sm:px-6 py-10">
      <div className="mx-auto max-w-3xl">
        {error ? (
          <div className="bg-paper border border-muted-200 rounded-dialog p-8 text-center">
            <p className="text-sm text-muted-600">{error}</p>
          </div>
        ) : !data ? (
          <p className="text-sm text-muted-600 text-center">Loading…</p>
        ) : (
          <>
            <div className="text-center">
              <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">
                {data.job_name}
              </h1>
              <p className="mt-1 text-sm text-muted-600">
                Live shoot status from {data.studio_name}
                {data.shoot_date
                  ? ` · ${new Date(data.shoot_date).toLocaleDateString()}`
                  : ""}
                {data.location ? ` · ${data.location}` : ""}
              </p>
            </div>

            {/* Summary tiles */}
            <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Tile label="Signed up" value={data.participants_total} />
              {data.shoot_mode === "time_slot" &&
              data.slots_total !== null ? (
                <Tile
                  label="Slots booked"
                  value={`${data.slots_booked} / ${data.slots_total}`}
                />
              ) : (
                <Tile label="Photos taken so far" value={data.photos_uploaded} />
              )}
              <Tile label="Photographed" value={data.photographed} />
              <Tile label="Galleries delivered" value={data.delivered} />
            </div>

            {/* Participant progress — names + status only, no contact data. */}
            <div className="mt-6 rounded-card border border-muted-200 bg-paper overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted-50 text-left text-xs font-medium uppercase tracking-wider text-muted-600">
                  <tr>
                    <SortableHeader label="Name" sortKey="name" sort={sort} onSort={toggle} />
                    {data.shoot_mode === "time_slot" ? (
                      <SortableHeader label="Time" sortKey="time" sort={sort} onSort={toggle} />
                    ) : null}
                    <SortableHeader label="Status" sortKey="status" sort={sort} onSort={toggle} align="right" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-muted-200">
                  {data.participants.length === 0 ? (
                    <tr>
                      <td
                        colSpan={3}
                        className="px-4 py-6 text-center text-muted-600"
                      >
                        No signups yet. The signup link is with your team.
                      </td>
                    </tr>
                  ) : (
                    sorted(data.participants, (p, key) =>
                      key === "time"
                        ? (p.slot_time ?? "")
                        : key === "status"
                          ? { signed_up: 1, photographed: 2, delivered: 3 }[
                              p.status
                            ]
                          : p.name,
                    ).map((p, i) => (
                      <tr key={`${p.name}-${i}`}>
                        <td className="px-4 py-2.5 text-ink">{p.name}</td>
                        {data.shoot_mode === "time_slot" ? (
                          <td className="px-4 py-2.5 font-mono text-xs text-muted-600">
                            {p.slot_time ?? "—"}
                          </td>
                        ) : null}
                        <td className="px-4 py-2.5 text-right">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${STATUS_STYLES[p.status]}`}
                          >
                            {STATUS_LABELS[p.status]}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <p className="mt-3 text-center text-xs text-muted-400">
              Updates automatically every 30 seconds.
            </p>
          </>
        )}

        <div className="mt-10 flex items-center justify-center gap-2 text-xs text-muted-600">
          <span>Powered by</span>
          <Logo size="sm" wordmark />
        </div>
      </div>
    </main>
  );
}

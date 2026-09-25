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
  status: "signed_up" | "photographed" | "delivered" | "no_show";
  slot_time: string | null;
  // ISO date of the day they belong to; null until booked, shot, or flagged.
  day: string | null;
};

type ClientDay = {
  date: string;
  is_past: boolean;
  signed_up: number;
  photographed: number;
  no_shows: number;
  slots_total: number | null;
  slots_booked: number | null;
};

type ClientDashboard = {
  job_name: string;
  studio_name: string;
  shoot_date: string | null;
  shoot_dates: string[];
  // Only filled on a multi-day job; empty when there is one day to report.
  days: ClientDay[];
  location: string | null;
  job_status: string;
  participants_total: number;
  photographed: number;
  delivered: number;
  no_shows: number;
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
  no_show: "Didn't attend",
};

const STATUS_STYLES: Record<ClientParticipant["status"], string> = {
  signed_up: "bg-muted-100 text-muted-600",
  photographed: "bg-blue-50 text-blue-700",
  delivered: "bg-green-100 text-green-700",
  // Amber, not red: a no-show is information the client acts on, not a fault.
  no_show: "bg-amber-50 text-amber-700",
};

function Tile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-card border border-muted-200 bg-paper p-4 text-center">
      <p className="text-2xl font-semibold text-ink">{value}</p>
      <p className="mt-0.5 text-xs text-muted-600">{label}</p>
    </div>
  );
}

// "Tue 7 Oct". Dates arrive as plain ISO days, so parse them as local
// midnight rather than UTC, or the 7th renders as the 6th west of Greenwich.
function dayLabel(iso: string, long = false) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: long ? "long" : "short",
    day: "numeric",
    month: long ? "long" : "short",
  });
}

// Per-day breakdown for a multi-day shoot. Job-wide tiles above still
// answer "how far along are we"; this answers "how did Tuesday go, and
// who is left for Wednesday".
function DayCard({ day, timeSlots }: { day: ClientDay; timeSlots: boolean }) {
  return (
    <div className="rounded-card border border-muted-200 bg-paper p-4">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-ink">{dayLabel(day.date, true)}</p>
        <span
          className={`text-xs ${day.is_past ? "text-muted-400" : "text-green-700"}`}
        >
          {day.is_past ? "Done" : "Upcoming"}
        </span>
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div>
          <dt className="text-lg font-semibold text-ink">
            {timeSlots && day.slots_total !== null
              ? `${day.slots_booked} / ${day.slots_total}`
              : day.signed_up}
          </dt>
          <dd className="text-xs text-muted-600">
            {timeSlots && day.slots_total !== null ? "Slots booked" : "Signed up"}
          </dd>
        </div>
        <div>
          <dt className="text-lg font-semibold text-ink">{day.photographed}</dt>
          <dd className="text-xs text-muted-600">Photographed</dd>
        </div>
        <div>
          <dt className="text-lg font-semibold text-ink">{day.no_shows}</dt>
          <dd className="text-xs text-muted-600">Didn&apos;t attend</dd>
        </div>
      </dl>
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
  const multiDay = (data?.shoot_dates?.length ?? 0) > 1;
  const timeSlots = data?.shoot_mode === "time_slot";

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
                {(data.shoot_dates ?? []).length
                  ? ` · ${(data.shoot_dates ?? []).map((d) => dayLabel(d)).join(", ")}`
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
              {/* Only shown once there's something to report. */}
              {data.no_shows > 0 ? (
                <Tile label="Didn't attend" value={data.no_shows} />
              ) : null}
            </div>

            {multiDay ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {(data.days ?? []).map((day) => (
                  <DayCard key={day.date} day={day} timeSlots={timeSlots} />
                ))}
              </div>
            ) : null}

            {/* Participant progress — names + status only, no contact data. */}
            <div className="mt-6 rounded-card border border-muted-200 bg-paper overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted-50 text-left text-xs font-medium uppercase tracking-wider text-muted-600">
                  <tr>
                    <SortableHeader label="Name" sortKey="name" sort={sort} onSort={toggle} />
                    {multiDay ? (
                      <SortableHeader label="Day" sortKey="time" sort={sort} onSort={toggle} />
                    ) : null}
                    {timeSlots ? (
                      <SortableHeader label="Time" sortKey="time" sort={sort} onSort={toggle} />
                    ) : null}
                    <SortableHeader label="Status" sortKey="status" sort={sort} onSort={toggle} align="right" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-muted-200">
                  {data.participants.length === 0 ? (
                    <tr>
                      <td
                        colSpan={4}
                        className="px-4 py-6 text-center text-muted-600"
                      >
                        No signups yet. The signup link is with your team.
                      </td>
                    </tr>
                  ) : (
                    sorted(data.participants, (p, key) =>
                      key === "time"
                        // Day first, then clock time, so Tuesday 14:00
                        // sorts before Wednesday 09:00. Unplaced people
                        // sort last.
                        ? `${p.day ?? "9999"} ${p.slot_time ?? "99:99"}`
                        : key === "status"
                          ? {
                              signed_up: 1,
                              no_show: 2,
                              photographed: 3,
                              delivered: 4,
                            }[p.status]
                          : p.name,
                    ).map((p, i) => (
                      <tr key={`${p.name}-${i}`}>
                        <td className="px-4 py-2.5 text-ink">{p.name}</td>
                        {multiDay ? (
                          <td className="px-4 py-2.5 text-xs text-muted-600">
                            {p.day ? dayLabel(p.day) : "—"}
                          </td>
                        ) : null}
                        {timeSlots ? (
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

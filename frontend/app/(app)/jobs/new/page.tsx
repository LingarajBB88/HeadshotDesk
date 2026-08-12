"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { useEffect } from "react";

import { useRef } from "react";

import { FormField } from "@/components/FormField";
import {
  createClient,
  listClients,
  uploadClientLogo,
  type Client,
} from "@/lib/clients";
import { createJob, type ShootMode } from "@/lib/jobs";
import { classifyFormError } from "@/lib/form-errors";

export default function NewJobPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  // HSD-55: how shoot day runs. Queue is the familiar default.
  const [shootMode, setShootMode] = useState<ShootMode>("queue");
  // HSD-36: pick an existing client, or flip into create mode with the
  // "+ New client" button (shows an inline name field).
  const [clients, setClients] = useState<Client[]>([]);
  const [clientChoice, setClientChoice] = useState<string>("");
  const [creatingClient, setCreatingClient] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  // HSD-71: additional shoot days (ISO strings), empty for single-day jobs.
  const [extraDays, setExtraDays] = useState<string[]>([]);
  // Controlled so the extra-day pickers can refuse dates before it and
  // reject duplicates. Native `min` alone lets you type anything.
  const [firstDay, setFirstDay] = useState("");

  const today = new Date().toISOString().slice(0, 10);

  /** Why this extra day can't be used, or null when it's fine. */
  function dayProblem(value: string, index: number): string | null {
    if (!value) return null;
    if (value < today) return "That day has already passed.";
    if (firstDay && value === firstDay)
      return "That's already the first shoot day.";
    if (firstDay && value < firstDay)
      return "Extra days come after the first shoot day.";
    if (extraDays.some((d, j) => j !== index && d === value))
      return "That day is already in the list.";
    return null;
  }

  const dayErrors = extraDays.map((d, i) => dayProblem(d, i));
  const hasDayError = dayErrors.some(Boolean);

  useEffect(() => {
    async function refreshClients() {
      try {
        setClients(await listClients());
      } catch {
        /* keep whatever we have */
      }
    }
    refreshClients();
    // Stay in sync with the Clients page: uploading a logo in another tab
    // shows up here the moment this tab regains focus.
    const onVisible = () => {
      if (document.visibilityState === "visible") refreshClients();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  // The client this job will use: the picked one, or (in create mode) an
  // existing client whose name matches what's being typed — so typing
  // "Invest NL" immediately shows Invest NL's logo instead of pretending
  // it's a brand-new company.
  const typedMatch = creatingClient
    ? clients.find(
        (c) =>
          c.name.trim().toLowerCase() === newClientName.trim().toLowerCase(),
      ) ?? null
    : null;
  const selectedClient = creatingClient
    ? typedMatch
    : clients.find((c) => c.id === clientChoice) ?? null;

  // Direct logo upload from this form. In create mode the client is
  // created first (server dedupes by name), then the logo attaches, then
  // the picker switches to the real record — both pages stay in sync.
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const [logoBusy, setLogoBusy] = useState(false);
  async function handleLogoFile(file: File) {
    setLogoBusy(true);
    try {
      let targetId = selectedClient?.id ?? null;
      if (!targetId && creatingClient && newClientName.trim()) {
        const created = await createClient(newClientName.trim());
        targetId = created.id;
        setClients((cs) =>
          cs.some((c) => c.id === created.id) ? cs : [...cs, created],
        );
      }
      if (!targetId) return;
      const updated = await uploadClientLogo(targetId, file);
      setClients((cs) => {
        const present = cs.some((c) => c.id === updated.id);
        return present
          ? cs.map((c) => (c.id === updated.id ? updated : c))
          : [...cs, updated];
      });
      // Leave create mode: the client now exists and is selected.
      setCreatingClient(false);
      setNewClientName("");
      setClientChoice(updated.id);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Logo upload failed.");
    } finally {
      setLogoBusy(false);
      if (logoInputRef.current) logoInputRef.current.value = "";
    }
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    setFieldErrors({});
    if (hasDayError) {
      setFormError("Fix the shoot days before creating the job.");
      return;
    }
    setSubmitting(true);
    try {
      const data = new FormData(e.currentTarget);
      const rawCap = String(data.get("download_cap") ?? "").trim();
      const parsedCap = rawCap === "" ? null : Number(rawCap);

      // HSD-36: resolve the client first. Inline-create dedupes by name
      // server-side, so typing an existing client's name just reuses it.
      let clientId: string | null = null;
      if (creatingClient && newClientName.trim()) {
        const created = await createClient(newClientName.trim());
        clientId = created.id;
      } else if (!creatingClient && clientChoice) {
        clientId = clientChoice;
      }

      const job = await createJob({
        name: String(data.get("name") ?? "").trim(),
        client_id: clientId,
        client_email: (String(data.get("client_email") ?? "").trim()) || null,
        shoot_date: (String(data.get("shoot_date") ?? "").trim()) || null,
        extra_shoot_dates: extraDays.filter(Boolean),
        location: (String(data.get("location") ?? "").trim()) || null,
        download_cap:
          parsedCap !== null && Number.isFinite(parsedCap) && parsedCap >= 0
            ? Math.floor(parsedCap)
            : null,
        shoot_mode: shootMode,
      });
      router.push(`/jobs/${job.id}`);
    } catch (err) {
      const c = classifyFormError(err);
      if (c.fieldErrors) setFieldErrors(c.fieldErrors);
      else if (c.formError) setFormError(c.formError);
      else setFormError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-4xl">
      <Link href="/jobs" className="text-sm text-muted-600 hover:text-ink transition">
        &larr; Back to jobs
      </Link>
      <h1 className="mt-4 font-display text-3xl font-semibold tracking-tight">
        New job
      </h1>
      <p className="mt-1 text-sm text-muted-600">
        Set up a new shoot. You can edit any of these later.{" "}
        <a
          href="/help/create-a-job"
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent hover:underline"
        >
          What does each field do?
        </a>
      </p>

      {/* Server-side field errors are cleared the moment a field is edited.
          Leaving "This field is required" under a field you've just filled
          in reads as a bug. */}
      <form
        onSubmit={onSubmit}
        onInput={(e) => {
          const name = (e.target as HTMLInputElement).name;
          if (!name) return;
          setFieldErrors((errs) =>
            name in errs
              ? Object.fromEntries(
                  Object.entries(errs).filter(([k]) => k !== name),
                )
              : errs,
          );
          setFormError(null);
        }}
        className="mt-8"
        noValidate
      >
        {/* Two-column split: shoot details (what/where/when) on the left,
            client block (who it's for) on the right. Groups related fields
            and pre-shapes the form for HSD-36 — when the Client entity
            ships, the right column becomes a client picker + logo. Columns
            stack on mobile. */}
        <div className="grid grid-cols-1 gap-x-10 md:grid-cols-2">
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-600 mb-4">
              Shoot details
            </h2>
            <FormField
              label="Job name"
              name="name"
              required
              hint="e.g. “Acme HQ team headshots”"
              error={fieldErrors.name}
            />
            <FormField
              label="Shoot date"
              name="shoot_date"
              type="date"
              required
              min={today}
              value={firstDay}
              onChange={(e) => setFirstDay(e.target.value)}
              hint="Today or later."
              error={fieldErrors.shoot_date}
            />
            {/* HSD-71: extra days for shoots too big for one date. Kept
                out of the way — most shoots are one day. */}
            <div className="mb-4">
              {extraDays.map((d, i) => (
                <div key={i} className="mb-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      value={d}
                      // Earliest allowed is the day after the first day, so
                      // the picker itself won't offer a duplicate or a date
                      // that sits before the shoot starts.
                      min={
                        firstDay
                          ? new Date(
                              new Date(firstDay).getTime() + 86400000,
                            )
                              .toISOString()
                              .slice(0, 10)
                          : today
                      }
                      onChange={(e) =>
                        setExtraDays((days) =>
                          days.map((x, j) => (j === i ? e.target.value : x)),
                        )
                      }
                      className={
                        "rounded-md border bg-paper px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/30 " +
                        (dayErrors[i]
                          ? "border-red-500 focus:border-red-500"
                          : "border-muted-200 focus:border-accent")
                      }
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setExtraDays((days) => days.filter((_, j) => j !== i))
                      }
                      className="text-xs text-muted-600 hover:text-red-600 transition"
                    >
                      Remove
                    </button>
                  </div>
                  {dayErrors[i] ? (
                    <p className="mt-1 text-xs text-red-600">{dayErrors[i]}</p>
                  ) : null}
                </div>
              ))}
              <button
                type="button"
                disabled={!firstDay}
                title={
                  firstDay ? undefined : "Pick the shoot date first."
                }
                onClick={() => setExtraDays((days) => [...days, ""])}
                className="text-xs font-medium text-accent hover:underline disabled:text-muted-400 disabled:no-underline disabled:cursor-not-allowed"
              >
                + Add another shoot day
              </button>
              <p className="mt-1 text-xs text-muted-600">
                For shoots that run over several days. Each day gets its own
                hours and breaks once the job exists.
              </p>
            </div>

            <FormField
              label="Location"
              name="location"
              required
              hint="Where the shoot is happening. Shows on participant emails."
              error={fieldErrors.location}
            />

            {/* Directions and prep notes deliberately live on the edit
                screen, not here. Creating a job is about getting a signup
                link you can send; the practical detail is usually not known
                yet, and two more boxes at this point is friction on the one
                flow that has to stay quick. */}

            <FormField
              label="Headshots per participant"
              name="download_cap"
              type="number"
              min={0}
              max={1000}
              defaultValue={1}
              hint="How many headshots each participant can download from their gallery. Defaults to 1. Change later if the package is different."
              error={fieldErrors.download_cap}
            />

            {/* HSD-55: shoot-day mode. Radio cards, queue preselected. */}
            <fieldset className="mb-4">
              <legend className="block text-sm font-medium text-ink mb-1.5">
                How does shoot day run?
              </legend>
              <div className="space-y-2">
                <label
                  className={
                    "flex items-start gap-2.5 rounded-card border p-3 cursor-pointer transition " +
                    (shootMode === "queue"
                      ? "border-accent bg-accent-muted"
                      : "border-muted-200 bg-paper hover:border-muted-400")
                  }
                >
                  <input
                    type="radio"
                    name="shoot_mode"
                    checked={shootMode === "queue"}
                    onChange={() => setShootMode("queue")}
                    className="mt-0.5 accent-accent"
                  />
                  <span>
                    <span className="block text-sm font-medium text-ink">
                      Walk-up queue
                    </span>
                    <span className="block text-xs text-muted-600">
                      People come when they can; you pick who&apos;s next.
                      Best for open days and smaller groups.
                    </span>
                  </span>
                </label>
                <label
                  className={
                    "flex items-start gap-2.5 rounded-card border p-3 cursor-pointer transition " +
                    (shootMode === "time_slot"
                      ? "border-accent bg-accent-muted"
                      : "border-muted-200 bg-paper hover:border-muted-400")
                  }
                >
                  <input
                    type="radio"
                    name="shoot_mode"
                    checked={shootMode === "time_slot"}
                    onChange={() => setShootMode("time_slot")}
                    className="mt-0.5 accent-accent"
                  />
                  <span>
                    <span className="block text-sm font-medium text-ink">
                      Time slots
                    </span>
                    <span className="block text-xs text-muted-600">
                      Participants book an appointment while signing up. Best
                      for corporate days and busy teams. You set the schedule
                      on the job page after creating.
                    </span>
                  </span>
                </label>
              </div>
            </fieldset>
          </section>

          <section>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-600 mb-4">
              Client
            </h2>
            {/* HSD-36: client picker — existing clients + inline create. */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-ink mb-1.5">
                Client
              </label>
              {creatingClient ? (
                <div className="flex items-center gap-2">
                  <input
                    value={newClientName}
                    onChange={(e) => setNewClientName(e.target.value)}
                    placeholder="Client name, e.g. Acme Corp"
                    autoFocus
                    className="flex-1 rounded-md border border-muted-200 bg-paper px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setCreatingClient(false);
                      setNewClientName("");
                    }}
                    className="text-xs text-muted-600 hover:text-ink transition"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <select
                    value={clientChoice}
                    onChange={(e) => setClientChoice(e.target.value)}
                    className="flex-1 rounded-md border border-muted-200 bg-paper px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
                  >
                    <option value="">No client (personal / internal)</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setCreatingClient(true)}
                    className="btn-secondary text-xs whitespace-nowrap"
                  >
                    + New client
                  </button>
                </div>
              )}
              <p className="mt-1 text-xs text-muted-600">
                The company you&apos;re shooting for. Their logo brands the
                signup page, galleries, and delivery emails.
              </p>
            </div>
            <FormField
              label="Client email"
              name="client_email"
              type="email"
              hint="Optional. Only used if you want to CC the client on delivery."
              error={fieldErrors.client_email}
            />

            {/* HSD-36: client logo, uploadable right here. One upload per
                client — every job for them inherits it, and the Clients
                page shows the same state. */}
            <div className="mb-4">
              <span className="block text-sm font-medium text-ink mb-1.5">
                Client logo
              </span>
              <input
                ref={logoInputRef}
                type="file"
                accept="image/png,image/jpeg,image/svg+xml"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleLogoFile(f);
                }}
              />
              {selectedClient?.logo_url ? (
                <div className="rounded-md border border-muted-200 bg-paper px-3 py-3 flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={selectedClient.logo_url}
                    alt={`${selectedClient.name} logo`}
                    className="h-10 max-w-[140px] object-contain"
                  />
                  <span className="flex-1 text-xs text-muted-600">
                    Shown on the signup page, galleries, and delivery emails.
                  </span>
                  <button
                    type="button"
                    onClick={() => logoInputRef.current?.click()}
                    disabled={logoBusy}
                    className="text-xs text-accent hover:underline disabled:text-muted-400"
                  >
                    {logoBusy ? "Uploading…" : "Replace"}
                  </button>
                </div>
              ) : selectedClient || (creatingClient && newClientName.trim()) ? (
                <div className="rounded-md border border-dashed border-muted-200 bg-muted-50 px-3 py-4 text-center">
                  <button
                    type="button"
                    onClick={() => logoInputRef.current?.click()}
                    disabled={logoBusy}
                    className="btn-secondary text-xs disabled:opacity-60"
                  >
                    {logoBusy ? "Uploading…" : "Upload logo"}
                  </button>
                  <p className="mt-2 text-xs text-muted-600">
                    PNG, JPEG, or SVG up to 2 MB. Brands the signup page,
                    galleries, and delivery emails for every job with{" "}
                    {selectedClient?.name ?? newClientName.trim()}.
                  </p>
                </div>
              ) : (
                <div className="rounded-md border border-dashed border-muted-200 bg-muted-50 px-3 py-4 text-center">
                  <p className="text-xs text-muted-600">
                    Pick or create a client first, then upload their logo
                    here or on the{" "}
                    <a
                      href="/clients"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-accent hover:underline"
                    >
                      Clients page
                    </a>
                    .
                  </p>
                </div>
              )}
            </div>
          </section>
        </div>

        {formError ? (
          <p className="mb-4 text-sm text-red-600" role="alert">
            {formError}
          </p>
        ) : null}

        <div className="flex gap-3 mt-6">
          <button
            type="submit"
            disabled={submitting}
            className="btn-primary disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {submitting ? "Creating…" : "Create job"}
          </button>
          <Link href="/jobs" className="btn-secondary">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}

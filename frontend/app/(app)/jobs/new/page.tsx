"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { useEffect } from "react";

import { FormField } from "@/components/FormField";
import { createClient, listClients, type Client } from "@/lib/clients";
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

  useEffect(() => {
    (async () => {
      try {
        setClients(await listClients());
      } catch {
        setClients([]);
      }
    })();
  }, []);

  const selectedClient = clients.find((c) => c.id === clientChoice) ?? null;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    setFieldErrors({});
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

      <form onSubmit={onSubmit} className="mt-8" noValidate>
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
              min={new Date().toISOString().slice(0, 10)}
              hint="Today or later."
              error={fieldErrors.shoot_date}
            />
            <FormField
              label="Location"
              name="location"
              required
              hint="Where the shoot is happening. Shows on participant emails."
              error={fieldErrors.location}
            />
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

            {/* HSD-36: logo preview for the selected client. Uploads live
                on the Clients page (once per client, every job inherits). */}
            <div className="mb-4">
              <span className="block text-sm font-medium text-ink mb-1.5">
                Client logo
              </span>
              {selectedClient?.logo_url ? (
                <div className="rounded-md border border-muted-200 bg-paper px-3 py-3 flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={selectedClient.logo_url}
                    alt={`${selectedClient.name} logo`}
                    className="h-10 max-w-[140px] object-contain"
                  />
                  <span className="text-xs text-muted-600">
                    Shown on the signup page, galleries, and delivery emails.
                  </span>
                </div>
              ) : (
                <div className="rounded-md border border-dashed border-muted-200 bg-muted-50 px-3 py-4 text-center">
                  <p className="text-xs text-muted-600">
                    {selectedClient
                      ? `No logo for ${selectedClient.name} yet. `
                      : "Pick or create a client, then "}
                    <a
                      href="/clients"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-accent hover:underline"
                    >
                      upload one on the Clients page
                    </a>
                    . Every job for that client inherits it.
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

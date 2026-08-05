"use client";

// HSD-36 — Clients page. The companies you shoot for, each with a logo
// that automatically brands their signup pages, galleries, and delivery
// emails. Upload once per client; every job inherits it.

import { useEffect, useRef, useState } from "react";

import { PitchLinkCard } from "@/components/PitchLinkCard";
import {
  createClient,
  deleteClient,
  listClients,
  removeClientLogo,
  renameClient,
  uploadClientLogo,
  type Client,
} from "@/lib/clients";

function LogoCell({
  client,
  onChanged,
}: {
  client: Client;
  onChanged: (updated: Client) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleFile(file: File) {
    setBusy(true);
    try {
      onChanged(await uploadClientLogo(client.id, file));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Logo upload failed.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleRemove() {
    if (!confirm(`Remove ${client.name}'s logo?`)) return;
    setBusy(true);
    try {
      onChanged(await removeClientLogo(client.id));
    } catch {
      alert("Couldn't remove the logo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      {client.logo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={client.logo_url}
          alt={`${client.name} logo`}
          className="h-10 max-w-[120px] object-contain"
        />
      ) : (
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-muted-100 text-xs font-semibold text-muted-600">
          {client.name.slice(0, 2).toUpperCase()}
        </span>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/svg+xml"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="text-xs text-accent hover:underline disabled:text-muted-400"
      >
        {busy ? "Working…" : client.logo_url ? "Replace" : "Upload logo"}
      </button>
      {client.logo_url ? (
        <button
          type="button"
          onClick={handleRemove}
          disabled={busy}
          className="text-xs text-muted-600 hover:text-red-600 transition"
        >
          Remove
        </button>
      ) : null}
    </div>
  );
}

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [clientSort, setClientSort] = useState<"name" | "jobs" | "recent">(
    "name",
  );

  const sortedClients = [...(clients ?? [])].sort((a, b) => {
    if (clientSort === "jobs") return b.jobs_total - a.jobs_total;
    if (clientSort === "recent") {
      return b.created_at.localeCompare(a.created_at);
    }
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });

  async function refresh() {
    try {
      setClients(await listClients());
      setError(null);
    } catch {
      setError("Couldn't load clients.");
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  function replaceClient(updated: Client) {
    setClients((cs) =>
      cs ? cs.map((c) => (c.id === updated.id ? updated : c)) : cs,
    );
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    try {
      await createClient(name);
      setNewName("");
      await refresh();
    } catch {
      alert("Couldn't create the client.");
    } finally {
      setCreating(false);
    }
  }

  async function handleRename(c: Client) {
    const name = window.prompt("Client name:", c.name)?.trim();
    if (!name || name === c.name) return;
    try {
      replaceClient(await renameClient(c.id, name));
    } catch {
      alert("Couldn't rename the client.");
    }
  }

  async function handleDelete(c: Client) {
    if (!confirm(`Delete ${c.name}? This only works when no jobs use them.`)) {
      return;
    }
    try {
      await deleteClient(c.id);
      await refresh();
    } catch {
      alert(
        `${c.name} still has jobs attached. Reassign or archive those jobs first.`,
      );
    }
  }

  return (
    <div className="max-w-4xl">
      <h1 className="font-display text-3xl font-semibold tracking-tight">
        Clients
      </h1>
      <p className="mt-1 text-sm text-muted-600">
        The companies you shoot for. Upload a logo once and it brands their
        signup pages, galleries, and delivery emails automatically.
      </p>

      {/* HSD-65: pitching a client belongs on the Clients page — it's the
          one screen that's about clients rather than a shoot in progress. */}
      <div className="mt-6">
        <PitchLinkCard />
      </div>

      <form onSubmit={handleCreate} className="mt-6 flex items-center gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Client name, e.g. Acme Corp"
          className="w-72 rounded-md border border-muted-200 bg-paper px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
        />
        <button
          type="submit"
          disabled={creating || !newName.trim()}
          className="btn-primary text-sm disabled:opacity-60"
        >
          {creating ? "Adding…" : "Add client"}
        </button>
      </form>

      <div className="mt-6">
        {error ? (
          <p className="text-sm text-red-600">{error}</p>
        ) : clients === null ? (
          <p className="text-sm text-muted-600">Loading…</p>
        ) : clients.length === 0 ? (
          <div className="rounded-card border border-dashed border-muted-200 bg-paper p-8 text-center">
            <p className="text-sm font-medium text-ink">No clients yet</p>
            <p className="mt-1 text-xs text-muted-600">
              Add the company you&apos;re shooting for above, then upload
              their logo.
            </p>
          </div>
        ) : (
          <>
          {/* A list rather than a table, so sorting is a small control
              instead of clickable column headers. */}
          <div className="mb-2 flex items-center justify-end gap-2 text-xs text-muted-600">
            <label htmlFor="client-sort">Sort by</label>
            <select
              id="client-sort"
              value={clientSort}
              onChange={(e) =>
                setClientSort(e.target.value as typeof clientSort)
              }
              className="rounded-md border border-muted-200 bg-paper px-2 py-1 text-xs outline-none focus:border-accent"
            >
              <option value="name">Name (A–Z)</option>
              <option value="jobs">Most jobs</option>
              <option value="recent">Recently added</option>
            </select>
          </div>
          <ul className="divide-y divide-muted-200 rounded-card border border-muted-200 bg-paper">
            {sortedClients.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-center gap-4 px-5 py-4"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-ink truncate">{c.name}</p>
                  <p className="text-xs text-muted-600">
                    {c.jobs_total} job{c.jobs_total === 1 ? "" : "s"}
                  </p>
                </div>
                <LogoCell client={c} onChanged={replaceClient} />
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => handleRename(c)}
                    className="text-xs text-accent hover:underline"
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(c)}
                    className="text-xs text-muted-600 hover:text-red-600 transition"
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
          </>
        )}
      </div>
    </div>
  );
}

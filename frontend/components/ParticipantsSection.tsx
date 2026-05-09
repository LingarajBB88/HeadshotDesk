"use client";

import { useEffect, useRef, useState } from "react";

import { ApiError } from "@/lib/api";
import { classifyFormError } from "@/lib/form-errors";
import {
  addParticipant,
  deleteParticipant,
  importCsv,
  listParticipants,
  type CsvImportResult,
  type Participant,
} from "@/lib/participants";

import { FormField } from "./FormField";

type Props = {
  jobId: string;
};

export function ParticipantsSection({ jobId }: Props) {
  const [participants, setParticipants] = useState<Participant[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [importResult, setImportResult] = useState<CsvImportResult | null>(null);

  async function refresh() {
    try {
      const res = await listParticipants(jobId);
      setParticipants(res.items);
      setError(null);
    } catch {
      setError("Could not load participants.");
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  async function handleDelete(p: Participant) {
    if (!confirm(`Remove ${p.name}? Their info will be deleted.`)) return;
    try {
      await deleteParticipant(p.id);
      await refresh();
    } catch {
      alert("Could not remove participant.");
    }
  }

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold tracking-tight">
            Participants
            {participants ? (
              <span className="ml-2 text-sm font-normal text-muted-600">
                ({participants.length})
              </span>
            ) : null}
          </h2>
          <p className="mt-0.5 text-xs text-muted-600">
            Add people manually, upload a CSV, or share the signup link.
          </p>
        </div>
        <button
          onClick={() => setAdding((v) => !v)}
          className="btn-primary text-xs"
        >
          {adding ? "Cancel" : "Add participant"}
        </button>
      </div>

      {adding ? (
        <AddParticipantForm
          jobId={jobId}
          onAdded={async () => {
            setAdding(false);
            await refresh();
          }}
          onCancel={() => setAdding(false)}
        />
      ) : null}

      <CsvUpload
        jobId={jobId}
        onImported={async (result) => {
          setImportResult(result);
          await refresh();
        }}
      />

      {importResult ? <ImportResultBanner result={importResult} onDismiss={() => setImportResult(null)} /> : null}

      <div className="mt-6">
        {error ? (
          <p className="text-sm text-red-600">{error}</p>
        ) : participants === null ? (
          <p className="text-sm text-muted-600">Loading…</p>
        ) : participants.length === 0 ? (
          <div className="rounded-card border border-dashed border-muted-200 bg-paper p-8 text-center">
            <p className="text-sm text-ink font-medium">No participants yet</p>
            <p className="mt-1 text-xs text-muted-600">
              Use the “Add participant” button, drop a CSV above, or share the signup link with the team.
            </p>
          </div>
        ) : (
          <>
            {/* Mobile: stacked cards */}
            <ul className="sm:hidden rounded-card border border-muted-200 bg-paper divide-y divide-muted-200">
              {participants.map((p) => (
                <li key={p.id} className="px-5 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{p.name}</p>
                    <p className="text-xs text-muted-600 truncate">
                      {p.email ?? "—"}
                      {p.title ? ` · ${p.title}` : ""}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDelete(p)}
                    className="text-xs text-muted-600 hover:text-red-600 transition shrink-0"
                    aria-label={`Remove ${p.name}`}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>

            {/* Desktop: table */}
            <div className="hidden sm:block overflow-hidden rounded-card border border-muted-200 bg-paper">
              <table className="w-full text-sm">
                <thead className="bg-muted-50 text-left text-xs font-medium uppercase tracking-wider text-muted-600">
                  <tr>
                    <th className="px-5 py-3">Name</th>
                    <th className="px-5 py-3">Email</th>
                    <th className="px-5 py-3">Title</th>
                    <th className="px-5 py-3">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-muted-200">
                  {participants.map((p) => (
                    <tr key={p.id} className="hover:bg-muted-50 transition">
                      <td className="px-5 py-3 font-medium">{p.name}</td>
                      <td className="px-5 py-3 text-muted-600">
                        {p.email ?? "—"}
                      </td>
                      <td className="px-5 py-3 text-muted-600">
                        {p.title ?? "—"}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <button
                          onClick={() => handleDelete(p)}
                          className="text-xs text-muted-600 hover:text-red-600 transition"
                          aria-label={`Remove ${p.name}`}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

// --- Add participant form ---------------------------------------------------

function AddParticipantForm({
  jobId,
  onAdded,
  onCancel,
}: {
  jobId: string;
  onAdded: () => Promise<void>;
  onCancel: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    setFieldErrors({});
    setSubmitting(true);
    try {
      const data = new FormData(e.currentTarget);
      await addParticipant(jobId, {
        name: String(data.get("name") ?? "").trim(),
        email: (String(data.get("email") ?? "").trim()) || null,
        title: (String(data.get("title") ?? "").trim()) || null,
      });
      await onAdded();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setFieldErrors({ email: err.message });
      } else {
        const c = classifyFormError(err);
        if (c.fieldErrors) setFieldErrors(c.fieldErrors);
        else if (c.formError) setFormError(c.formError);
        else setFormError("Something went wrong. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mt-4 rounded-card border border-muted-200 bg-muted-50 p-4"
      noValidate
    >
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <FormField label="Name" name="name" required error={fieldErrors.name} />
        <FormField
          label="Email"
          name="email"
          type="email"
          error={fieldErrors.email}
        />
        <FormField label="Title" name="title" error={fieldErrors.title} />
      </div>
      {formError ? (
        <p className="text-sm text-red-600 mb-2" role="alert">
          {formError}
        </p>
      ) : null}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="btn-primary text-xs disabled:opacity-60"
        >
          {submitting ? "Adding…" : "Add"}
        </button>
        <button type="button" onClick={onCancel} className="btn-secondary text-xs">
          Cancel
        </button>
      </div>
    </form>
  );
}

// --- CSV upload -------------------------------------------------------------

function downloadCsvTemplate() {
  // Just the header row — keeps the file unambiguous, no dummy data to delete.
  const csv = "name,email,title\n";
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "headshotdesk-participants-template.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function CsvUpload({
  jobId,
  onImported,
}: {
  jobId: string;
  onImported: (result: CsvImportResult) => Promise<void>;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  async function handleFile(file: File) {
    setError(null);
    setUploading(true);
    try {
      const result = await importCsv(jobId, file);
      await onImported(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "CSV upload failed.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="mt-4 rounded-card border border-dashed border-muted-200 bg-paper p-4 flex flex-wrap items-center gap-3 justify-between">
      <div className="text-xs text-muted-600">
        Upload a CSV with columns <code className="bg-muted-50 px-1 rounded">name</code>,{" "}
        <code className="bg-muted-50 px-1 rounded">email</code>,{" "}
        <code className="bg-muted-50 px-1 rounded">title</code> (header row required, only{" "}
        <code className="bg-muted-50 px-1 rounded">name</code> mandatory). New to this?{" "}
        <button
          onClick={downloadCsvTemplate}
          className="text-accent hover:underline"
          type="button"
        >
          Download a blank template
        </button>
        .
      </div>
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="btn-secondary text-xs disabled:opacity-60"
          type="button"
        >
          {uploading ? "Uploading…" : "Choose CSV"}
        </button>
      </div>
      {error ? (
        <p className="basis-full text-sm text-red-600 mt-1">{error}</p>
      ) : null}
    </div>
  );
}

// --- Import result banner ---------------------------------------------------

function ImportResultBanner({
  result,
  onDismiss,
}: {
  result: CsvImportResult;
  onDismiss: () => void;
}) {
  return (
    <div className="mt-4 rounded-card border border-accent-muted bg-accent-muted p-4 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium text-ink">
            Imported {result.created} participant{result.created === 1 ? "" : "s"}.
            {result.skipped_duplicates > 0
              ? ` Skipped ${result.skipped_duplicates} duplicate${result.skipped_duplicates === 1 ? "" : "s"}.`
              : ""}
          </p>
          {result.errors.length > 0 ? (
            <ul className="mt-2 text-xs text-muted-600 list-disc pl-5 space-y-0.5">
              {result.errors.slice(0, 8).map((err, i) => (
                <li key={i}>{err}</li>
              ))}
              {result.errors.length > 8 ? (
                <li>…and {result.errors.length - 8} more.</li>
              ) : null}
            </ul>
          ) : null}
        </div>
        <button onClick={onDismiss} className="text-xs text-muted-600 hover:text-ink">
          Dismiss
        </button>
      </div>
    </div>
  );
}

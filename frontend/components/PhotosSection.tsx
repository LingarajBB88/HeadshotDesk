"use client";

import { useEffect, useRef, useState } from "react";

import {
  bulkDeleteFiles,
  deleteFile,
  formatBytes,
  listFiles,
  reassignFile,
  uploadFiles,
  type FileItem,
  type FileUploadResult,
} from "@/lib/files";
import { listParticipants, type Participant } from "@/lib/participants";

import { CollapsibleSection } from "./CollapsibleSection";
import { FolderWatchSection } from "./FolderWatchSection";
import { ImageThumbnail } from "./ImageThumbnail";
import { SearchInput } from "./SearchInput";

/**
 * Photos section on the job detail page.
 *
 * Photographers drag-drop or click to upload. Files are auto-matched to
 * participants by filename (Capture One's clipboard rename token writes
 * filenames in the form "{Name}_{Index}.jpg" so the match is automatic).
 *
 * Files that can't be matched land in an "Unassigned" bucket where the
 * photographer can assign them manually.
 */
export function PhotosSection({
  jobId,
  jobName,
  onChanged,
}: {
  jobId: string;
  jobName: string;
  /** Called whenever files are added/removed/reassigned, so parents can refresh
   *  sibling state (e.g. participant photo counts on the dashboard). */
  onChanged?: () => void;
}) {
  const [files, setFiles] = useState<FileItem[] | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);
  const [lastResult, setLastResult] = useState<FileUploadResult | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [search, setSearch] = useState("");
  // Multi-select for bulk delete. Stored as a Set of file IDs so add/remove/
  // has are O(1). Cleared whenever the underlying file list changes (refresh,
  // delete, reassign) so we never operate on stale IDs.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  async function refresh() {
    try {
      const [fileList, partList] = await Promise.all([
        listFiles(jobId),
        listParticipants(jobId),
      ]);
      setFiles(fileList.items);
      setParticipants(partList.items);
      setError(null);
      // Tell the parent (job detail page) so it can bump the participants
      // section to refetch — that's how photo counts / status pills update
      // without a hard refresh.
      onChanged?.();
    } catch {
      setError("Could not load photos.");
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  async function handleFiles(fileList: File[]) {
    if (fileList.length === 0) return;
    setUploading(true);
    setUploadProgress({ current: 0, total: fileList.length });
    try {
      // Upload in batches of 10 to avoid massive single requests.
      const BATCH = 10;
      let totalResult: FileUploadResult = {
        uploaded: [],
        skipped: [],
        matched: 0,
        unmatched: 0,
        duplicates: 0,
      };
      for (let i = 0; i < fileList.length; i += BATCH) {
        const batch = fileList.slice(i, i + BATCH);
        const result = await uploadFiles(jobId, batch);
        totalResult = {
          uploaded: [...totalResult.uploaded, ...result.uploaded],
          skipped: [...totalResult.skipped, ...result.skipped],
          matched: totalResult.matched + result.matched,
          unmatched: totalResult.unmatched + result.unmatched,
          duplicates: totalResult.duplicates + result.duplicates,
        };
        setUploadProgress({ current: Math.min(i + BATCH, fileList.length), total: fileList.length });
      }
      setLastResult(totalResult);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setUploading(false);
      setUploadProgress(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleDelete(f: FileItem) {
    if (!confirm(`Delete ${f.original_filename}?`)) return;
    try {
      await deleteFile(f.id);
      setSelectedIds((s) => {
        if (!s.has(f.id)) return s;
        const next = new Set(s);
        next.delete(f.id);
        return next;
      });
      await refresh();
    } catch {
      alert("Could not delete file.");
    }
  }

  function toggleSelected(id: string): void {
    setSelectedIds((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectedMany(ids: string[], select: boolean): void {
    setSelectedIds((s) => {
      const next = new Set(s);
      for (const id of ids) {
        if (select) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  async function handleBulkDelete(): Promise<void> {
    if (selectedIds.size === 0) return;
    const n = selectedIds.size;
    if (!confirm(`Delete ${n} selected photo${n === 1 ? "" : "s"}?`)) return;
    setBulkDeleting(true);
    try {
      const ids = Array.from(selectedIds);
      const result = await bulkDeleteFiles(jobId, ids);
      setSelectedIds(new Set());
      await refresh();
      // Surface any IDs the backend couldn't delete — usually means they
      // were already gone (race with another tab), so just warn.
      if (result.not_found.length > 0) {
        // eslint-disable-next-line no-console
        console.warn("Bulk delete: not found", result.not_found);
      }
    } catch {
      alert("Could not delete selected files.");
    } finally {
      setBulkDeleting(false);
    }
  }

  async function handleReassign(f: FileItem, participantId: string | null) {
    try {
      await reassignFile(f.id, participantId);
      await refresh();
    } catch {
      alert("Could not reassign file.");
    }
  }

  // Apply search filter — matches participant name OR filename (case-insensitive).
  // The search "scopes" both the per-participant groups (by their name) and the
  // individual files within them (by filename).
  const q = search.trim().toLowerCase();
  const matchesFile = (f: FileItem): boolean => {
    if (!q) return true;
    if (f.original_filename.toLowerCase().includes(q)) return true;
    if (f.participant_id) {
      const p = participants.find((x) => x.id === f.participant_id);
      if (p && p.name.toLowerCase().includes(q)) return true;
    }
    return false;
  };

  // Group filtered files by participant_id (or "unassigned").
  const grouped = (() => {
    const out = new Map<string | null, FileItem[]>();
    if (!files) return out;
    for (const f of files) {
      if (!matchesFile(f)) continue;
      const key = f.participant_id;
      if (!out.has(key)) out.set(key, []);
      out.get(key)!.push(f);
    }
    return out;
  })();
  const unassigned = grouped.get(null) ?? [];
  // Visible participant groups (in the order participants were created).
  const visibleParticipants = participants.filter((p) => (grouped.get(p.id) ?? []).length > 0);

  return (
    <CollapsibleSection
      title="Photos"
      count={files?.length}
      description="Drag JPEG/PNG files in or map a folder. Filenames like “Jane Doe_001.jpg” auto-match to participants."
      defaultOpen={false}
      actions={
        files && files.length > 0 ? (
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search by name or filename…"
          />
        ) : undefined
      }
    >
      {/* Folder auto-sync (preferred path for photographers). */}
      <FolderWatchSection jobId={jobId} jobName={jobName} onUploaded={refresh} />

      {/* Manual drop zone — always available as a fallback. */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          handleFiles(Array.from(e.dataTransfer.files));
        }}
        className={
          "mt-3 rounded-card border-2 border-dashed p-6 text-center transition " +
          (dragOver ? "border-accent bg-accent-muted" : "border-muted-200 bg-paper")
        }
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          multiple
          className="hidden"
          onChange={(e) => {
            const fs = Array.from(e.target.files ?? []);
            if (fs.length) handleFiles(fs);
          }}
        />
        {uploading && uploadProgress ? (
          <p className="text-sm text-muted-600">
            Uploading… {uploadProgress.current} / {uploadProgress.total}
          </p>
        ) : (
          <>
            <p className="text-sm font-medium text-ink">
              Drop photos here, or{" "}
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="text-accent hover:underline"
              >
                choose files
              </button>
            </p>
            <p className="mt-1 text-xs text-muted-600">
              JPEG, PNG, WebP, or HEIC. Up to 50 MB each.
            </p>
          </>
        )}
      </div>

      {lastResult ? (
        <div className="mt-3 rounded-card border border-accent-muted bg-accent-muted p-3 text-sm flex items-start justify-between gap-3">
          <div>
            <p>
              <strong>
                {lastResult.uploaded.length} uploaded
              </strong>
              {" · "}
              {lastResult.matched} auto-matched
              {lastResult.unmatched > 0 ? `, ${lastResult.unmatched} unassigned` : ""}
              {lastResult.duplicates > 0
                ? `, ${lastResult.duplicates} duplicate${lastResult.duplicates === 1 ? "" : "s"} merged`
                : ""}
              {lastResult.skipped.length > 0 ? `, ${lastResult.skipped.length} skipped` : ""}
            </p>
            {lastResult.skipped.length > 0 ? (
              <ul className="mt-1 text-xs text-muted-600 list-disc pl-5 space-y-0.5">
                {lastResult.skipped.slice(0, 5).map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
                {lastResult.skipped.length > 5 ? (
                  <li>…and {lastResult.skipped.length - 5} more.</li>
                ) : null}
              </ul>
            ) : null}
          </div>
          <button
            onClick={() => setLastResult(null)}
            className="text-xs text-muted-600 hover:text-ink"
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {error ? (
        <p className="mt-4 text-sm text-red-600">{error}</p>
      ) : null}

      {/* Bulk-action bar — only shown when at least one photo is selected.
          Keep it visually distinct so it's obviously a destructive context. */}
      {selectedIds.size > 0 ? (
        <div className="mt-4 rounded-card border border-accent bg-accent-muted px-4 py-2 flex items-center justify-between gap-3">
          <p className="text-sm">
            <strong>{selectedIds.size}</strong>{" "}
            photo{selectedIds.size === 1 ? "" : "s"} selected
          </p>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={handleBulkDelete}
              disabled={bulkDeleting}
              className="text-sm font-medium text-red-600 hover:text-red-700 disabled:opacity-60"
            >
              {bulkDeleting
                ? "Deleting…"
                : `Delete ${selectedIds.size} selected`}
            </button>
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              disabled={bulkDeleting}
              className="text-sm text-muted-600 hover:text-ink disabled:opacity-60"
            >
              Clear
            </button>
          </div>
        </div>
      ) : null}

      {/* Files grouped by participant */}
      <div className="mt-6 space-y-4">
        {visibleParticipants.map((p) => {
          const list = grouped.get(p.id) ?? [];
          return (
            <ParticipantFileGroup
              key={p.id}
              label={p.name}
              files={list}
              participants={participants}
              selectedIds={selectedIds}
              onToggleSelected={toggleSelected}
              onToggleSelectedMany={toggleSelectedMany}
              onDelete={handleDelete}
              onReassign={handleReassign}
            />
          );
        })}

        {unassigned.length > 0 ? (
          <ParticipantFileGroup
            label="Unassigned"
            warning
            files={unassigned}
            participants={participants}
            selectedIds={selectedIds}
            onToggleSelected={toggleSelected}
            onToggleSelectedMany={toggleSelectedMany}
            onDelete={handleDelete}
            onReassign={handleReassign}
          />
        ) : null}

        {files !== null && files.length === 0 ? (
          <p className="text-sm text-muted-600 text-center py-6">
            No photos uploaded yet.
          </p>
        ) : null}

        {files !== null && files.length > 0 && q && visibleParticipants.length === 0 && unassigned.length === 0 ? (
          <div className="rounded-card border border-dashed border-muted-200 bg-paper p-6 text-center">
            <p className="text-sm text-muted-600">
              No photos match &ldquo;{search}&rdquo;.
            </p>
          </div>
        ) : null}
      </div>
    </CollapsibleSection>
  );
}

// --- Per-participant file group --------------------------------------------

function ParticipantFileGroup({
  label,
  warning,
  files,
  participants,
  selectedIds,
  onToggleSelected,
  onToggleSelectedMany,
  onDelete,
  onReassign,
}: {
  label: string;
  warning?: boolean;
  files: FileItem[];
  participants: Participant[];
  selectedIds: Set<string>;
  onToggleSelected: (id: string) => void;
  onToggleSelectedMany: (ids: string[], select: boolean) => void;
  onDelete: (f: FileItem) => void;
  onReassign: (f: FileItem, participantId: string | null) => void;
}) {
  // Default: unassigned/warning groups stay open so the photographer fixes
  // them first. Matched participant groups start collapsed so a job with
  // many people doesn't render as a wall of thumbnails — the user expands
  // the group they care about.
  const [open, setOpen] = useState(!!warning);

  // Group-level select-all summary. "all" / "some" / "none" lets us render
  // a tri-state-ish checkbox: checked when all are selected, indeterminate
  // when only some, unchecked otherwise.
  const allIds = files.map((f) => f.id);
  const selectedCount = allIds.reduce(
    (n, id) => (selectedIds.has(id) ? n + 1 : n),
    0,
  );
  const allSelected = files.length > 0 && selectedCount === files.length;
  const someSelected = selectedCount > 0 && !allSelected;

  return (
    <div className="rounded-card border border-muted-200 bg-paper">
      <div
        className={
          "px-5 py-3 flex items-center justify-between gap-3 " +
          (warning ? "bg-amber-50" : "")
        }
      >
        {/* Group-level select-all. Stop propagation so clicking the
            checkbox doesn't also toggle the group open/closed. */}
        <label
          className="flex items-center gap-2 cursor-pointer select-none"
          onClick={(e) => e.stopPropagation()}
        >
          <input
            type="checkbox"
            checked={allSelected}
            ref={(el) => {
              if (el) el.indeterminate = someSelected;
            }}
            onChange={(e) => onToggleSelectedMany(allIds, e.target.checked)}
            aria-label={`Select all photos in ${label}`}
            className="h-4 w-4 accent-accent cursor-pointer"
          />
        </label>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex-1 flex items-center gap-2 text-left text-sm font-medium"
          aria-expanded={open}
        >
          <span
            className={
              "flex items-center gap-2 " +
              (warning ? "text-amber-700" : "text-ink")
            }
          >
            <Chevron open={open} />
            {label}
            <span className="text-xs font-normal text-muted-600">
              ({files.length})
            </span>
          </span>
        </button>
      </div>
      {open ? (
        <ul className="divide-y divide-muted-200 border-t border-muted-200">
          {files.map((f) => {
            const isSelected = selectedIds.has(f.id);
            return (
              <li
                key={f.id}
                className={
                  "px-5 py-3 flex items-center gap-3 transition " +
                  (isSelected ? "bg-accent-muted/50" : "")
                }
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => onToggleSelected(f.id)}
                  aria-label={`Select ${f.original_filename}`}
                  className="h-4 w-4 accent-accent cursor-pointer shrink-0"
                />
                <ImageThumbnail fileId={f.id} alt={f.original_filename} size={56} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{f.original_filename}</p>
                  <p className="text-xs text-muted-600">
                    {f.width && f.height ? `${f.width} × ${f.height} · ` : ""}
                    {formatBytes(f.size_bytes)}
                    {" · uploaded "}
                    {relativeTime(f.uploaded_at)}
                  </p>
                </div>
                <select
                  value={f.participant_id ?? ""}
                  onChange={(e) =>
                    onReassign(f, e.target.value === "" ? null : e.target.value)
                  }
                  className="text-xs border border-muted-200 rounded-md py-1 px-2 bg-paper"
                >
                  <option value="">Unassigned</option>
                  {participants.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => onDelete(f)}
                  className="text-xs text-muted-600 hover:text-red-600 transition shrink-0"
                >
                  Delete
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      className={"h-3.5 w-3.5 text-muted-600 transition-transform " + (open ? "rotate-90" : "")}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polyline points="6 4 10 8 6 12" />
    </svg>
  );
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const sec = Math.round(diffMs / 1000);
  if (sec < 60) return "just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  return new Date(iso).toLocaleDateString();
}

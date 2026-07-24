"use client";

import { useEffect, useRef, useState } from "react";

import { ApiError } from "@/lib/api";
import { renameFile, uploadFiles } from "@/lib/files";
import {
  FolderWatcher,
  isFolderWatchingSupported,
  type SkipReason,
  type WatchedParticipant,
  type WatcherState,
} from "@/lib/folderWatcher";
import {
  deleteFolderHandle,
  deleteUploadedFingerprints,
  loadFolderHandle,
  loadUploadedFingerprints,
  saveFolderHandle,
  saveUploadedFingerprints,
} from "@/lib/idbStore";
import { listParticipants } from "@/lib/participants";

/**
 * Watch-folder UI for a job.
 *
 * Photographer flow:
 *   1. Click "Map output folder" → browser shows native folder picker.
 *      Recommended name: "HeadshotDesk - <Job Name>" (just a suggestion;
 *      they can pick wherever they want).
 *   2. Capture One exports edited photos into that folder.
 *   3. We poll every 10s; new files are uploaded automatically once their
 *      file size stops changing (one full poll cycle of stability).
 *
 * The mapping persists across page reloads via IndexedDB, but the browser
 * requires re-granting permission on each fresh session — that's a browser
 * security boundary, not something we can avoid.
 */
export function FolderWatchSection({
  jobId,
  jobName,
  onUploaded,
}: {
  jobId: string;
  jobName: string;
  onUploaded: () => Promise<void>;
}) {
  const [supported] = useState<boolean>(() => isFolderWatchingSupported());
  const [folderName, setFolderName] = useState<string | null>(null);
  const [state, setState] = useState<WatcherState>("idle");
  const [totalUploaded, setTotalUploaded] = useState(0);
  // Count of files in the most-recent batch that were content-duplicates of
  // photos already in the gallery (Finder copy-paste, Cmd-D, re-export).
  // Shown as a transient notice so the photographer knows the paste was
  // absorbed rather than silently dropped. Auto-clears on a 30s timer.
  const [duplicatesNotice, setDuplicatesNotice] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pendingNames, setPendingNames] = useState<string[]>([]);
  const [skipped, setSkipped] = useState<Array<{ name: string; reason: SkipReason }>>([]);
  // Guards Resume / Map from re-entering while a previous click is mid-flight.
  // Without this, rapid clicks stop the in-progress watcher and restart it,
  // making the user wait through the initial scan multiple times.
  const [busy, setBusy] = useState(false);
  const watcherRef = useRef<FolderWatcher | null>(null);
  // Cache the restored handle in a ref so handleResume can call
  // requestPermission() synchronously from the click event (browser requires
  // that for user-gesture validation — even one async load before it kills it).
  const handleRef = useRef<FileSystemDirectoryHandle | null>(null);
  // Keep participants (name + shot status) in a ref so the watcher's scan
  // loop sees current data without needing to be re-instantiated. The
  // watcher uses shot_at to decide which matching files are ready to upload.
  const participantsRef = useRef<WatchedParticipant[]>([]);

  // On mount, restore any saved mapping. We pre-load into a ref so the
  // Resume button can call requestPermission() synchronously on click.
  //
  // If the browser still has permission for the folder (e.g., this is the
  // same tab and the user navigated away and came back), we auto-resume —
  // no Resume click needed. Across a full page reload, permission resets
  // and the user does have to click Resume.
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!supported) return;
      const handle = await loadFolderHandle(jobId);
      if (!handle || !mounted) return;
      handleRef.current = handle;
      setFolderName(handle.name);

      // queryPermission is read-only — doesn't require a user gesture.
      let current: PermissionState = "prompt";
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        current = await (handle as any).queryPermission({ mode: "read" });
      } catch {
        return;
      }
      if (current === "granted" && mounted) {
        // Same-tab navigation: permission persisted. Resume seamlessly.
        await startWatching(handle);
      }
    })();
    return () => {
      mounted = false;
      watcherRef.current?.stop();
      watcherRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, supported]);

  // Auto-clear the "skipped" notice after 30 seconds of no new skips. Resets
  // every time a new file is skipped (the list grows).
  useEffect(() => {
    if (skipped.length === 0) return;
    const t = setTimeout(() => setSkipped([]), 30_000);
    return () => clearTimeout(t);
  }, [skipped]);

  // Same idea for the duplicates notice: surface it briefly, then fade out.
  useEffect(() => {
    if (duplicatesNotice === 0) return;
    const t = setTimeout(() => setDuplicatesNotice(0), 30_000);
    return () => clearTimeout(t);
  }, [duplicatesNotice]);

  async function refreshParticipants(): Promise<void> {
    try {
      const res = await listParticipants(jobId);
      participantsRef.current = res.items.map((p) => ({
        name: p.name,
        shot_at: p.shot_at,
      }));
    } catch {
      // Keep stale list if the refresh fails — better than wiping it.
    }
  }

  /**
   * Begin watching. Assumes the handle ALREADY has read permission — the
   * caller is responsible for getting it (synchronously, from the click event).
   */
  async function startWatching(handle: FileSystemDirectoryHandle): Promise<void> {
    // Load participants up front and on each scan tick so newly added people
    // (or just-marked-as-shot ones) unblock previously-skipped files
    // automatically. 5-second refresh keeps shot-status pickup snappy.
    await refreshParticipants();
    const participantsTimer = setInterval(refreshParticipants, 5_000);
    watcherRef.current?.stop();
    const w = new FolderWatcher(
      handle,
      () => participantsRef.current,
      async (files) => {
        const result = await uploadFiles(jobId, files);
        return {
          files: result.uploaded.map((u) => ({
            name: u.original_filename,
            file_id: u.id,
          })),
          duplicates: result.duplicates,
        };
      },
      {
        onStatus: (s) => setState(s),
        onFileQueued: (name) =>
          setPendingNames((q) => [...q.filter((x) => x !== name), name].slice(-5)),
        onFileSkipped: (name, reason) => {
          // Skipped files are no longer "pending size confirmation."
          setPendingNames((q) => q.filter((x) => x !== name));
          setSkipped((q) =>
            [...q.filter((x) => x.name !== name), { name, reason }].slice(-5),
          );
        },
        onFilesUploaded: async (count, duplicates) => {
          setTotalUploaded((c) => c + count);
          setPendingNames([]);
          if (duplicates > 0) {
            // Use the latest batch's count rather than accumulating — the
            // notice is meant to call attention to the most recent paste,
            // not show a running total over the session.
            setDuplicatesNotice(duplicates);
          }
          // Files just got uploaded — also refresh participants in case any
          // previously-skipped files now match new additions or shot status.
          await refreshParticipants();
          await onUploaded();
        },
        onError: (msg) => setError(msg),
      },
      // Persist fingerprint→file_id map after every upload so cross-session
      // renames are detected too.
      (mapping) => {
        void saveUploadedFingerprints(jobId, mapping);
      },
      // Auto-rename: when the watcher detects a known fingerprint under a
      // new filename, call the backend to update the file's name (and re-run
      // participant matching). No re-upload.
      //
      // Return "stale" if the cached file_id was already deleted on the
      // backend (HTTP 404). The watcher will drop the fingerprint and treat
      // the file as a fresh upload — preventing the user from getting stuck
      // with a permanent "Rename failed: File not found." error after they
      // delete a row from the gallery.
      async (fileId, newName) => {
        try {
          await renameFile(fileId, newName);
          await onUploaded();
        } catch (e) {
          if (e instanceof ApiError && e.status === 404) {
            return "stale";
          }
          throw e;
        }
      },
    );
    // Seed the watcher with fingerprints from previous sessions.
    const savedFingerprints = await loadUploadedFingerprints(jobId);
    w.setInitialFingerprints(savedFingerprints);
    watcherRef.current = w;
    // Stash the participants timer cleanup on the watcher so stop() clears it.
    const origStop = w.stop.bind(w);
    w.stop = () => {
      clearInterval(participantsTimer);
      origStop();
    };
    await w.start();
  }

  async function handlePick(): Promise<void> {
    // eslint-disable-next-line no-console
    console.log("[FolderWatch] handlePick fired");
    if (busy) return;
    setBusy(true);
    setError(null);
    // CRITICAL: showDirectoryPicker MUST be called synchronously from the user
    // gesture (the click). No awaits or async helper calls before it — those
    // can silently consume the gesture activation and the picker won't show.
    if (typeof window === "undefined" || !("showDirectoryPicker" in window)) {
      setError("This browser doesn't support folder mapping. Try Chrome, Edge, Brave, or Arc.");
      return;
    }
    let handle: FileSystemDirectoryHandle;
    try {
      // The picker's `id` parameter is what the browser uses to remember the
      // last-selected folder per "context" — it must be ≤ 32 characters. ULID
      // job IDs alone are 30 chars, so we trim aggressively. Collisions across
      // jobs are fine — it just affects which folder is *suggested* on the
      // next open; we persist the real handle in IndexedDB.
      const pickerId = `hsd${jobId.replace(/^job_/, "").slice(0, 28)}`;
      // eslint-disable-next-line no-console
      console.log("[FolderWatch] calling showDirectoryPicker, id=", pickerId);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      handle = await (window as any).showDirectoryPicker({
        id: pickerId,
        startIn: "pictures",
      });
      // eslint-disable-next-line no-console
      console.log("[FolderWatch] got handle:", handle.name);
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") {
        // eslint-disable-next-line no-console
        console.log("[FolderWatch] user cancelled picker");
        return;
      }
      // eslint-disable-next-line no-console
      console.error("[FolderWatch] showDirectoryPicker failed:", e);
      setError(
        e instanceof Error
          ? `Could not open folder picker: ${e.message}`
          : "Could not open folder picker.",
      );
      return;
    }
    // Picker grants read permission implicitly — no separate request needed.
    handleRef.current = handle;
    try {
      await saveFolderHandle(jobId, handle);
      setFolderName(handle.name);
      await startWatching(handle);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[FolderWatch] save / start failed:", e);
      setError(e instanceof Error ? e.message : "Could not start watching.");
    } finally {
      setBusy(false);
    }
  }

  async function handleResume(): Promise<void> {
    // eslint-disable-next-line no-console
    console.log("[FolderWatch] handleResume fired, handle=", handleRef.current?.name);
    if (busy) return;
    // CRITICAL: requestPermission must be the FIRST async call after the click
    // — any async work before it (like loadFolderHandle) loses the user
    // gesture activation and the browser silently rejects the permission.
    // The handle was pre-loaded into handleRef on mount for exactly this.
    setError(null);
    const handle = handleRef.current;
    if (!handle) {
      // eslint-disable-next-line no-console
      console.warn("[FolderWatch] no cached handle, can't resume");
      setFolderName(null);
      return;
    }
    setBusy(true);

    let permResult: PermissionState;
    try {
      // eslint-disable-next-line no-console
      console.log("[FolderWatch] calling requestPermission");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      permResult = await (handle as any).requestPermission({ mode: "read" });
      // eslint-disable-next-line no-console
      console.log("[FolderWatch] permission result:", permResult);
    } catch (e) {
      setBusy(false);
      // eslint-disable-next-line no-console
      console.error("[FolderWatch] requestPermission failed:", e);
      setError(
        e instanceof Error
          ? `Could not request folder permission: ${e.message}`
          : "Could not request folder permission.",
      );
      return;
    }

    if (permResult !== "granted") {
      setBusy(false);
      setError("Permission denied. Try Unmap and pick the folder again.");
      setState("no-permission");
      return;
    }

    try {
      await startWatching(handle);
    } finally {
      setBusy(false);
    }
  }

  function handleStop(): void {
    watcherRef.current?.stop();
    watcherRef.current = null;
  }

  async function handleUnmap(): Promise<void> {
    handleStop();
    await deleteFolderHandle(jobId);
    // Also clear remembered fingerprints — Unmap means "fresh start for this job".
    await deleteUploadedFingerprints(jobId);
    handleRef.current = null;
    setFolderName(null);
    setState("idle");
    setTotalUploaded(0);
    setPendingNames([]);
    setSkipped([]);
    setDuplicatesNotice(0);
    setError(null);
  }

  if (!supported) {
    return (
      <div className="rounded-card border border-muted-200 bg-muted-50 p-4 text-xs text-muted-600">
        <strong className="text-ink">Folder auto-sync</strong> isn&apos;t supported in this
        browser. Open in Chrome, Edge, Brave, or Arc to enable it. (Manual drag-drop
        works fine in any browser.)
      </div>
    );
  }

  const isWatching = state === "watching" || state === "uploading";
  const suggestedName = `HeadshotDesk - ${jobName}`;

  if (!folderName) {
    return (
      <div className="rounded-card border border-dashed border-muted-200 bg-paper p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-muted-600">
          <p className="text-sm font-medium text-ink">Auto-sync from a folder</p>
          <p className="mt-0.5">
            Map a folder once. We&apos;ll watch it and upload new photos as Capture
            One exports them. Suggested name:{" "}
            <code className="bg-muted-50 px-1 rounded">{suggestedName}</code>
          </p>
        </div>
        <button
          onClick={handlePick}
          disabled={busy}
          className="btn-primary text-xs whitespace-nowrap disabled:opacity-60"
        >
          {busy ? "Opening…" : "Map output folder"}
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-card border border-muted-200 bg-paper p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <StatusDot state={state} />
            <p className="text-sm font-medium text-ink truncate">
              Mapped folder: <code className="bg-muted-50 px-1 rounded">{folderName}</code>
            </p>
          </div>
          <p className="mt-1 text-xs text-muted-600">
            {busy && "Starting up. This may take a moment if the folder has many files."}
            {!busy && state === "watching" && "Watching for new photos. Checking every 10s."}
            {!busy && state === "uploading" && "Uploading new photos…"}
            {!busy && state === "idle" && "Not watching. Click Resume to start checking."}
            {!busy && state === "no-permission" && "Browser permission was revoked. Resume to re-grant."}
            {!busy && state === "error" && "Something went wrong. Try resuming."}
          </p>
          {totalUploaded > 0 ? (
            <p className="mt-1 text-xs text-muted-600">
              {totalUploaded} file{totalUploaded === 1 ? "" : "s"} auto-uploaded this
              session.
            </p>
          ) : null}
          {duplicatesNotice > 0 ? (
            <p className="mt-1 text-xs text-muted-600">
              <span className="font-medium text-ink">
                {duplicatesNotice} duplicate
                {duplicatesNotice === 1 ? "" : "s"} merged
              </span>{" "}
              with existing photos: same image bytes were already in this
              job, so no new entry was created.{" "}
              <button
                onClick={() => setDuplicatesNotice(0)}
                className="ml-1 underline hover:text-ink"
              >
                Dismiss
              </button>
            </p>
          ) : null}
          {pendingNames.length > 0 ? (
            <p className="mt-1 text-xs text-muted-600">
              Waiting for size to settle:{" "}
              <span className="italic">{pendingNames.join(", ")}</span>
            </p>
          ) : null}
          {skipped.length > 0 ? (
            <div className="mt-1 text-xs text-amber-700">
              <p className="font-medium">
                Holding back ({skipped.length}). Will upload when ready.{" "}
                <button
                  onClick={() => setSkipped([])}
                  className="ml-1 text-muted-600 hover:text-ink underline font-normal"
                >
                  Dismiss
                </button>
              </p>
              <ul className="mt-1 space-y-0.5 list-disc pl-5">
                {skipped.map((s) => (
                  <li key={s.name}>
                    <span className="italic">{s.name}</span>
                    {": "}
                    <span className="text-muted-600">
                      {s.reason === "no-match"
                        ? "no matching participant"
                        : "matched participant hasn't been shot in the queue yet"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {error ? (
            <p className="mt-2 text-xs text-red-600">{error}</p>
          ) : null}
        </div>
        <div className="flex gap-2 shrink-0">
          {isWatching ? (
            <button onClick={handleStop} className="btn-secondary text-xs">
              Pause
            </button>
          ) : (
            <button
              onClick={handleResume}
              disabled={busy}
              className="btn-primary text-xs disabled:opacity-60"
            >
              {busy ? "Starting…" : "Resume watching"}
            </button>
          )}
          <button
            onClick={handleUnmap}
            disabled={busy}
            className="text-xs text-muted-600 hover:text-red-600 transition px-2 disabled:opacity-60"
          >
            Unmap
          </button>
        </div>
      </div>
    </div>
  );
}

function StatusDot({ state }: { state: WatcherState }) {
  const color =
    state === "watching"
      ? "bg-green-500 animate-pulse"
      : state === "uploading"
      ? "bg-accent animate-pulse"
      : state === "no-permission" || state === "error"
      ? "bg-red-500"
      : "bg-muted-400";
  return <span className={`inline-block h-2 w-2 rounded-full ${color}`} aria-hidden />;
}

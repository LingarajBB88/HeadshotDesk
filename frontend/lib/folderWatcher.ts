// Folder watcher built on the File System Access API.
//
// Architecture:
//   - showDirectoryPicker() gets the user's permission for a folder.
//   - We poll every POLL_INTERVAL_MS for new files.
//   - For each newly-seen file, we hold it for ONE cycle and check that its
//     size is unchanged — this prevents uploading partial files that
//     Capture One is still mid-export.
//   - The handle is persisted in IndexedDB so the mapping survives page reload.
//     The browser still requires a fresh permission grant per session, which
//     we handle via ensureReadPermission().

import { findMatchingParticipant } from "./matchFilename";

const IMAGE_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".heic",
  ".heif",
]);

// 3s polling — fast enough that the photographer never waits long after an
// export, slow enough that browser CPU stays under 1% even with the page open
// all day. (Browsers can't watch folders natively; polling is the only option.)
const POLL_INTERVAL_MS = 3_000;

type Fingerprint = { size: number; lastModified: number };

export type WatcherState =
  | "idle"
  | "watching"
  | "uploading"
  | "no-permission"
  | "error";

export type WatcherEvents = {
  onStatus: (state: WatcherState) => void;
  onFileQueued: (filename: string) => void;
  /** Fires after a batch upload completes. `duplicates` is the count of
   *  incoming files whose bytes already existed on the backend — useful
   *  for surfacing "N file(s) were duplicates of existing photos." */
  onFilesUploaded: (
    count: number,
    duplicates: number,
    /** Sent but neither stored nor merged — the backend rejected them. */
    rejected: number,
  ) => void;
  onFileSkipped: (filename: string, reason: SkipReason) => void;
  onError: (message: string) => void;
};

/**
 * Why a file was held back from auto-upload. The watcher will retry each
 * scan; the UI can word the reason differently for each.
 */
export type SkipReason =
  | "no-match"        // filename matches no participant
  | "not-shot-yet";   // matches a participant but they haven't been marked shot

/**
 * Lightweight participant shape the watcher needs.
 */
export type WatchedParticipant = {
  name: string;
  shot_at: string | null;
};

// ---------------------------------------------------------------------------

export function isFolderWatchingSupported(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

// Note: showDirectoryPicker and FileSystemHandle.requestPermission must both
// be called *synchronously* from a user gesture. That's why FolderWatchSection
// inlines both calls in its click handlers rather than wrapping them in helper
// functions here — every intervening await would consume the gesture.

// ---------------------------------------------------------------------------

export type UploadedFile = { name: string; file_id: string };

/** What the upload callback hands back. `files` is needed for fingerprint
 *  tracking; `duplicates` is forwarded to onFilesUploaded so the UI can
 *  tell the photographer how many were content-duplicates. */
export type UploadOutcome = { files: UploadedFile[]; duplicates: number };

export class FolderWatcher {
  private timer: ReturnType<typeof setInterval> | null = null;
  private seen = new Map<string, Fingerprint>();
  private pending = new Map<string, Fingerprint>();
  // Files that look stable but don't match any participant. We hold them so
  // we can retry next poll (in case a matching participant gets added later).
  private skipped = new Map<string, Fingerprint>();
  // Maps content fingerprint (size|lastModified) → backend file_id for files
  // we've uploaded. On rename, the new filename has a known fingerprint —
  // we call onRename(file_id, newName) instead of uploading a duplicate.
  private fileIdByFingerprint = new Map<string, string>();
  private busyUploading = false;

  constructor(
    private handle: FileSystemDirectoryHandle,
    /** Returns the current participants (name + shot status). Called every
     *  scan so newly-added or just-shot participants take effect immediately. */
    private getParticipants: () => WatchedParticipant[],
    /** Upload the given files. Returns {files, duplicates}: `files` for
     *  fingerprint→file_id tracking (order doesn't matter; we match by
     *  filename), `duplicates` for the "merged with existing" notice. */
    private upload: (files: File[]) => Promise<UploadOutcome>,
    private events: WatcherEvents,
    /** Persist the updated fingerprint→file_id map after each upload so
     *  renames detected after a page reload still work. */
    private onFingerprintsChanged?: (mapping: Record<string, string>) => void,
    /** Called when a renamed file is detected. Should call the rename API.
     *  Return `"stale"` if the file_id no longer exists on the backend (e.g.,
     *  the user deleted the row from the gallery) so the watcher can drop
     *  the cached fingerprint and re-upload the file as new. */
    private onRename?: (
      fileId: string,
      newName: string,
    ) => Promise<"stale" | void>,
  ) {}

  /** Seed the watcher with fingerprint→file_id mappings from a previous session. */
  setInitialFingerprints(mapping: Record<string, string>): void {
    for (const [fp, fileId] of Object.entries(mapping)) {
      this.fileIdByFingerprint.set(fp, fileId);
    }
  }

  async start(): Promise<void> {
    // Flip UI to "watching" immediately so the user sees the state change on
    // their click. The initial scan can take a few seconds for folders with
    // many files; if we waited for it to finish before updating state, the
    // user would think nothing happened and click Resume again.
    this.events.onStatus("watching");

    // Initial scan: process whatever's already in the folder. Pre-existing
    // files that match shot participants get uploaded; others get held back
    // (no-match or not-shot-yet). This matches the photographer's mental
    // model: "I mapped the folder = please look at what's in there."
    // We skip the size-stability gate for the initial pass because files
    // that pre-exist the mapping aren't actively being written to.
    try {
      await this.scan({ initial: true });
    } catch (e) {
      // Distinguish the two very different failures. Calling everything a
      // permission problem sent photographers round the Resume loop when
      // the real cause was a folder their export tool had re-created
      // (Evoto and Capture One both do this), which invalidates the saved
      // handle even though permission is intact.
      const name = (e as DOMException | undefined)?.name;
      if (name === "NotFoundError") {
        this.events.onError(
          "That folder no longer exists. Export tools often delete and " +
            "re-create their output folder, which breaks the link. Map it again.",
        );
        this.events.onStatus("error");
      } else if (name === "NotAllowedError" || name === "SecurityError") {
        this.events.onError(
          "The browser denied access to the folder. Resume to grant it again.",
        );
        this.events.onStatus("no-permission");
      } else {
        this.events.onError(
          `Could not read the folder: ${e instanceof Error ? e.message : String(e)}`,
        );
        this.events.onStatus("error");
      }
      return;
    }
    this.timer = setInterval(() => {
      this.scan().catch((e) => {
        this.events.onError(String(e));
      });
    }, POLL_INTERVAL_MS);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.events.onStatus("idle");
  }

  // Run one scan pass.
  // `initial` skips the size-stability gate — used on the very first scan,
  // where any pre-existing file is by definition stable (Capture One isn't
  // mid-export to a folder you just chose).
  private async scan({ initial = false }: { initial?: boolean } = {}): Promise<void> {
    if (this.busyUploading) return;

    const participants = this.getParticipants();
    const ready: File[] = [];

    // Collect image entries first, then read file metadata in parallel.
    // For folders with many files, sequential awaits make the scan crawl.
    // Parallel reads turn a 30-second scan into a 1-second one.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const imageEntries: any[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for await (const entry of (this.handle as any).values()) {
      if (entry.kind === "file" && isImageFilename(entry.name as string)) {
        imageEntries.push(entry);
      }
    }
    const filesWithEntries = await Promise.all(
      imageEntries.map(async (e) => ({ entry: e, file: (await e.getFile()) as File })),
    );

    for (const { entry, file } of filesWithEntries) {
      const name = entry.name as string;
      const fp: Fingerprint = { size: file.size, lastModified: file.lastModified };

      // Already uploaded and unchanged? Skip.
      const known = this.seen.get(name);
      if (known && known.size === fp.size && known.lastModified === fp.lastModified) {
        continue;
      }

      // Rename detection: same content fingerprint we've already uploaded,
      // just under a different filename. macOS Finder rename preserves
      // (size, mtime); a Finder duplicate (Cmd-D) changes mtime, so duplicates
      // still get processed normally.
      const knownFileId = this.fileIdByFingerprint.get(fpKey(fp));
      if (knownFileId) {
        // Update the filename on the backend (which also re-runs participant
        // matching against the new name).
        let stale = false;
        if (this.onRename) {
          try {
            const result = await this.onRename(knownFileId, name);
            stale = result === "stale";
          } catch (e) {
            this.events.onError(
              e instanceof Error ? `Rename failed: ${e.message}` : "Rename failed.",
            );
          }
        }
        if (stale) {
          // The file_id we had cached no longer exists on the backend (the
          // user deleted it from the gallery). Drop the stale fingerprint
          // and let the rest of the loop process this file as new — which
          // either uploads fresh OR hits the SHA-256 dedup branch if another
          // identical file is still on the backend.
          this.fileIdByFingerprint.delete(fpKey(fp));
          this.onFingerprintsChanged?.(
            Object.fromEntries(this.fileIdByFingerprint),
          );
          // Don't add to `seen`; we want the file to flow into the normal
          // upload path below.
        } else {
          this.seen.set(name, fp);
          continue;
        }
      }

      // Previously skipped (no matching participant or matched-but-not-shot).
      // Re-check on each scan — a participant may have been added or just
      // marked as shot since.
      const prevSkipped = this.skipped.get(name);
      if (prevSkipped && prevSkipped.size === fp.size && prevSkipped.lastModified === fp.lastModified) {
        const matched = findMatchingParticipant(name, participants);
        if (matched && matched.shot_at) {
          // Now matches AND has been shot — upload.
          ready.push(file);
          this.seen.set(name, fp);
          this.skipped.delete(name);
        }
        // Otherwise still skipped (no match yet, or not shot yet) — quiet.
        continue;
      }

      // Decision point: have we seen this filename pending before with the
      // SAME size (= done writing)? OR is this the initial scan (= file
      // pre-existed the mapping, no need to wait for stability)?
      const wasPending = this.pending.get(name);
      const isStable =
        initial || (wasPending !== undefined && wasPending.size === fp.size);

      if (isStable) {
        this.pending.delete(name);
        const matched = findMatchingParticipant(name, participants);
        if (!matched) {
          this.skipped.set(name, fp);
          // Suppress the user-facing notice during the initial scan — those
          // files were already in the folder when the photographer mapped it,
          // and re-popping the notice on every remount is noisy. New skips
          // during normal polling DO show the notice.
          if (!initial) this.events.onFileSkipped(name, "no-match");
        } else if (!matched.shot_at) {
          // Participant exists but hasn't been marked shot yet — hold the
          // file. Auto-uploads as soon as they're shot in the queue.
          this.skipped.set(name, fp);
          if (!initial) this.events.onFileSkipped(name, "not-shot-yet");
        } else {
          ready.push(file);
          // Deliberately NOT marked seen yet. Marking before the upload
          // meant a single 500 silently retired those frames: the next scan
          // skipped them as already handled and the only recovery was
          // unmapping the folder. They're marked once the server has them.
        }
      } else {
        this.pending.set(name, fp);
        this.events.onFileQueued(name);
      }
    }

    if (ready.length === 0) return;

    this.busyUploading = true;
    this.events.onStatus("uploading");
    try {
      const outcome = await this.upload(ready);
      // Map each uploaded file back to its fingerprint via filename so we
      // can rename later if the user changes the file name in Finder.
      const fileIdByName = new Map(
        outcome.files.map((u) => [u.name, u.file_id]),
      );
      // Only now is a file "seen". Anything the server didn't take stays
      // unseen and gets picked up by the next scan, which is what makes a
      // transient failure self-healing instead of silently lossy.
      const accepted = new Set(outcome.files.map((u) => u.name));
      for (const f of ready) {
        const fid = fileIdByName.get(f.name);
        if (fid) {
          this.fileIdByFingerprint.set(
            fpKey({ size: f.size, lastModified: f.lastModified }),
            fid,
          );
        }
        if (accepted.has(f.name)) {
          this.seen.set(f.name, {
            size: f.size,
            lastModified: f.lastModified,
          });
        }
      }
      // Duplicates count as handled too: the server already has that
      // content, so rescanning them forever would be pointless churn.
      if (outcome.duplicates > 0) {
        for (const f of ready) {
          if (!accepted.has(f.name)) {
            this.seen.set(f.name, {
              size: f.size,
              lastModified: f.lastModified,
            });
          }
        }
      }
      this.onFingerprintsChanged?.(Object.fromEntries(this.fileIdByFingerprint));
      // Report what the SERVER accepted, not what we attempted. Reporting
      // ready.length made a failing/skipping backend look like a healthy
      // upload ("12 files auto-uploaded" with an empty gallery) during
      // live testing on 2026-07-27.
      this.events.onFilesUploaded(
        outcome.files.length,
        outcome.duplicates,
        ready.length - outcome.files.length - outcome.duplicates,
      );
    } catch (e) {
      this.events.onError(
        e instanceof Error ? e.message : "Upload failed for some files.",
      );
    } finally {
      this.busyUploading = false;
      this.events.onStatus("watching");
    }
  }
}

function isImageFilename(name: string): boolean {
  const lower = name.toLowerCase();
  const dot = lower.lastIndexOf(".");
  if (dot < 0) return false;
  return IMAGE_EXTENSIONS.has(lower.slice(dot));
}

function fpKey(fp: Fingerprint): string {
  return `${fp.size}|${fp.lastModified}`;
}

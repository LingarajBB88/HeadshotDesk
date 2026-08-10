// Tiny IndexedDB wrapper for storing FileSystemDirectoryHandles.
//
// Handles are serializable via structured clone, so we can persist them across
// page reloads. The user has to re-grant permission on each fresh page load
// (browser security), but the *mapping* (which folder belongs to which job)
// is remembered.

const DB_NAME = "headshotdesk";
const DB_VERSION = 3;
const STORE_FOLDERS = "folder-handles";
// Per-job fingerprints (size|lastModified) of files we've uploaded via the
// watcher. Persisted so a renamed file isn't re-uploaded after a page reload.
const STORE_FINGERPRINTS = "uploaded-fingerprints";
// Shoot-day resilience: the participant list as last seen, and a queue of
// actions taken while the backend was unreachable. A venue with bad wifi is
// far more common than a Render outage, and both look identical from the
// photographer's side of the camera.
const STORE_SNAPSHOTS = "job-snapshots";
const STORE_ACTIONS = "pending-actions";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_FOLDERS)) {
        db.createObjectStore(STORE_FOLDERS);
      }
      if (!db.objectStoreNames.contains(STORE_FINGERPRINTS)) {
        db.createObjectStore(STORE_FINGERPRINTS);
      }
      if (!db.objectStoreNames.contains(STORE_SNAPSHOTS)) {
        db.createObjectStore(STORE_SNAPSHOTS);
      }
      if (!db.objectStoreNames.contains(STORE_ACTIONS)) {
        // Auto-increment key: actions replay in the order they were taken,
        // which matters when someone is marked shot and then reset.
        db.createObjectStore(STORE_ACTIONS, {
          keyPath: "id",
          autoIncrement: true,
        });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveFolderHandle(
  jobId: string,
  handle: FileSystemDirectoryHandle,
): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_FOLDERS, "readwrite");
    tx.objectStore(STORE_FOLDERS).put(handle, jobId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadFolderHandle(
  jobId: string,
): Promise<FileSystemDirectoryHandle | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_FOLDERS, "readonly");
    const req = tx.objectStore(STORE_FOLDERS).get(jobId);
    req.onsuccess = () => resolve((req.result as FileSystemDirectoryHandle) ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteFolderHandle(jobId: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_FOLDERS, "readwrite");
    tx.objectStore(STORE_FOLDERS).delete(jobId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// --- Uploaded file fingerprints (per job) ---
//
// Maps a file's content fingerprint (size|lastModified) to its backend
// file_id. When the watcher sees a "new" file whose fingerprint we already
// know, it's a rename — we use the stored file_id to call the rename API
// instead of uploading a duplicate.

export type FingerprintMap = Record<string, string>; // fpKey → file_id

export async function saveUploadedFingerprints(
  jobId: string,
  mapping: FingerprintMap,
): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_FINGERPRINTS, "readwrite");
    tx.objectStore(STORE_FINGERPRINTS).put(mapping, jobId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadUploadedFingerprints(
  jobId: string,
): Promise<FingerprintMap> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_FINGERPRINTS, "readonly");
    const req = tx.objectStore(STORE_FINGERPRINTS).get(jobId);
    req.onsuccess = () => {
      const raw = req.result;
      // Backward compat: old format was a plain string[]. Treat as empty map
      // (we don't know file_ids for those, so they can't be auto-renamed —
      // a fresh round of uploads rebuilds the mapping properly).
      if (raw && typeof raw === "object" && !Array.isArray(raw)) {
        resolve(raw as FingerprintMap);
      } else {
        resolve({});
      }
    };
    req.onerror = () => reject(req.error);
  });
}

export async function deleteUploadedFingerprints(jobId: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_FINGERPRINTS, "readwrite");
    tx.objectStore(STORE_FINGERPRINTS).delete(jobId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// --- Shoot-day resilience -------------------------------------------------
//
// Two stores working together:
//
//   job-snapshots   the participant list exactly as last fetched, so the
//                   shoot screen has names to show when the network doesn't
//   pending-actions everything the photographer did while it was unreachable,
//                   replayed in order once it comes back
//
// The point isn't uptime, it's that a shoot doesn't stop and nothing is
// silently dropped. Marking someone shot used to fail into a comment saying
// state would be consistent on the next refresh; it wasn't, and that person
// vanished from the attendance report.

export type PendingAction = {
  id?: number;
  jobId: string;
  participantId: string;
  /** What was done. Mirrors the API calls the shoot screen makes. */
  kind: "mark-shot" | "reset-shot" | "no-show" | "un-no-show";
  at: number;
  /** Failed replay attempts, for backoff and for giving up loudly. */
  attempts: number;
};

export async function saveJobSnapshot<T>(jobId: string, data: T): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_SNAPSHOTS, "readwrite");
    tx.objectStore(STORE_SNAPSHOTS).put(
      { data, savedAt: Date.now() },
      jobId,
    );
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadJobSnapshot<T>(
  jobId: string,
): Promise<{ data: T; savedAt: number } | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_SNAPSHOTS, "readonly");
    const req = tx.objectStore(STORE_SNAPSHOTS).get(jobId);
    req.onsuccess = () =>
      resolve((req.result as { data: T; savedAt: number }) ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function queueAction(
  action: Omit<PendingAction, "id" | "at" | "attempts">,
): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_ACTIONS, "readwrite");
    tx.objectStore(STORE_ACTIONS).add({
      ...action,
      at: Date.now(),
      attempts: 0,
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function listPendingActions(
  jobId?: string,
): Promise<PendingAction[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_ACTIONS, "readonly");
    const req = tx.objectStore(STORE_ACTIONS).getAll();
    req.onsuccess = () => {
      const all = (req.result as PendingAction[]) ?? [];
      resolve(jobId ? all.filter((a) => a.jobId === jobId) : all);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function deletePendingAction(id: number): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_ACTIONS, "readwrite");
    tx.objectStore(STORE_ACTIONS).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function bumpActionAttempts(id: number): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_ACTIONS, "readwrite");
    const store = tx.objectStore(STORE_ACTIONS);
    const req = store.get(id);
    req.onsuccess = () => {
      const row = req.result as PendingAction | undefined;
      if (row) store.put({ ...row, attempts: (row.attempts ?? 0) + 1 });
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

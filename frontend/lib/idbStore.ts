// Tiny IndexedDB wrapper for storing FileSystemDirectoryHandles.
//
// Handles are serializable via structured clone, so we can persist them across
// page reloads. The user has to re-grant permission on each fresh page load
// (browser security), but the *mapping* (which folder belongs to which job)
// is remembered.

const DB_NAME = "headshotdesk";
const DB_VERSION = 2;
const STORE_FOLDERS = "folder-handles";
// Per-job fingerprints (size|lastModified) of files we've uploaded via the
// watcher. Persisted so a renamed file isn't re-uploaded after a page reload.
const STORE_FINGERPRINTS = "uploaded-fingerprints";

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

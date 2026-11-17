import { useEffect, useState } from "react";
import { createSnapshotStore, type LibrarySnapshot, type SnapshotBackend } from "./librarySnapshot";

const DB_NAME = "movienight-offline";
const STORE = "library";
const KEY = "snapshot";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("IndexedDB is unavailable."));
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Offline storage is blocked."));
  });
}

async function inTransaction<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = operation(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

const indexedDbBackend: SnapshotBackend = {
  get: () => inTransaction("readonly", (store) => store.get(KEY)),
  put: async (snapshot: LibrarySnapshot) => { await inTransaction("readwrite", (store) => store.put(snapshot, KEY)); },
  delete: async () => { await inTransaction("readwrite", (store) => store.delete(KEY)); },
};

/** The single offline library snapshot for this browser (#34). */
export const offlineLibrary = createSnapshotStore(indexedDbBackend);

/** True while the browser reports a network connection. */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine !== false);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine !== false);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    update();
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return online;
}

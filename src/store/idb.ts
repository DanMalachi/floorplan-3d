// -----------------------------------------------------------------------------
// The browser key/value store every persistence module shares.
//
// One IndexedDB database (`floorplan3d`) with one object store (`kv`). Extracted
// from projectPersistence so the plan-image / thumbnail side stores can write to
// the same database without opening a second one (two connections at different
// versions deadlock each other on upgrade). Dependency-free and SSR-safe: every
// helper no-ops when there is no `indexedDB`.
// -----------------------------------------------------------------------------

const DB_NAME = "floorplan3d";
const STORE = "kv";

export function hasIDB(): boolean {
  return typeof indexedDB !== "undefined";
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function idbGet<T>(key: string): Promise<T | null> {
  if (!hasIDB()) return null;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
    tx.onsuccess = () => resolve((tx.result as T) ?? null);
    tx.onerror = () => reject(tx.error);
  });
}

export async function idbSet(key: string, value: unknown): Promise<void> {
  if (!hasIDB()) return;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function idbDel(key: string): Promise<void> {
  if (!hasIDB()) return;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

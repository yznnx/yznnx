// Tiny promise wrapper around IndexedDB (the browser's built-in local database).
// Nothing here is ever sent over the network.

export const DB_NAME = "study-vault";
const DB_VERSION = 1;

export interface MetaRow {
  id: string;
  [k: string]: unknown;
}

export interface EncRow {
  key: string; // `${type}:${id}` for records, id for blobs
  type?: string;
  iv: Uint8Array;
  data: ArrayBuffer;
}

let dbPromise: Promise<IDBDatabase> | null = null;

export function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta", { keyPath: "id" });
      if (!db.objectStoreNames.contains("records")) {
        const s = db.createObjectStore("records", { keyPath: "key" });
        s.createIndex("type", "type");
      }
      if (!db.objectStoreNames.contains("blobs")) db.createObjectStore("blobs", { keyPath: "key" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("Database is blocked by another open tab. Close other tabs of the app."));
  });
  return dbPromise;
}

export function closeDb() {
  if (dbPromise) {
    dbPromise.then((db) => db.close()).catch(() => {});
    dbPromise = null;
  }
}

function wrap<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("Transaction aborted"));
  });
}

export type StoreName = "meta" | "records" | "blobs";

export async function dbGet<T>(store: StoreName, key: string): Promise<T | undefined> {
  const db = await openDb();
  return wrap(db.transaction(store).objectStore(store).get(key)) as Promise<T | undefined>;
}

export async function dbGetAll<T>(store: StoreName): Promise<T[]> {
  const db = await openDb();
  return wrap(db.transaction(store).objectStore(store).getAll()) as Promise<T[]>;
}

export async function dbPut(store: StoreName, value: unknown): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(store, "readwrite");
  tx.objectStore(store).put(value);
  return done(tx);
}

export async function dbPutMany(store: StoreName, values: unknown[]): Promise<void> {
  if (!values.length) return;
  const db = await openDb();
  const tx = db.transaction(store, "readwrite");
  const s = tx.objectStore(store);
  for (const v of values) s.put(v);
  return done(tx);
}

export async function dbDelete(store: StoreName, key: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(store, "readwrite");
  tx.objectStore(store).delete(key);
  return done(tx);
}

export async function dbClear(stores: StoreName[] = ["meta", "records", "blobs"]): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(stores, "readwrite");
  for (const s of stores) tx.objectStore(s).clear();
  return done(tx);
}

export async function dbKeys(store: StoreName): Promise<string[]> {
  const db = await openDb();
  return wrap(db.transaction(store).objectStore(store).getAllKeys()) as Promise<string[]>;
}

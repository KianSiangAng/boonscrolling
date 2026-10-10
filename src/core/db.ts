/**
 * Minimal promise wrapper over IndexedDB.
 *   progress: ProgressRecord keyed by card id
 *   kv:       settings, cached API data, counters — { key, value }
 */
const DB_NAME = 'boonscrolling';
const DB_VERSION = 1;

export type StoreName = 'progress' | 'kv';

let dbPromise: Promise<IDBDatabase> | null = null;

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const open = indexedDB.open(DB_NAME, DB_VERSION);
    open.onupgradeneeded = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains('progress')) {
        const s = db.createObjectStore('progress', { keyPath: 'id' });
        s.createIndex('due', 'due');
        s.createIndex('category', 'category');
      }
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv', { keyPath: 'key' });
    };
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
    open.onblocked = () => reject(new Error('IndexedDB upgrade blocked by another tab'));
  });
  return dbPromise;
}

async function tx(store: StoreName, mode: IDBTransactionMode) {
  const db = await openDb();
  return db.transaction(store, mode).objectStore(store);
}

export async function getAll<T>(store: StoreName): Promise<T[]> {
  return req((await tx(store, 'readonly')).getAll()) as Promise<T[]>;
}

export async function put<T>(store: StoreName, value: T): Promise<void> {
  await req((await tx(store, 'readwrite')).put(value));
}

export async function putMany<T>(store: StoreName, values: T[]): Promise<void> {
  if (!values.length) return;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction(store, 'readwrite');
    const s = t.objectStore(store);
    for (const v of values) s.put(v);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export async function clear(store: StoreName): Promise<void> {
  await req((await tx(store, 'readwrite')).clear());
}

export async function kvGet<T>(key: string): Promise<T | undefined> {
  const row = (await req((await tx('kv', 'readonly')).get(key))) as { key: string; value: T } | undefined;
  return row?.value;
}

export async function kvSet<T>(key: string, value: T): Promise<void> {
  await put('kv', { key, value });
}

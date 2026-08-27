import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Doc, Page } from '../types';

interface ScanDB extends DBSchema {
  docs: { key: string; value: Doc; indexes: { updatedAt: number } };
  blobs: { key: string; value: Blob };
}

let dbPromise: Promise<IDBPDatabase<ScanDB>> | null = null;

function db() {
  dbPromise ??= openDB<ScanDB>('recto', 1, {
    upgrade(database) {
      const docs = database.createObjectStore('docs', { keyPath: 'id' });
      docs.createIndex('updatedAt', 'updatedAt');
      database.createObjectStore('blobs');
    },
  });
  return dbPromise;
}

export const newId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export async function listDocs(): Promise<Doc[]> {
  const all = await (await db()).getAll('docs');
  // Newest first. Two documents saved in the same millisecond would otherwise
  // fall back to primary-key order, so tie-break explicitly to keep the list
  // from reshuffling between reads.
  return all.sort(
    (a, b) => b.updatedAt - a.updatedAt || b.createdAt - a.createdAt || a.id.localeCompare(b.id),
  );
}

export const getDoc = async (id: string) => (await db()).get('docs', id);

export async function saveDoc(doc: Doc): Promise<Doc> {
  const updated = { ...doc, updatedAt: Date.now() };
  await (await db()).put('docs', updated);
  return updated;
}

export async function deleteDoc(id: string): Promise<void> {
  const database = await db();
  const doc = await database.get('docs', id);
  const tx = database.transaction(['docs', 'blobs'], 'readwrite');
  for (const page of doc?.pages ?? []) tx.objectStore('blobs').delete(page.imageKey);
  tx.objectStore('docs').delete(id);
  await tx.done;
}

export async function putBlob(blob: Blob): Promise<string> {
  const key = newId();
  await (await db()).put('blobs', blob, key);
  return key;
}

export async function getBlob(key: string): Promise<Blob | undefined> {
  return (await db()).get('blobs', key);
}

export async function deleteBlobs(keys: string[]): Promise<void> {
  const database = await db();
  const tx = database.transaction('blobs', 'readwrite');
  for (const key of keys) tx.store.delete(key);
  await tx.done;
}

export function emptyDoc(name = 'Untitled scan'): Doc {
  const now = Date.now();
  return { id: newId(), name, createdAt: now, updatedAt: now, pages: [] };
}

export function newPage(imageKey: string, width: number, height: number, filter: Page['filter']): Page {
  return { id: newId(), imageKey, width, height, rotation: 0, filter, annotations: [] };
}

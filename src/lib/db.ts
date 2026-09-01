import { deleteDB, openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Doc, Page } from '../types';

interface ScanDB extends DBSchema {
  docs: { key: string; value: Doc; indexes: { updatedAt: number } };
  blobs: { key: string; value: Blob };
}

const DB_NAME = 'ajuba-scanner';

/** Databases this app used under earlier names, newest first. */
const LEGACY_NAMES = ['recto', 'scanpdf'];

let dbPromise: Promise<IDBPDatabase<ScanDB>> | null = null;

function open(name: string) {
  return openDB<ScanDB>(name, 1, {
    upgrade(database) {
      const docs = database.createObjectStore('docs', { keyPath: 'id' });
      docs.createIndex('updatedAt', 'updatedAt');
      database.createObjectStore('blobs');
    },
  });
}

/**
 * Carries scans across an app rename. Renaming the store would otherwise
 * strand everything the user had already scanned, since IndexedDB is keyed by
 * database name.
 *
 * Only runs into an empty store, and never deletes the old one — if anything
 * here goes wrong the previous data is still sitting where it was.
 */
async function migrateLegacy(target: IDBPDatabase<ScanDB>): Promise<void> {
  if ((await target.count('docs')) > 0) return;

  for (const name of LEGACY_NAMES) {
    let legacy: IDBPDatabase<ScanDB> | null = null;
    try {
      legacy = await open(name);
      // `open` creates the database if it was absent, so an empty one means
      // there was nothing to migrate; clean up the shell we just made.
      const docs = await legacy.getAll('docs');
      if (!docs.length) {
        legacy.close();
        legacy = null;
        await deleteDB(name).catch(() => {});
        continue;
      }

      for (const doc of docs) {
        for (const page of doc.pages) {
          const blob = await legacy.get('blobs', page.imageKey);
          if (blob) await target.put('blobs', blob, page.imageKey);
        }
        await target.put('docs', doc);
      }
      legacy.close();
      return;
    } catch {
      // A failed migration must not stop the app from starting.
      legacy?.close();
    }
  }
}

function db() {
  dbPromise ??= (async () => {
    const database = await open(DB_NAME);
    await migrateLegacy(database).catch(() => {});
    return database;
  })();
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

/**
 * Copies a document under a new name, leaving the original untouched.
 *
 * Page images are copied rather than shared: two documents pointing at one
 * blob would mean deleting either of them takes the other's pages with it.
 */
export async function duplicateDoc(doc: Doc, name: string): Promise<Doc> {
  const pages: Page[] = [];
  for (const page of doc.pages) {
    const blob = await getBlob(page.imageKey);
    pages.push({
      ...page,
      id: newId(),
      imageKey: blob ? await putBlob(blob) : page.imageKey,
      // Annotations are plain data, but they nest, so copy them properly or
      // editing the copy would reach back into the original.
      annotations: structuredClone(page.annotations),
      ocrWords: page.ocrWords ? structuredClone(page.ocrWords) : undefined,
    });
  }

  const now = Date.now();
  return saveDoc({ id: newId(), name, createdAt: now, updatedAt: now, pages });
}

export function emptyDoc(name = 'Untitled scan'): Doc {
  const now = Date.now();
  return { id: newId(), name, createdAt: now, updatedAt: now, pages: [] };
}

export function newPage(imageKey: string, width: number, height: number, filter: Page['filter']): Page {
  return { id: newId(), imageKey, width, height, rotation: 0, filter, annotations: [] };
}

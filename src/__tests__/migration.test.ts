import { beforeEach, describe, expect, it, vi } from 'vitest';
import { openDB } from 'idb';
import { getBlob, listDocs } from '../lib/db';

/** Writes a document into a database under one of the app's older names. */
async function seedLegacy(name: string, docName: string) {
  const db = await openDB(name, 1, {
    upgrade(d) {
      const docs = d.createObjectStore('docs', { keyPath: 'id' });
      docs.createIndex('updatedAt', 'updatedAt');
      d.createObjectStore('blobs');
    },
  });
  await db.put('blobs', new Blob(['pixels']), 'legacy-key');
  await db.put('docs', {
    id: 'legacy-doc',
    name: docName,
    createdAt: 1,
    updatedAt: 2,
    pages: [
      {
        id: 'p1',
        imageKey: 'legacy-key',
        width: 800,
        height: 1000,
        rotation: 0,
        filter: 'magic',
        annotations: [],
      },
    ],
  });
  db.close();
}

describe('renaming the app', () => {
  beforeEach(() => {
    // Each test file gets a fresh fake-indexeddb, but the db module memoises
    // its connection, so reset the module registry between cases.
    vi.resetModules();
  });

  it('carries scans over from the previous database name', async () => {
    await seedLegacy('recto', 'Scan from before the rename');

    const docs = await listDocs();
    expect(docs.map((d) => d.name)).toContain('Scan from before the rename');
    // The page image has to come across too, or the document is a dead link.
    expect(await getBlob('legacy-key')).toBeDefined();
  });
});

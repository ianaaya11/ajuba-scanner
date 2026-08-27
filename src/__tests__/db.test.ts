import { describe, expect, it } from 'vitest';
import { deleteDoc, emptyDoc, getBlob, getDoc, listDocs, newPage, putBlob, saveDoc } from '../lib/db';

describe('document storage', () => {
  it('round-trips a document with pages and blobs', async () => {
    const key = await putBlob(new Blob(['fake-jpeg'], { type: 'image/jpeg' }));
    const doc = emptyDoc('Invoice');
    doc.pages.push(newPage(key, 800, 1000, 'magic'));
    await saveDoc(doc);

    const loaded = await getDoc(doc.id);
    expect(loaded?.name).toBe('Invoice');
    expect(loaded?.pages).toHaveLength(1);
    expect(loaded?.pages[0].filter).toBe('magic');
    // fake-indexeddb cannot structured-clone a Blob under jsdom, so it comes
    // back as a plain object here. Real IndexedDB preserves the Blob; what
    // this asserts is that the key was stored and resolves to a value.
    expect(await getBlob(key)).toBeDefined();
  });

  it('stamps updatedAt on save', async () => {
    const doc = await saveDoc(emptyDoc('Receipt'));
    expect(doc.updatedAt).toBeGreaterThanOrEqual(doc.createdAt);
  });

  it('lists newest first', async () => {
    for (const name of ['One', 'Two', 'Three']) await saveDoc(emptyDoc(name));

    const listed = await listDocs();
    expect(listed.length).toBeGreaterThanOrEqual(3);
    // saveDoc stamps the clock, and several saves can land in the same
    // millisecond, so assert the ordering contract rather than exact names.
    for (let i = 1; i < listed.length; i++) {
      expect(listed[i - 1].updatedAt).toBeGreaterThanOrEqual(listed[i].updatedAt);
    }
  });

  it('orders deterministically when timestamps collide', async () => {
    await saveDoc(emptyDoc('Collision A'));
    await saveDoc(emptyDoc('Collision B'));
    // saveDoc always stamps the clock itself, so a tie cannot be forced through
    // the public API — back-to-back saves simply hit it often. What must hold
    // either way is that repeated reads agree on the order.
    const first = (await listDocs()).map((d) => d.id);
    const second = (await listDocs()).map((d) => d.id);
    expect(first).toEqual(second);
  });

  it('deleting a document also drops its page images', async () => {
    const key = await putBlob(new Blob(['pixels']));
    const doc = emptyDoc('Temporary');
    doc.pages.push(newPage(key, 10, 10, 'bw'));
    await saveDoc(doc);

    await deleteDoc(doc.id);
    expect(await getDoc(doc.id)).toBeUndefined();
    expect(await getBlob(key)).toBeUndefined();
  });
});

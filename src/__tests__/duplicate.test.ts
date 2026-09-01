import { describe, expect, it } from 'vitest';
import { duplicateDoc, emptyDoc, getBlob, getDoc, newPage, putBlob, saveDoc } from '../lib/db';
import type { Doc } from '../types';

async function seed(name: string): Promise<Doc> {
  const key = await putBlob(new Blob(['pixels']));
  const doc = emptyDoc(name);
  doc.pages.push({
    ...newPage(key, 850, 1100, 'magic'),
    annotations: [
      { kind: 'text', color: '#000', size: 0.03, at: { x: 0.4, y: 0.5 }, text: 'original' },
    ],
    ocrText: 'original text',
    ocrWords: [{ text: 'original', x0: 0, y0: 0, x1: 0.2, y1: 0.05 }],
  });
  return saveDoc(doc);
}

describe('saving a copy', () => {
  it('takes the name given and keeps the original untouched', async () => {
    const original = await seed('Lease');
    const copy = await duplicateDoc(original, 'Lease (signed)');

    expect(copy.name).toBe('Lease (signed)');
    expect(copy.id).not.toBe(original.id);
    expect((await getDoc(original.id))?.name).toBe('Lease');
  });

  it('gives the copy its own page images, so deleting one keeps the other whole', async () => {
    const original = await seed('Passport');
    const copy = await duplicateDoc(original, 'Passport copy');

    const before = original.pages[0].imageKey;
    const after = copy.pages[0].imageKey;
    expect(after).not.toBe(before);
    // Both must resolve; a shared blob would take the copy's page down with
    // the original when the original is deleted.
    expect(await getBlob(before)).toBeDefined();
    expect(await getBlob(after)).toBeDefined();
  });

  it('deep-copies annotations, so editing the copy leaves the original alone', async () => {
    const original = await seed('Contract');
    const copy = await duplicateDoc(original, 'Contract v2');

    const note = copy.pages[0].annotations[0];
    if (note.kind !== 'text') throw new Error('expected a text note');
    note.text = 'changed on the copy';
    await saveDoc(copy);

    const reread = await getDoc(original.id);
    const originalNote = reread!.pages[0].annotations[0];
    expect(originalNote.kind === 'text' && originalNote.text).toBe('original');
  });

  it('gives every page a fresh id', async () => {
    const original = await seed('Receipt');
    const copy = await duplicateDoc(original, 'Receipt copy');
    expect(copy.pages[0].id).not.toBe(original.pages[0].id);
  });
});

import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import App from '../App';
import { newPage, putBlob, saveDoc } from '../lib/db';
import type { Doc } from '../types';

/** Seeds a document with `count` pages and routes to its first page. */
async function openPageEditor(id: string, count: number): Promise<Doc> {
  const pages = [];
  for (let i = 0; i < count; i++) {
    const key = await putBlob(new Blob([`page-${i}`]));
    pages.push({ ...newPage(key, 850, 1100, 'magic'), id: `${id}-p${i}` });
  }
  const doc = await saveDoc({
    id, name: id, createdAt: 1, updatedAt: Date.now(), pages,
  });
  window.location.hash = `#/doc/${id}/page/${id}-p0`;
  return doc;
}

const actionLabels = () =>
  [...document.querySelectorAll('.actions .btn')].map((b) => ({
    label: b.getAttribute('aria-label') ?? b.textContent?.trim() ?? '',
    disabled: (b as HTMLButtonElement).disabled,
  }));

beforeEach(() => {
  window.location.hash = '';
});

describe('the page editor action bar', () => {
  it('always offers a way back to the document, even on a single page', async () => {
    await openPageEditor('solo', 1);
    render(<App />);
    await waitFor(() => expect(screen.getByText(/Page 1 of 1/)).toBeTruthy());

    // The regression: with no pages to step to, the only live control was
    // "Clear marks" — a destructive action, and no way forward.
    const live = actionLabels().filter((b) => !b.disabled);
    expect(live.some((b) => b.label === 'Done')).toBe(true);
    expect(live.map((b) => b.label)).not.toEqual(['Clear marks']);
  });

  it('hides page stepping when there is only one page', async () => {
    await openPageEditor('solo2', 1);
    render(<App />);
    await waitFor(() => expect(screen.getByText(/Page 1 of 1/)).toBeTruthy());
    expect(actionLabels().some((b) => /page$/.test(b.label))).toBe(false);
  });

  it('offers page stepping when there is more than one', async () => {
    await openPageEditor('multi', 3);
    render(<App />);
    await waitFor(() => expect(screen.getByText(/Page 1 of 3/)).toBeTruthy());

    const labels = actionLabels();
    expect(labels.some((b) => b.label === 'Previous page')).toBe(true);
    expect(labels.some((b) => b.label === 'Next page')).toBe(true);
    // First page, so back is correctly unavailable but forward is not.
    expect(labels.find((b) => b.label === 'Previous page')?.disabled).toBe(true);
    expect(labels.find((b) => b.label === 'Next page')?.disabled).toBe(false);
  });
});

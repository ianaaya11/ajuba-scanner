import { describe, expect, it } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import App from '../App';

/** Builds a DragEvent carrying files, which jsdom does not synthesise itself. */
function dragEventWithFiles(type: string, files: File[]) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', {
    value: { types: ['Files'], files },
  });
  return event;
}

describe('app shell', () => {
  it('renders the library without crashing and settles on the empty state', async () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'ajuba scanner' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'New scan' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Import' })).toBeTruthy();

    // IndexedDB resolves asynchronously; the placeholder must give way.
    await waitFor(() => expect(screen.queryByText('Loading…')).toBeNull());
  });
});

describe('drag and drop import', () => {
  it('shows the drop hint while files are dragged over the window', async () => {
    render(<App />);
    await waitFor(() => expect(screen.queryByText('Loading…')).toBeNull());

    const pdf = new File(['%PDF-1.4'], 'contract.pdf', { type: 'application/pdf' });
    act(() => {
      window.dispatchEvent(dragEventWithFiles('dragover', [pdf]));
    });
    expect(screen.getByText('Drop PDFs or images to import')).toBeTruthy();
  });

  it('rejects a drag that carries no importable file type', async () => {
    render(<App />);
    await waitFor(() => expect(screen.queryByText('Loading…')).toBeNull());

    const text = new File(['notes'], 'notes.txt', { type: 'text/plain' });
    act(() => {
      window.dispatchEvent(dragEventWithFiles('drop', [text]));
    });
    await waitFor(() =>
      expect(screen.getByText('Only PDFs and images can be imported')).toBeTruthy(),
    );
  });

  it('does not show the hint for a drag with no files', async () => {
    render(<App />);
    await waitFor(() => expect(screen.queryByText('Loading…')).toBeNull());

    const event = new Event('dragover', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'dataTransfer', { value: { types: ['text/plain'], files: [] } });
    act(() => {
      window.dispatchEvent(event);
    });
    expect(screen.queryByText('Drop PDFs or images to import')).toBeNull();
  });
});

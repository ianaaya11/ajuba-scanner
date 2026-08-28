import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Doc } from '../types';
import { deleteDoc, emptyDoc, listDocs, newPage, putBlob, saveDoc } from '../lib/db';
import { blobToImageData, canvasToBlob, imageDataToCanvas } from '../lib/image';
import { isPdf, pdfToCanvases, pickDocuments } from '../lib/pdfImport';
import { isNative } from '../lib/platform';
import Backdrop from './Backdrop';
import ThemeToggle from './ThemeToggle';
import InstallButton from './InstallButton';
import { Busy, Confirm, relativeDate, useToast } from './components';
import { useBlobUrl } from './hooks';

function DocRow({ doc, onOpen, onDelete }: { doc: Doc; onOpen: () => void; onDelete: () => void }) {
  const thumb = useBlobUrl(doc.pages[0]?.imageKey);
  const pageLabel = `${doc.pages.length} page${doc.pages.length === 1 ? '' : 's'}`;

  return (
    <div className="doc-row">
      <button className="doc-open" onClick={onOpen}>
        {thumb ? <img className="thumb" src={thumb} alt="" /> : <div className="thumb" />}
        <div className="meta">
          <b>{doc.name}</b>
          <span>
            {pageLabel} · {relativeDate(doc.updatedAt)}
          </span>
        </div>
      </button>
      <button className="btn ghost icon danger" onClick={onDelete} aria-label={`Delete ${doc.name}`}>
        ✕
      </button>
    </div>
  );
}

export default function Library() {
  const navigate = useNavigate();
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [pending, setPending] = useState<Doc | null>(null);
  const [busy, setBusy] = useState<{ label: string; ratio?: number } | null>(null);
  const { toast, toastNode } = useToast();

  const refresh = useCallback(() => listDocs().then(setDocs), []);
  useEffect(() => {
    refresh();
  }, [refresh]);

  async function startScan() {
    const doc = await saveDoc(emptyDoc(`Scan ${new Date().toLocaleDateString()}`));
    navigate(`/doc/${doc.id}/scan`);
  }

  /** Imports PDFs and images into one new document, in the order given. */
  const importFiles = useCallback(
    async (files: Blob[]) => {
      if (!files.length) return;
      setBusy({ label: 'Importing', ratio: 0 });
      try {
        const doc = emptyDoc(`Imported ${new Date().toLocaleDateString()}`);
        for (const [index, file] of files.entries()) {
          const step = (done: number, total: number) =>
            setBusy({ label: 'Importing', ratio: (index + done / total) / files.length });

          const canvases = isPdf(file)
            ? await pdfToCanvases(file, step)
            : [imageDataToCanvas(await blobToImageData(file))];

          for (const canvas of canvases) {
            const key = await putBlob(await canvasToBlob(canvas, 0.9));
            doc.pages.push(newPage(key, canvas.width, canvas.height, 'original'));
          }
          step(1, 1);
        }
        if (!doc.pages.length) {
          toast('Nothing importable in that drop');
          return;
        }
        await saveDoc(doc);
        navigate(`/doc/${doc.id}`);
      } catch (error) {
        toast(error instanceof Error ? error.message : 'Could not read those files');
      } finally {
        setBusy(null);
      }
    },
    [navigate, toast],
  );

  // Dragging files onto the window is the natural desktop gesture; Android has
  // no equivalent, so the whole affordance is skipped there.
  const [dropping, setDropping] = useState(false);
  useEffect(() => {
    if (isNative()) return;
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');

    const onOver = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      setDropping(true);
    };
    const onLeave = (e: DragEvent) => {
      if (e.relatedTarget === null) setDropping(false);
    };
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      setDropping(false);
      const files = Array.from(e.dataTransfer?.files ?? []).filter(
        (f) => isPdf(f) || f.type.startsWith('image/'),
      );
      if (files.length) importFiles(files);
      else toast('Only PDFs and images can be imported');
    };

    window.addEventListener('dragover', onOver);
    window.addEventListener('dragleave', onLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragover', onOver);
      window.removeEventListener('dragleave', onLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, [importFiles, toast]);

  return (
    <div className="app">
      <Backdrop />

      <header className="bar">
        <h1 className="wordmark">ajuba scanner</h1>
        <InstallButton />
        <ThemeToggle />
      </header>

      <div className="body">
        {docs === null && <div className="empty">Loading…</div>}
        {docs?.length === 0 && (
          <div className="empty">
            <strong>No scans yet</strong>
            Point your camera at a page, or import a PDF you already have.
          </div>
        )}
        <div className="doc-list">
          {docs?.map((doc) => (
            <DocRow
              key={doc.id}
              doc={doc}
              onOpen={() => navigate(`/doc/${doc.id}`)}
              onDelete={() => setPending(doc)}
            />
          ))}
        </div>
      </div>

      <div className="actions">
        <button className="btn" onClick={async () => importFiles(await pickDocuments())}>
          Import
        </button>
        <button className="btn primary" onClick={startScan}>
          New scan
        </button>
      </div>

      {pending && (
        <Confirm
          title={`Delete “${pending.name}”?`}
          detail="This removes the document and its page images from this device."
          onCancel={() => setPending(null)}
          onConfirm={async () => {
            await deleteDoc(pending.id);
            setPending(null);
            refresh();
            toast('Deleted');
          }}
        />
      )}
      {dropping && <div className="drop-hint">Drop PDFs or images to import</div>}
      {busy && <Busy label={busy.label} ratio={busy.ratio} />}
      {toastNode}
    </div>
  );
}

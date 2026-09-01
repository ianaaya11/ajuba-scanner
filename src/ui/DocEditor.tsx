import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { Doc, Page } from '../types';
import { deleteBlobs, deleteDoc, duplicateDoc, emptyDoc, getDoc, saveDoc } from '../lib/db';
import { buildPdf, pdfFilename, renderPageCanvas } from '../lib/pdf';
import { recognise } from '../lib/ocr';
import { exportPdf } from '../lib/platform';
import { Busy, Confirm, Overlay, useToast } from './components';
import PageCanvas from './PageCanvas';

function PageCard({
  page,
  index,
  total,
  onOpen,
  onMove,
  onRotate,
  onDelete,
}: {
  page: Page;
  index: number;
  total: number;
  onOpen: () => void;
  onMove: (delta: number) => void;
  onRotate: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="page-card">
      <button className="shot" onClick={onOpen} aria-label={`Open page ${index + 1}`}>
        <PageCanvas
          page={page}
          maxSide={420}
          className="thumb-canvas"
        />
      </button>
      <div className="tools">
        <span className="num">{index + 1}</span>
        {page.ocrText && <span className="ocr-flag" title="Text recognised">OCR</span>}
        <button className="btn ghost sm" onClick={() => onMove(-1)} disabled={index === 0} aria-label="Move earlier">
          ←
        </button>
        <button
          className="btn ghost sm"
          onClick={() => onMove(1)}
          disabled={index === total - 1}
          aria-label="Move later"
        >
          →
        </button>
        <button className="btn ghost sm" onClick={onRotate} aria-label="Rotate">
          ⟳
        </button>
        <button className="btn ghost sm danger" onClick={onDelete} aria-label="Delete page">
          ✕
        </button>
      </div>
    </div>
  );
}

export default function DocEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast, toastNode } = useToast();

  const [doc, setDoc] = useState<Doc | null>(null);
  const [busy, setBusy] = useState<{ label: string; ratio?: number } | null>(null);
  const [confirming, setConfirming] = useState<Page | null>(null);
  const [deletingDoc, setDeletingDoc] = useState(false);
  const [splitting, setSplitting] = useState(false);
  const [copyName, setCopyName] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const load = useCallback(() => {
    if (id) getDoc(id).then((d) => setDoc(d ?? null));
  }, [id]);
  useEffect(load, [load]);

  const update = async (pages: Page[], name = doc!.name) => {
    setDoc(await saveDoc({ ...doc!, name, pages }));
  };

  function movePage(index: number, delta: number) {
    const pages = [...doc!.pages];
    const target = index + delta;
    if (target < 0 || target >= pages.length) return;
    [pages[index], pages[target]] = [pages[target], pages[index]];
    update(pages);
  }

  async function removePage(page: Page) {
    await update(doc!.pages.filter((p) => p.id !== page.id));
    await deleteBlobs([page.imageKey]);
    setConfirming(null);
    toast('Page deleted');
  }

  /** Runs OCR over every page that does not have text yet. */
  async function runOcr() {
    if (!doc?.pages.length) return;
    const todo = doc.pages.filter((p) => !p.ocrText);
    if (!todo.length) {
      toast('Every page already has text');
      return;
    }
    const pages = [...doc.pages];
    try {
      for (const [n, page] of todo.entries()) {
        setBusy({ label: `Reading page ${n + 1} of ${todo.length}`, ratio: 0 });
        const canvas = await renderPageCanvas(page);
        const result = await recognise(canvas, (ratio) =>
          setBusy({ label: `Reading page ${n + 1} of ${todo.length}`, ratio }),
        );
        const at = pages.findIndex((p) => p.id === page.id);
        pages[at] = { ...pages[at], ocrText: result.text, ocrWords: result.words };
      }
      await update(pages);
      toast('Text recognised — the PDF will be searchable');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'OCR failed');
    } finally {
      setBusy(null);
    }
  }

  async function exportDoc() {
    if (!doc?.pages.length) {
      toast('Add a page first');
      return;
    }
    setBusy({ label: 'Building PDF', ratio: 0 });
    try {
      const bytes = await buildPdf(doc, {
        onProgress: (done, total) => setBusy({ label: 'Building PDF', ratio: done / total }),
      });
      toast(await exportPdf(bytes, pdfFilename(doc.name)));
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Export failed');
    } finally {
      setBusy(null);
    }
  }

  /** Splits the document in two at the chosen page, keeping both halves. */
  async function splitAt(index: number) {
    const tail = doc!.pages.slice(index);
    const head = doc!.pages.slice(0, index);
    const second = emptyDoc(`${doc!.name} (part 2)`);
    second.pages = tail;
    await saveDoc(second);
    await update(head);
    setSplitting(false);
    toast(`Split into two documents at page ${index + 1}`);
  }

  if (!doc) {
    return (
      <div className="app">
        <header className="bar">
          <button className="btn ghost icon" onClick={() => navigate('/')} aria-label="Back">
            ‹
          </button>
          <h1>Document</h1>
        </header>
        <div className="body">
          <div className="empty">Loading…</div>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="bar">
        <button className="btn ghost icon" onClick={() => navigate('/')} aria-label="Back">
          ‹
        </button>
        <input
          className="title-input"
          value={doc.name}
          onChange={(e) => setDoc({ ...doc, name: e.target.value })}
          onBlur={() => update(doc.pages, doc.name)}
          aria-label="Document name"
        />
        <button className="btn sm" onClick={runOcr} disabled={!doc.pages.length}>
          OCR
        </button>
        {/* The rest live behind a menu: four actions plus a title does not fit
            a phone header, and the document's name is what matters most. */}
        <button
          className="btn sm icon"
          onClick={() => setMenuOpen(true)}
          aria-label="More actions"
          title="More actions"
        >
          ⋯
        </button>
      </header>

      <div className="body">
        {doc.pages.length === 0 ? (
          <div className="empty">
            <strong>No pages yet</strong>
            Tap “Add page” to scan one.
          </div>
        ) : (
          <div className="page-grid">
            {doc.pages.map((page, index) => (
              <PageCard
                key={page.id}
                page={page}
                index={index}
                total={doc.pages.length}
                onOpen={() => navigate(`/doc/${doc.id}/page/${page.id}`)}
                onMove={(delta) => movePage(index, delta)}
                onRotate={() =>
                  update(
                    doc.pages.map((p) =>
                      p.id === page.id ? { ...p, rotation: (p.rotation + 90) % 360 } : p,
                    ),
                  )
                }
                onDelete={() => setConfirming(page)}
              />
            ))}
          </div>
        )}
      </div>

      <div className="actions">
        <button className="btn" onClick={() => navigate(`/doc/${doc.id}/scan`)}>
          Add page
        </button>
        <button className="btn primary" onClick={exportDoc} disabled={!doc.pages.length}>
          Export PDF
        </button>
      </div>

      {confirming && (
        <Confirm
          title="Delete this page?"
          onCancel={() => setConfirming(null)}
          onConfirm={() => removePage(confirming)}
        />
      )}

      {deletingDoc && (
        <Confirm
          title={`Delete “${doc.name}”?`}
          detail={`This removes the document and all ${doc.pages.length} page${doc.pages.length === 1 ? '' : 's'} from this device. Export it first if you want to keep a copy.`}
          confirmLabel="Delete document"
          onCancel={() => setDeletingDoc(false)}
          onConfirm={async () => {
            await deleteDoc(doc.id);
            navigate('/', { replace: true });
          }}
        />
      )}

      {menuOpen && (
        <Overlay onClose={() => setMenuOpen(false)}>
          <h2>{doc.name}</h2>
          <p>
            {doc.pages.length} page{doc.pages.length === 1 ? '' : 's'}
          </p>
          <div className="menu-list">
            <button
              className="btn"
              disabled={!doc.pages.length}
              onClick={() => {
                setMenuOpen(false);
                setCopyName(`${doc.name} (copy)`);
              }}
            >
              Save a copy
            </button>
            <button
              className="btn"
              disabled={doc.pages.length < 2}
              onClick={() => {
                setMenuOpen(false);
                setSplitting(true);
              }}
            >
              Split document
            </button>
            <button
              className="btn danger"
              onClick={() => {
                setMenuOpen(false);
                setDeletingDoc(true);
              }}
            >
              Delete document
            </button>
          </div>
        </Overlay>
      )}

      {copyName !== null && (
        <Overlay onClose={() => setCopyName(null)}>
          <h2>Save a copy</h2>
          <p>
            The original stays exactly as it is, with its own pages and marks.
            Editing one will not touch the other.
          </p>
          <input
            type="text"
            value={copyName}
            autoFocus
            onChange={(e) => setCopyName(e.target.value)}
            aria-label="Name for the copy"
          />
          <div className="row">
            <button className="btn" style={{ flex: 1 }} onClick={() => setCopyName(null)}>
              Cancel
            </button>
            <button
              className="btn primary"
              style={{ flex: 1 }}
              disabled={!copyName.trim()}
              onClick={async () => {
                setBusy({ label: 'Copying' });
                try {
                  const copy = await duplicateDoc(doc, copyName.trim());
                  setCopyName(null);
                  navigate(`/doc/${copy.id}`, { replace: true });
                } catch (error) {
                  toast(error instanceof Error ? error.message : 'Could not copy');
                } finally {
                  setBusy(null);
                }
              }}
            >
              Save copy
            </button>
          </div>
        </Overlay>
      )}

      {splitting && (
        <Overlay onClose={() => setSplitting(false)}>
          <h2>Split document</h2>
          <p>Pick the page that should start the second document.</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {doc.pages.slice(1).map((page, i) => (
              <button key={page.id} className="chip" onClick={() => splitAt(i + 1)}>
                Page {i + 2}
              </button>
            ))}
          </div>
        </Overlay>
      )}

      {busy && <Busy label={busy.label} ratio={busy.ratio} />}
      {toastNode}
    </div>
  );
}

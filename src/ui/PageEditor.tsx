import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { Annotation, Doc, Point, Stroke } from '../types';
import { getDoc, saveDoc } from '../lib/db';
import {
  displaySize,
  highlightColors,
  isStroke,
  rotatePoint,
  strokeColors,
  unrotatePoint,
} from '../lib/annotations';
import { recognise } from '../lib/ocr';
import { renderPageCanvas } from '../lib/pdf';
import { Busy, Overlay, useToast } from './components';
import PageCanvas from './PageCanvas';

type Tool = 'pan' | 'draw' | 'highlight' | 'text';

export default function PageEditor() {
  const { id, pageId } = useParams<{ id: string; pageId: string }>();
  const navigate = useNavigate();
  const { toast, toastNode } = useToast();

  const [doc, setDoc] = useState<Doc | null>(null);
  const [tool, setTool] = useState<Tool>('draw');
  const [color, setColor] = useState(strokeColors[0]);
  const [width, setWidth] = useState(0.004);
  const [live, setLive] = useState<Stroke | null>(null);
  const [textAt, setTextAt] = useState<Point | null>(null);
  const [textValue, setTextValue] = useState('');
  const [busy, setBusy] = useState<{ label: string; ratio?: number } | null>(null);
  const [showOcr, setShowOcr] = useState(false);

  const stageRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ left: 0, top: 0, width: 0, height: 0 });

  const commitRef = useRef<((a: Annotation[]) => void) | null>(null);
  const page = doc?.pages.find((p) => p.id === pageId);
  const view = page ? displaySize(page.width, page.height, page.rotation) : { width: 1, height: 1 };

  useEffect(() => {
    if (id) getDoc(id).then((d) => setDoc(d ?? null));
  }, [id]);

  // The overlay has to sit exactly on the letterboxed page, so measure it.
  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const measure = () => {
      const el = stage.querySelector('canvas');
      if (!el) return;
      setBox({
        left: el.offsetLeft,
        top: el.offsetTop,
        width: el.clientWidth,
        height: el.clientHeight,
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    const canvas = stage.querySelector('canvas');
    if (canvas) observer.observe(canvas);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [page?.id, page?.rotation]);

  const pageIndexEarly = doc?.pages.findIndex((p) => p.id === pageId) ?? -1;

  // Keyboard shortcuts. Harmless on a phone, and the difference between usable
  // and tedious when marking up a long document with a keyboard to hand.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA)$/.test(target.tagName)) return;
      if (!doc) return;

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        const current = doc.pages.find((p) => p.id === pageId);
        if (current?.annotations.length) commitRef.current?.(current.annotations.slice(0, -1));
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const go = (delta: number) => {
        const next = doc.pages[pageIndexEarly + delta];
        if (next) navigate(`/doc/${doc.id}/page/${next.id}`);
      };
      switch (e.key) {
        case 'ArrowLeft':
          go(-1);
          break;
        case 'ArrowRight':
          go(1);
          break;
        case 'p':
          setTool('draw');
          break;
        case 'h':
          setTool('highlight');
          break;
        case 't':
          setTool('text');
          break;
        case 'v':
          setTool('pan');
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [doc, pageId, pageIndexEarly, navigate]);

  const commit = useCallback(
    async (annotations: Annotation[]) => {
      if (!doc || !page) return;
      setDoc(
        await saveDoc({
          ...doc,
          pages: doc.pages.map((p) => (p.id === page.id ? { ...p, annotations } : p)),
        }),
      );
    },
    [doc, page],
  );

  // Kept in a ref so the keyboard handler does not need to re-bind on every
  // annotation change. Assigned in an effect, never during render.
  useEffect(() => {
    commitRef.current = commit;
  }, [commit]);

  /** Pointer position as a fraction of the displayed page. */
  function toView(e: React.PointerEvent): Point | null {
    if (!box.width) return null;
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left - box.left) / box.width,
      y: (e.clientY - rect.top - box.top) / box.height,
    };
  }

  function onPointerDown(e: React.PointerEvent) {
    if (!page || tool === 'pan') return;
    const p = toView(e);
    if (!p || p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1) return;

    if (tool === 'text') {
      setTextAt(p);
      setTextValue('');
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    setLive({
      kind: tool,
      color,
      width: tool === 'highlight' ? width * 4 : width,
      points: [unrotatePoint(p, page.rotation)],
    });
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!live || !page) return;
    const p = toView(e);
    if (!p) return;
    setLive({ ...live, points: [...live.points, unrotatePoint(p, page.rotation)] });
  }

  function endStroke() {
    if (!live || !page) return;
    commit([...page.annotations, live]);
    setLive(null);
  }

  function addText() {
    if (!textAt || !page || !textValue.trim()) {
      setTextAt(null);
      return;
    }
    commit([
      ...page.annotations,
      {
        kind: 'text',
        color,
        size: 0.03,
        at: unrotatePoint(textAt, page.rotation),
        text: textValue,
      },
    ]);
    setTextAt(null);
    setTextValue('');
  }

  async function ocrThisPage() {
    if (!page || !doc) return;
    setBusy({ label: 'Reading this page', ratio: 0 });
    try {
      const canvas = await renderPageCanvas(page);
      const result = await recognise(canvas, (ratio) => setBusy({ label: 'Reading this page', ratio }));
      setDoc(
        await saveDoc({
          ...doc,
          pages: doc.pages.map((p) =>
            p.id === page.id ? { ...p, ocrText: result.text, ocrWords: result.words } : p,
          ),
        }),
      );
      setShowOcr(true);
    } catch (error) {
      toast(error instanceof Error ? error.message : 'OCR failed');
    } finally {
      setBusy(null);
    }
  }

  if (!doc || !page) {
    return (
      <div className="app">
        <header className="bar">
          <button className="btn ghost icon" onClick={() => navigate(-1)} aria-label="Back">
            ‹
          </button>
          <h1>Page</h1>
        </header>
        <div className="body">
          <div className="empty">Loading…</div>
        </div>
      </div>
    );
  }

  const palette = tool === 'highlight' ? highlightColors : strokeColors;
  const drawn: Annotation[] = live ? [...page.annotations, live] : page.annotations;
  const pageIndex = doc.pages.findIndex((p) => p.id === page.id);

  return (
    <div className="app">
      <header className="bar">
        <button className="btn ghost icon" onClick={() => navigate(`/doc/${doc.id}`)} aria-label="Back">
          ‹
        </button>
        <h1>
          Page {pageIndex + 1} of {doc.pages.length}
        </h1>
        <button
          className="btn sm"
          onClick={() => (page.ocrText ? setShowOcr(true) : ocrThisPage())}
        >
          {page.ocrText ? 'Text' : 'OCR'}
        </button>
        <button
          className="btn sm"
          onClick={() => commit(page.annotations.slice(0, -1))}
          disabled={!page.annotations.length}
        >
          Undo
        </button>
      </header>

      <div
        ref={stageRef}
        className="stage"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endStroke}
        onPointerCancel={endStroke}
        style={{ cursor: tool === 'pan' ? 'default' : 'crosshair' }}
      >
        <PageCanvas page={page} />
        {box.width > 0 && (
          <svg
            className="layer"
            style={{ left: box.left, top: box.top, width: box.width, height: box.height, pointerEvents: 'none' }}
            viewBox={`0 0 ${view.width} ${view.height}`}
            preserveAspectRatio="none"
          >
            {drawn.map((a, i) => {
              if (isStroke(a)) {
                const points = a.points
                  .map((p) => rotatePoint(p, page.rotation))
                  .map((p) => `${p.x * view.width},${p.y * view.height}`)
                  .join(' ');
                return (
                  <polyline
                    key={i}
                    points={points}
                    fill="none"
                    stroke={a.color}
                    strokeWidth={a.width * page.height}
                    strokeOpacity={a.kind === 'highlight' ? 0.35 : 1}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                );
              }
              const at = rotatePoint(a.at, page.rotation);
              const size = a.size * page.height;
              return (
                <text
                  key={i}
                  x={at.x * view.width}
                  y={at.y * view.height + size}
                  fill={a.color}
                  fontSize={size}
                  fontFamily="Helvetica, Arial, sans-serif"
                >
                  {a.text.split('\n').map((line, n) => (
                    <tspan key={n} x={at.x * view.width} dy={n === 0 ? 0 : size * 1.25}>
                      {line}
                    </tspan>
                  ))}
                </text>
              );
            })}
          </svg>
        )}
      </div>

      <div className="tool-bar">
        {(['draw', 'highlight', 'text', 'pan'] as Tool[]).map((t) => (
          <button
            key={t}
            className="chip"
            aria-pressed={tool === t}
            title={`${t === 'draw' ? 'Pen' : t === 'highlight' ? 'Highlight' : t === 'text' ? 'Text' : 'View'} (${t[0]})`}
            onClick={() => {
              setTool(t);
              if (t === 'highlight' && !highlightColors.includes(color)) setColor(highlightColors[0]);
              if (t !== 'highlight' && !strokeColors.includes(color)) setColor(strokeColors[0]);
            }}
          >
            {t === 'draw' ? 'Pen' : t === 'highlight' ? 'Highlight' : t === 'text' ? 'Text' : 'View'}
          </button>
        ))}
        <div className="swatches">
          {palette.map((c) => (
            <button
              key={c}
              className="swatch"
              style={{ background: c }}
              aria-pressed={color === c}
              aria-label={`Colour ${c}`}
              onClick={() => setColor(c)}
            />
          ))}
        </div>
        <input
          className="slider"
          type="range"
          min={0.002}
          max={0.02}
          step={0.001}
          value={width}
          onChange={(e) => setWidth(Number(e.target.value))}
          aria-label="Stroke width"
        />
      </div>

      <div className="actions">
        <button
          className="btn"
          onClick={() => navigate(`/doc/${doc.id}/page/${doc.pages[pageIndex - 1].id}`)}
          disabled={pageIndex === 0}
        >
          Previous
        </button>
        <button className="btn danger" onClick={() => commit([])} disabled={!page.annotations.length}>
          Clear marks
        </button>
        <button
          className="btn"
          onClick={() => navigate(`/doc/${doc.id}/page/${doc.pages[pageIndex + 1].id}`)}
          disabled={pageIndex === doc.pages.length - 1}
        >
          Next
        </button>
      </div>

      {textAt && (
        <Overlay onClose={() => setTextAt(null)}>
          <h2>Add text</h2>
          <textarea
            rows={3}
            value={textValue}
            autoFocus
            onChange={(e) => setTextValue(e.target.value)}
            placeholder="Type here…"
          />
          <div className="row">
            <button className="btn" style={{ flex: 1 }} onClick={() => setTextAt(null)}>
              Cancel
            </button>
            <button className="btn primary" style={{ flex: 1 }} onClick={addText}>
              Place
            </button>
          </div>
        </Overlay>
      )}

      {showOcr && (
        <Overlay onClose={() => setShowOcr(false)}>
          <h2>Recognised text</h2>
          <div className="ocr-text">{page.ocrText || 'Nothing was recognised on this page.'}</div>
          <div className="row">
            <button
              className="btn"
              style={{ flex: 1 }}
              onClick={() => {
                navigator.clipboard?.writeText(page.ocrText ?? '');
                toast('Copied');
              }}
            >
              Copy
            </button>
            <button className="btn" style={{ flex: 1 }} onClick={ocrThisPage}>
              Re-run
            </button>
            <button className="btn primary" style={{ flex: 1 }} onClick={() => setShowOcr(false)}>
              Close
            </button>
          </div>
        </Overlay>
      )}

      {busy && <Busy label={busy.label} ratio={busy.ratio} />}
      {toastNode}
    </div>
  );
}

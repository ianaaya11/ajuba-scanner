import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { Annotation, Box, Doc, Point, Stroke } from '../types';
import { getDoc, saveDoc } from '../lib/db';
import {
  annotationBounds,
  annotationLabel,
  canScale,
  displaySize,
  hitTest,
  highlightColors,
  isStroke,
  moveAnnotation,
  rotatePoint,
  scaleAnnotation,
  signaturePolylines,
  strokeColors,
  unrotatePoint,
} from '../lib/annotations';
import { recognise } from '../lib/ocr';
import { renderPageCanvas } from '../lib/pdf';
import { Busy, Overlay, useToast } from './components';
import PageCanvas from './PageCanvas';
import SignaturePad from './SignaturePad';
import DateStamp from './DateStamp';

type Tool = 'pan' | 'draw' | 'highlight' | 'text' | 'sign' | 'date' | 'select';

const TOOLS: { id: Tool; label: string; key: string }[] = [
  { id: 'select', label: 'Select', key: 'e' },
  { id: 'draw', label: 'Pen', key: 'p' },
  { id: 'highlight', label: 'Highlight', key: 'h' },
  { id: 'text', label: 'Text', key: 't' },
  { id: 'sign', label: 'Sign', key: 's' },
  { id: 'date', label: 'Date', key: 'd' },
  { id: 'pan', label: 'View', key: 'v' },
];

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
  // Signing marks out an area first, then asks for the signature.
  const [marking, setMarking] = useState<{ from: Point; to: Point } | null>(null);
  const [signBox, setSignBox] = useState<Box | null>(null);
  const [dateAt, setDateAt] = useState<Point | null>(null);
  // Index into page.annotations, so a bad mark can be removed on its own
  // rather than undoing everything after it.
  const [selected, setSelected] = useState<number | null>(null);
  const dragFrom = useRef<Point | null>(null);
  // Resizing works from the mark as it was when the drag began, so the factor
  // is absolute rather than compounding frame by frame.
  const resizing = useRef<{ origin: Annotation; from: number; centre: Point } | null>(null);
  const [textValue, setTextValue] = useState('');
  const [busy, setBusy] = useState<{ label: string; ratio?: number } | null>(null);
  const [showOcr, setShowOcr] = useState(false);

  const stageRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ left: 0, top: 0, width: 0, height: 0 });

  const commitRef = useRef<((a: Annotation[]) => void) | null>(null);
  const selectedRef = useRef<number | null>(null);
  const scaleRef = useRef<((f: number) => void) | null>(null);
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
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedRef.current !== null) {
        e.preventDefault();
        const current = doc.pages.find((p) => p.id === pageId);
        if (current) {
          commitRef.current?.(current.annotations.filter((_, i) => i !== selectedRef.current));
          setSelected(null);
        }
        return;
      }
      if (e.key === 'Escape') return setSelected(null);
      if ((e.key === '+' || e.key === '=' || e.key === '-') && selectedRef.current !== null) {
        e.preventDefault();
        scaleRef.current?.(e.key === '-' ? 1 / 1.15 : 1.15);
        return;
      }
      if (e.key === 'ArrowLeft') return go(-1);
      if (e.key === 'ArrowRight') return go(1);
      const tool = TOOLS.find((t) => t.key === e.key.toLowerCase());
      if (tool) setTool(tool.id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [doc, pageId, pageIndexEarly, navigate]);

  // Clear the selection when moving to a different page, or when leaving the
  // select tool. Switching *to* select must not clear it, or a programmatic
  // selection — such as a freshly placed signature — is wiped by this effect
  // running after it.
  useEffect(() => {
    setSelected(null);
  }, [pageId]);

  useEffect(() => {
    if (tool !== 'select') setSelected(null);
  }, [tool]);

  /** Grows or shrinks the selected mark about its centre. */
  const scaleSelected = useCallback(
    (factor: number) => {
      if (selected === null || !page || !doc) return;
      const next = [...page.annotations];
      next[selected] = scaleAnnotation(next[selected], factor, page.width, page.height);
      setDoc({ ...doc, pages: doc.pages.map((q) => (q.id === page.id ? { ...q, annotations: next } : q)) });
      commitRef.current?.(next);
    },
    [selected, page, doc],
  );

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

  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  useEffect(() => {
    scaleRef.current = scaleSelected;
  }, [scaleSelected]);

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
    if (tool === 'date') {
      setDateAt(p);
      return;
    }
    if (tool === 'sign') {
      e.currentTarget.setPointerCapture(e.pointerId);
      setMarking({ from: p, to: p });
      return;
    }
    if (tool === 'select') {
      const local = unrotatePoint(p, page.rotation);

      // The resize handle sits on the selection corner and takes precedence,
      // or dragging it would just move the mark instead.
      if (selected !== null && page.annotations[selected]) {
        const b = annotationBounds(page.annotations[selected], page.width, page.height);
        const corner = { x: b.x + b.w, y: b.y + b.h };
        const reach = 0.05;
        if (Math.abs(local.x - corner.x) < reach && Math.abs(local.y - corner.y) < reach) {
          const centre = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
          const from = Math.hypot(local.x - centre.x, local.y - centre.y);
          if (from > 1e-4) {
            e.currentTarget.setPointerCapture(e.pointerId);
            resizing.current = { origin: page.annotations[selected], from, centre };
            return;
          }
        }
      }

      const hit = hitTest(page.annotations, local, page.width, page.height);
      setSelected(hit < 0 ? null : hit);
      if (hit >= 0) {
        e.currentTarget.setPointerCapture(e.pointerId);
        dragFrom.current = p;
      }
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
    if (!page) return;
    const p = toView(e);
    if (!p) return;

    if (marking) {
      setMarking({ ...marking, to: p });
      return;
    }
    if (resizing.current && selected !== null) {
      const { origin, from, centre } = resizing.current;
      const local = unrotatePoint(p, page.rotation);
      const now = Math.hypot(local.x - centre.x, local.y - centre.y);
      const next = [...page.annotations];
      next[selected] = scaleAnnotation(origin, now / from, page.width, page.height);
      setDoc({ ...doc!, pages: doc!.pages.map((q) => (q.id === page.id ? { ...q, annotations: next } : q)) });
      return;
    }
    if (dragFrom.current !== null && selected !== null) {
      const from = unrotatePoint(dragFrom.current, page.rotation);
      const to = unrotatePoint(p, page.rotation);
      dragFrom.current = p;
      // Live drag writes straight through; commit persists on release.
      const next = [...page.annotations];
      next[selected] = moveAnnotation(next[selected], to.x - from.x, to.y - from.y);
      setDoc({ ...doc!, pages: doc!.pages.map((q) => (q.id === page.id ? { ...q, annotations: next } : q)) });
      return;
    }
    if (!live) return;
    setLive({ ...live, points: [...live.points, unrotatePoint(p, page.rotation)] });
  }

  /** Turns the dragged rectangle into a box in unrotated page coordinates. */
  function finishMarking() {
    if (!marking || !page) return;
    const { from, to } = marking;
    setMarking(null);

    const a = unrotatePoint(from, page.rotation);
    const b = unrotatePoint(to, page.rotation);
    const box: Box = {
      x: Math.min(a.x, b.x),
      y: Math.min(a.y, b.y),
      w: Math.abs(b.x - a.x),
      h: Math.abs(b.y - a.y),
    };
    // A tap rather than a drag: give a sensible default area to sign in.
    if (box.w < 0.04 || box.h < 0.02) {
      const w = 0.34;
      const h = 0.09;
      setSignBox({
        x: Math.max(0, Math.min(1 - w, a.x - w / 2)),
        y: Math.max(0, Math.min(1 - h, a.y - h / 2)),
        w,
        h,
      });
    } else {
      setSignBox(box);
    }
  }

  function endStroke() {
    if (resizing.current !== null) {
      resizing.current = null;
      if (page) commit(page.annotations);
      return;
    }
    if (dragFrom.current !== null) {
      dragFrom.current = null;
      if (page) commit(page.annotations);
      return;
    }
    if (marking) {
      finishMarking();
      return;
    }
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
        style={{ cursor: tool === 'pan' ? 'default' : tool === 'select' ? 'pointer' : 'crosshair' }}
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
              if (a.kind === 'signature') {
                const { lines, strokeWidth } = signaturePolylines(a, page.width, page.height);
                return (
                  <g key={i}>
                    {lines.map((line, n) => (
                      <polyline
                        key={n}
                        points={line
                          .map((p) => rotatePoint(p, page.rotation))
                          .map((p) => `${p.x * view.width},${p.y * view.height}`)
                          .join(' ')}
                        fill="none"
                        stroke={a.color}
                        strokeWidth={strokeWidth}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    ))}
                  </g>
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
            {selected !== null && page.annotations[selected] && (() => {
              const b = annotationBounds(page.annotations[selected], page.width, page.height);
              // The box is stored unrotated; rotate its corners and re-fit.
              const corners = [
                { x: b.x, y: b.y },
                { x: b.x + b.w, y: b.y },
                { x: b.x + b.w, y: b.y + b.h },
                { x: b.x, y: b.y + b.h },
              ].map((p) => rotatePoint(p, page.rotation));
              const xs = corners.map((p) => p.x);
              const ys = corners.map((p) => p.y);
              const corner = rotatePoint({ x: b.x + b.w, y: b.y + b.h }, page.rotation);
              return (
                <g>
                  <rect
                    className="selection"
                    x={Math.min(...xs) * view.width}
                    y={Math.min(...ys) * view.height}
                    width={(Math.max(...xs) - Math.min(...xs)) * view.width}
                    height={(Math.max(...ys) - Math.min(...ys)) * view.height}
                  />
                  {/* Drag this corner to resize; the buttons below do the same
                      in steps, which is easier to hit on a phone. */}
                  <circle
                    className="resize-handle"
                    cx={corner.x * view.width}
                    cy={corner.y * view.height}
                    r={Math.max(view.width, view.height) * 0.018}
                  />
                </g>
              );
            })()}
            {marking && (
              <rect
                x={Math.min(marking.from.x, marking.to.x) * view.width}
                y={Math.min(marking.from.y, marking.to.y) * view.height}
                width={Math.abs(marking.to.x - marking.from.x) * view.width}
                height={Math.abs(marking.to.y - marking.from.y) * view.height}
                className="marquee"
              />
            )}
          </svg>
        )}
      </div>

      <div className="tool-bar">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            className="chip"
            aria-pressed={tool === t.id}
            title={`${t.label} (${t.key})`}
            onClick={() => {
              setTool(t.id);
              if (t.id === 'highlight' && !highlightColors.includes(color)) setColor(highlightColors[0]);
              if (t.id !== 'highlight' && !strokeColors.includes(color)) setColor(strokeColors[0]);
            }}
          >
            {t.label}
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

      {selected !== null && page.annotations[selected] && (
        <div className="selection-bar">
          <span className="selection-name">{annotationLabel(page.annotations[selected])} selected</span>
          <span className="selection-hint">Drag to move, corner to resize</span>
          <button
            className="btn sm icon"
            onClick={() => scaleSelected(1 / 1.15)}
            disabled={!canScale(page.annotations[selected], 1 / 1.15, page.width, page.height)}
            aria-label="Make smaller"
            title="Make smaller"
          >
            −
          </button>
          <button
            className="btn sm icon"
            onClick={() => scaleSelected(1.15)}
            disabled={!canScale(page.annotations[selected], 1.15, page.width, page.height)}
            aria-label="Make larger"
            title="Make larger"
          >
            +
          </button>
          <button className="btn sm" onClick={() => setSelected(null)}>
            Done
          </button>
          <button
            className="btn sm primary danger"
            onClick={() => {
              commit(page.annotations.filter((_, i) => i !== selected));
              setSelected(null);
              toast('Deleted');
            }}
          >
            Delete
          </button>
        </div>
      )}

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

      {signBox && (
        <SignaturePad
          onCancel={() => setSignBox(null)}
          onDone={({ strokes, aspect }) => {
            commit([
              ...page.annotations,
              { kind: 'signature', color: '#12162a', box: signBox, aspect, width: 0.05, strokes },
            ]);
            setSignBox(null);
            setTool('select');
            setSelected(page.annotations.length);
            toast('Signature placed — drag to move, or Delete');
          }}
        />
      )}

      {dateAt && (
        <DateStamp
          onCancel={() => setDateAt(null)}
          onDone={(text) => {
            commit([
              ...page.annotations,
              { kind: 'text', color, size: 0.024, at: unrotatePoint(dateAt, page.rotation), text },
            ]);
            setDateAt(null);
          }}
        />
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

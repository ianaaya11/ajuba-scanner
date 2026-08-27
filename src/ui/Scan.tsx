import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { Doc, FilterId, Point, Quad } from '../types';
import { getDoc, newPage, putBlob, saveDoc } from '../lib/db';
import { defaultQuad, detectDocumentQuad } from '../lib/detect';
import { applyFilter } from '../lib/imaging';
import { imageDataToBlob, imageDataToCanvas, loadScaled } from '../lib/image';
import { capturePhoto, pickImages } from '../lib/platform';
import { warpQuad } from '../lib/warp';
import { Busy, useToast } from './components';

const FILTERS: { id: FilterId; label: string }[] = [
  { id: 'magic', label: 'Auto' },
  { id: 'bw', label: 'B & W' },
  { id: 'gray', label: 'Greyscale' },
  { id: 'color', label: 'Colour' },
  { id: 'original', label: 'Original' },
];

const HANDLE_RADIUS = 26;

/** Tracks where a fitted canvas actually sits inside the stage, for hit-testing. */
function useElementBox(ref: React.RefObject<HTMLCanvasElement | null>, deps: unknown[]) {
  const [box, setBox] = useState({ left: 0, top: 0, width: 0, height: 0 });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () =>
      setBox({
        left: el.offsetLeft,
        top: el.offsetTop,
        width: el.clientWidth,
        height: el.clientHeight,
      });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return box;
}

export default function Scan() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast, toastNode } = useToast();

  const [doc, setDoc] = useState<Doc | null>(null);
  const [source, setSource] = useState<ImageData | null>(null);
  const [queue, setQueue] = useState<Blob[]>([]);
  const [quad, setQuad] = useState<Quad | null>(null);
  const [step, setStep] = useState<'crop' | 'filter'>('crop');
  const [filter, setFilter] = useState<FilterId>('magic');
  const [preview, setPreview] = useState<ImageData | null>(null);
  const [warped, setWarped] = useState<ImageData | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragging = useRef<number | null>(null);
  const box = useElementBox(canvasRef, [source, preview, step]);

  useEffect(() => {
    if (id) getDoc(id).then((d) => setDoc(d ?? null));
  }, [id]);

  /** Loads the next photo and finds its page boundary. */
  const beginPhoto = useCallback(async (blob: Blob) => {
    setBusy('Finding edges');
    try {
      const image = await loadScaled(blob, 2400);
      setSource(image);
      setQuad(detectDocumentQuad(image).quad);
      setStep('crop');
      setWarped(null);
      setPreview(null);
    } finally {
      setBusy(null);
    }
  }, []);

  // Open the camera as soon as the screen appears, so scanning is one tap.
  const started = useRef(false);
  useEffect(() => {
    if (started.current || !doc) return;
    started.current = true;
    capturePhoto()
      .then((blob) => (blob ? beginPhoto(blob) : navigate(`/doc/${doc.id}`, { replace: true })))
      .catch(() => navigate(`/doc/${doc.id}`, { replace: true }));
  }, [doc, beginPhoto, navigate]);

  // Paint whichever image the current step is showing.
  useEffect(() => {
    const canvas = canvasRef.current;
    const image = step === 'crop' ? source : preview;
    if (!canvas || !image) return;
    canvas.width = image.width;
    canvas.height = image.height;
    canvas.getContext('2d')!.putImageData(image, 0, 0);
  }, [source, preview, step]);

  // Recompute the filter preview on a small copy — full resolution waits for save.
  useEffect(() => {
    if (step !== 'filter' || !warped) return;
    let cancelled = false;
    const scale = Math.min(1, 900 / Math.max(warped.width, warped.height));
    const small = imageDataToCanvas(warped);
    const target = document.createElement('canvas');
    target.width = Math.max(1, Math.round(warped.width * scale));
    target.height = Math.max(1, Math.round(warped.height * scale));
    const ctx = target.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(small, 0, 0, target.width, target.height);
    const data = ctx.getImageData(0, 0, target.width, target.height);
    // Let the chip paint its pressed state before the filter blocks the thread.
    const handle = setTimeout(() => {
      const result = applyFilter(data, filter);
      if (!cancelled) setPreview(result);
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [filter, warped, step]);

  function toImageSpace(e: React.PointerEvent): Point | null {
    if (!source || !box.width) return null;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left - box.left) / box.width) * source.width;
    const y = ((e.clientY - rect.top - box.top) / box.height) * source.height;
    return { x, y };
  }

  function onPointerDown(e: React.PointerEvent) {
    if (step !== 'crop' || !quad || !source) return;
    const p = toImageSpace(e);
    if (!p) return;
    const scale = source.width / box.width;
    let nearest = -1;
    let best = HANDLE_RADIUS * scale;
    quad.forEach((corner, i) => {
      const d = Math.hypot(corner.x - p.x, corner.y - p.y);
      if (d < best) {
        best = d;
        nearest = i;
      }
    });
    if (nearest < 0) return;
    dragging.current = nearest;
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    const index = dragging.current;
    if (index === null || !quad || !source) return;
    const p = toImageSpace(e);
    if (!p) return;
    const next = [...quad] as Quad;
    next[index] = {
      x: Math.max(0, Math.min(source.width, p.x)),
      y: Math.max(0, Math.min(source.height, p.y)),
    };
    setQuad(next);
  }

  const endDrag = () => {
    dragging.current = null;
  };

  async function confirmCrop() {
    if (!source || !quad) return;
    setBusy('Straightening');
    setTimeout(() => {
      const result = warpQuad(source, quad);
      setWarped(result);
      setStep('filter');
      setBusy(null);
    }, 30);
  }

  async function savePage(then: 'more' | 'done') {
    if (!warped || !doc) return;
    setBusy('Saving page');
    try {
      const finished = applyFilter(warped, filter);
      const blob = await imageDataToBlob(finished, 0.9);
      const key = await putBlob(blob);
      const updated = await saveDoc({
        ...doc,
        pages: [...doc.pages, newPage(key, finished.width, finished.height, filter)],
      });
      setDoc(updated);

      if (then === 'done') {
        navigate(`/doc/${updated.id}`, { replace: true });
        return;
      }
      const next = queue[0];
      if (next) {
        setQueue(queue.slice(1));
        await beginPhoto(next);
      } else {
        const blobToScan = await capturePhoto();
        if (blobToScan) await beginPhoto(blobToScan);
        else navigate(`/doc/${updated.id}`, { replace: true });
      }
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not save the page');
    } finally {
      setBusy(null);
    }
  }

  async function importImages() {
    const blobs = await pickImages();
    if (!blobs.length) return;
    setQueue(blobs.slice(1));
    await beginPhoto(blobs[0]);
  }

  const showing = step === 'crop' ? source : preview;

  return (
    <div className="app">
      <header className="bar">
        <button className="btn ghost icon" onClick={() => navigate(`/doc/${id}`)} aria-label="Back">
          ‹
        </button>
        <h1>{step === 'crop' ? 'Adjust corners' : 'Choose a look'}</h1>
        <span style={{ color: 'var(--muted)', fontSize: 13 }}>
          {doc ? `${doc.pages.length} saved` : ''}
        </span>
      </header>

      <div
        className="stage"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <canvas ref={canvasRef} />
        {step === 'crop' && quad && source && box.width > 0 && (
          <svg
            className="layer"
            style={{ left: box.left, top: box.top, width: box.width, height: box.height }}
            viewBox={`0 0 ${source.width} ${source.height}`}
            preserveAspectRatio="none"
          >
            <polygon
              points={quad.map((p) => `${p.x},${p.y}`).join(' ')}
              fill="rgba(79,140,255,.18)"
              stroke="#4f8cff"
              strokeWidth={source.width / 220}
            />
            {quad.map((p, i) => (
              <circle
                key={i}
                cx={p.x}
                cy={p.y}
                r={source.width / 45}
                fill="#4f8cff"
                stroke="#fff"
                strokeWidth={source.width / 340}
              />
            ))}
          </svg>
        )}
        {!showing && !busy && <div className="empty">Waiting for a photo…</div>}
      </div>

      {step === 'filter' && (
        <div className="filter-strip">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              className="chip"
              aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      <div className="actions">
        {step === 'crop' ? (
          <>
            <button className="btn" onClick={importImages}>
              Gallery
            </button>
            <button
              className="btn"
              onClick={() => source && setQuad(defaultQuad(source.width, source.height))}
              disabled={!source}
            >
              Reset
            </button>
            <button className="btn primary" onClick={confirmCrop} disabled={!source}>
              Crop
            </button>
          </>
        ) : (
          <>
            <button className="btn" onClick={() => setStep('crop')}>
              Back
            </button>
            <button className="btn" onClick={() => savePage('more')}>
              Save + scan next
            </button>
            <button className="btn primary" onClick={() => savePage('done')}>
              Done
            </button>
          </>
        )}
      </div>

      {busy && <Busy label={busy} />}
      {toastNode}
    </div>
  );
}

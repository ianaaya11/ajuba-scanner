import { useCallback, useEffect, useRef, useState } from 'react';
import type { Point } from '../types';
import { packSignature } from '../lib/annotations';
import { Overlay } from './components';

const SAVED_KEY = 'ajuba.signature';

interface Packed {
  strokes: Point[][];
  aspect: number;
}

/** The saved signature is a per-device convenience; it never leaves the browser. */
function loadSaved(): Packed | null {
  try {
    const raw = localStorage.getItem(SAVED_KEY);
    return raw ? (JSON.parse(raw) as Packed) : null;
  } catch {
    return null;
  }
}

export default function SignaturePad({
  onDone,
  onCancel,
}: {
  onDone: (signature: Packed) => void;
  onCancel: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<Point[][]>([]);
  const drawing = useRef(false);
  const [hasInk, setHasInk] = useState(false);
  const [saved] = useState(loadSaved);
  const [remember, setRemember] = useState(true);

  const repaint = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Signing rule, so there is something to sign on.
    ctx.strokeStyle = 'rgba(128,140,170,.45)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(24, canvas.height * 0.76);
    ctx.lineTo(canvas.width - 24, canvas.height * 0.76);
    ctx.stroke();

    ctx.strokeStyle = '#12162a';
    ctx.lineWidth = 2.6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const stroke of strokes.current) {
      if (stroke.length < 2) continue;
      ctx.beginPath();
      stroke.forEach((p, i) =>
        i ? ctx.lineTo(p.x * canvas.width, p.y * canvas.height)
          : ctx.moveTo(p.x * canvas.width, p.y * canvas.height),
      );
      ctx.stroke();
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Match the backing store to the CSS box so the line is not blurry.
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    repaint();
  }, [repaint]);

  function at(e: React.PointerEvent): Point {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height };
  }

  return (
    <Overlay onClose={onCancel}>
      <h2>Sign here</h2>
      <p>Draw your signature. It will be fitted into the area you marked.</p>

      <canvas
        ref={canvasRef}
        className="sign-pad"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          drawing.current = true;
          strokes.current.push([at(e)]);
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          strokes.current[strokes.current.length - 1].push(at(e));
          repaint();
        }}
        onPointerUp={() => {
          drawing.current = false;
          setHasInk(strokes.current.some((s) => s.length > 1));
        }}
        onPointerCancel={() => {
          drawing.current = false;
        }}
      />

      <label className="check">
        <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
        Remember this signature on this device
      </label>

      <div className="row">
        <button
          className="btn"
          onClick={() => {
            strokes.current = [];
            setHasInk(false);
            repaint();
          }}
        >
          Clear
        </button>
        {saved && (
          <button className="btn" onClick={() => onDone(saved)}>
            Use saved
          </button>
        )}
        <button
          className="btn primary"
          disabled={!hasInk}
          onClick={() => {
            const packed = packSignature(strokes.current);
            if (!packed) return;
            if (remember) {
              try {
                localStorage.setItem(SAVED_KEY, JSON.stringify(packed));
              } catch {
                // A full or blocked store must not stop the signature being placed.
              }
            }
            onDone(packed);
          }}
        >
          Place
        </button>
      </div>
    </Overlay>
  );
}

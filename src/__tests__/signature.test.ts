import { describe, expect, it } from 'vitest';
import type { Signature } from '../types';
import { packSignature, signaturePolylines } from '../lib/annotations';

describe('packSignature', () => {
  it('normalises strokes to their own bounding box', () => {
    const packed = packSignature([
      [
        { x: 100, y: 50 },
        { x: 300, y: 50 },
        { x: 300, y: 150 },
      ],
    ])!;
    const flat = packed.strokes.flat();
    expect(Math.min(...flat.map((p) => p.x))).toBeCloseTo(0, 6);
    expect(Math.max(...flat.map((p) => p.x))).toBeCloseTo(1, 6);
    expect(Math.min(...flat.map((p) => p.y))).toBeCloseTo(0, 6);
    expect(Math.max(...flat.map((p) => p.y))).toBeCloseTo(1, 6);
  });

  it('records the natural aspect ratio', () => {
    const packed = packSignature([
      [
        { x: 0, y: 0 },
        { x: 400, y: 0 },
        { x: 400, y: 100 },
      ],
    ])!;
    expect(packed.aspect).toBeCloseTo(4, 6);
  });

  it('rejects a stray tap with nothing drawn', () => {
    expect(packSignature([])).toBeNull();
    expect(packSignature([[{ x: 5, y: 5 }]])).toBeNull();
  });

  it('survives a perfectly flat stroke without dividing by zero', () => {
    const packed = packSignature([
      [
        { x: 0, y: 10 },
        { x: 200, y: 10 },
      ],
    ])!;
    expect(Number.isFinite(packed.aspect)).toBe(true);
    expect(packed.strokes.flat().every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
  });
});

describe('signaturePolylines', () => {
  const sig = (box: Signature['box'], aspect: number): Signature => ({
    kind: 'signature',
    color: '#000',
    box,
    aspect,
    width: 0.05,
    strokes: [
      [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 1 },
      ],
    ],
  });

  /** Measures the drawn signature in page pixels. */
  function drawnSize(s: Signature, pw: number, ph: number) {
    const pts = signaturePolylines(s, pw, ph).lines.flat();
    const xs = pts.map((p) => p.x * pw);
    const ys = pts.map((p) => p.y * ph);
    return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  }

  it('keeps the aspect ratio on a non-square page', () => {
    // A4-ish page: normalised coordinates are far from square here, so scaling
    // in them directly would stretch the signature by the page's own ratio.
    const { w, h } = drawnSize(sig({ x: 0.1, y: 0.1, w: 0.6, h: 0.3 }, 3), 850, 1100);
    expect(w / h).toBeCloseTo(3, 4);
  });

  it('fits inside the marked box on either constraining axis', () => {
    const pw = 850;
    const ph = 1100;
    for (const aspect of [0.5, 1, 3, 8]) {
      const box = { x: 0.2, y: 0.4, w: 0.5, h: 0.2 };
      const { w, h } = drawnSize(sig(box, aspect), pw, ph);
      expect(w).toBeLessThanOrEqual(box.w * pw + 0.01);
      expect(h).toBeLessThanOrEqual(box.h * ph + 0.01);
      expect(w / h).toBeCloseTo(aspect, 4);
    }
  });

  it('centres the signature within the box', () => {
    const pw = 800;
    const ph = 1000;
    const box = { x: 0.1, y: 0.2, w: 0.6, h: 0.4 };
    // Wide signature in a tall box: it should be pinned left-to-right and
    // centred vertically, with equal gaps above and below.
    const pts = signaturePolylines(sig(box, 4), pw, ph).lines.flat();
    const ys = pts.map((p) => p.y * ph);
    const gapAbove = Math.min(...ys) - box.y * ph;
    const gapBelow = (box.y + box.h) * ph - Math.max(...ys);
    expect(gapAbove).toBeCloseTo(gapBelow, 4);
  });

  it('scales stroke width with the fitted height, not the raw box', () => {
    const small = signaturePolylines(sig({ x: 0, y: 0, w: 0.2, h: 0.1 }, 3), 850, 1100);
    const large = signaturePolylines(sig({ x: 0, y: 0, w: 0.8, h: 0.4 }, 3), 850, 1100);
    expect(large.strokeWidth).toBeGreaterThan(small.strokeWidth);
  });
});

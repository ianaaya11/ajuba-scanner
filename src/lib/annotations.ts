import type { Annotation, Point, Signature } from '../types';

/**
 * Annotations are stored against the unrotated page. Rotation is applied when
 * drawing, so turning a page never disturbs what is already on it.
 */
export function rotatePoint(p: Point, rotation: number): Point {
  switch ((((rotation / 90) | 0) % 4 + 4) % 4) {
    case 1:
      return { x: 1 - p.y, y: p.x };
    case 2:
      return { x: 1 - p.x, y: 1 - p.y };
    case 3:
      return { x: p.y, y: 1 - p.x };
    default:
      return p;
  }
}

/** Inverse of `rotatePoint` — turns a click on the rotated view back into storage space. */
export function unrotatePoint(p: Point, rotation: number): Point {
  return rotatePoint(p, 360 - ((((rotation / 90) | 0) % 4 + 4) % 4) * 90);
}

/** Displayed page size in pixels once rotation is taken into account. */
export function displaySize(width: number, height: number, rotation: number) {
  const swap = ((((rotation / 90) | 0) % 4) + 4) % 4 % 2 === 1;
  return { width: swap ? height : width, height: swap ? width : height };
}

export const strokeColors = ['#111827', '#dc2626', '#2563eb', '#16a34a'];
export const highlightColors = ['#fde047', '#86efac', '#93c5fd', '#fca5a5'];

/** Absolute pixel size for a stored annotation, given the unrotated page height. */
export const toPixels = (fraction: number, pageHeight: number) => fraction * pageHeight;

export function isStroke(a: Annotation): a is Extract<Annotation, { points: Point[] }> {
  return a.kind === 'draw' || a.kind === 'highlight';
}

/**
 * Fits a signature into the box it was placed in, preserving its aspect ratio,
 * and returns its strokes as polylines in normalised page coordinates.
 *
 * The fit has to happen in pixel space: normalised page coordinates are not
 * square, so scaling directly in them would stretch the signature by the
 * page's own aspect ratio.
 */
export function signaturePolylines(
  sig: Signature,
  pageWidth: number,
  pageHeight: number,
): { lines: Point[][]; strokeWidth: number } {
  const boxW = sig.box.w * pageWidth;
  const boxH = sig.box.h * pageHeight;

  // Contain: as wide as possible without overflowing either edge.
  const fitW = Math.min(boxW, boxH * sig.aspect);
  const fitH = fitW / sig.aspect;
  const offsetX = sig.box.x * pageWidth + (boxW - fitW) / 2;
  const offsetY = sig.box.y * pageHeight + (boxH - fitH) / 2;

  const lines = sig.strokes.map((stroke) =>
    stroke.map((p) => ({
      x: (offsetX + p.x * fitW) / pageWidth,
      y: (offsetY + p.y * fitH) / pageHeight,
    })),
  );
  return { lines, strokeWidth: Math.max(1, sig.width * fitH) };
}

/** Normalises drawn points to their own bounding box, ready to be placed. */
export function packSignature(strokes: Point[][]): { strokes: Point[][]; aspect: number } | null {
  const all = strokes.flat();
  if (all.length < 2) return null;

  const xs = all.map((p) => p.x);
  const ys = all.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  // A single horizontal stroke has no height; keep a floor so the maths holds.
  const w = Math.max(maxX - minX, 1e-3);
  const h = Math.max(maxY - minY, 1e-3);

  return {
    aspect: w / h,
    strokes: strokes
      .filter((s) => s.length > 1)
      .map((s) => s.map((p) => ({ x: (p.x - minX) / w, y: (p.y - minY) / h }))),
  };
}

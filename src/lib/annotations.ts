import type { Annotation, Box, Point, Signature } from '../types';

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

/**
 * Bounding box of an annotation in unrotated, normalised page coordinates.
 * Used to hit-test a tap and to draw the selection outline.
 */
export function annotationBounds(a: Annotation, pageWidth: number, pageHeight: number): Box {
  if (isStroke(a)) {
    const xs = a.points.map((p) => p.x);
    const ys = a.points.map((p) => p.y);
    // Half the stroke width, converted from page-height units to each axis.
    const padX = (a.width / 2) * (pageHeight / pageWidth);
    const padY = a.width / 2;
    const x = Math.min(...xs) - padX;
    const y = Math.min(...ys) - padY;
    return { x, y, w: Math.max(...xs) + padX - x, h: Math.max(...ys) + padY - y };
  }

  if (a.kind === 'signature') return a.box;

  const lines = a.text.split('\n');
  const longest = Math.max(...lines.map((l) => l.length), 1);
  // Helvetica averages a little over half its point size per character; this
  // only has to be close enough to tap.
  const w = (longest * a.size * 0.52 * pageHeight) / pageWidth;
  const h = lines.length * a.size * 1.25;
  return { x: a.at.x, y: a.at.y, w, h };
}

/** Grows a box by a margin given in normalised page units. */
function pad(box: Box, byX: number, byY: number): Box {
  return { x: box.x - byX, y: box.y - byY, w: box.w + byX * 2, h: box.h + byY * 2 };
}

/**
 * The topmost annotation under a point, or -1. Later annotations are drawn on
 * top, so they are searched first.
 */
export function hitTest(
  annotations: Annotation[],
  point: Point,
  pageWidth: number,
  pageHeight: number,
  tolerance = 0.02,
): number {
  for (let i = annotations.length - 1; i >= 0; i--) {
    const box = pad(
      annotationBounds(annotations[i], pageWidth, pageHeight),
      (tolerance * pageHeight) / pageWidth,
      tolerance,
    );
    if (
      point.x >= box.x &&
      point.x <= box.x + box.w &&
      point.y >= box.y &&
      point.y <= box.y + box.h
    ) {
      return i;
    }
  }
  return -1;
}

/** Shifts an annotation by a delta in normalised page coordinates. */
export function moveAnnotation(a: Annotation, dx: number, dy: number): Annotation {
  if (isStroke(a)) {
    return { ...a, points: a.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) };
  }
  if (a.kind === 'signature') {
    return { ...a, box: { ...a.box, x: a.box.x + dx, y: a.box.y + dy } };
  }
  return { ...a, at: { x: a.at.x + dx, y: a.at.y + dy } };
}

/** Human name for an annotation, for the selection readout. */
export function annotationLabel(a: Annotation): string {
  switch (a.kind) {
    case 'signature':
      return 'Signature';
    case 'highlight':
      return 'Highlight';
    case 'draw':
      return 'Pen mark';
    default:
      return a.text.length > 24 ? `“${a.text.slice(0, 24)}…”` : `“${a.text}”`;
  }
}

/** Bounds a mark may not grow beyond or shrink below, in page fractions. */
const LIMITS = {
  signature: { min: 0.05, max: 1.6 },
  text: { min: 0.008, max: 0.2 },
  stroke: { min: 0.0008, max: 0.06 },
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Centre of an annotation's bounds, in unrotated page coordinates. */
function centreOf(a: Annotation, pageWidth: number, pageHeight: number): Point {
  const b = annotationBounds(a, pageWidth, pageHeight);
  return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
}

/**
 * Grows or shrinks a mark about its own centre, so it stays where it was put
 * rather than creeping away from its anchor as it is resized.
 *
 * Sizes are clamped, and a mark already at a limit comes back unchanged, which
 * is what lets the UI grey the button out.
 */
export function scaleAnnotation(
  a: Annotation,
  factor: number,
  pageWidth: number,
  pageHeight: number,
): Annotation {
  const centre = centreOf(a, pageWidth, pageHeight);

  if (a.kind === 'signature') {
    const w = clamp(a.box.w * factor, LIMITS.signature.min, LIMITS.signature.max);
    // Height follows the same ratio the width actually achieved, so clamping
    // one axis cannot distort the box the signature is fitted into.
    const applied = w / a.box.w;
    const h = a.box.h * applied;
    return {
      ...a,
      box: { x: centre.x - w / 2, y: centre.y - h / 2, w, h },
    };
  }

  if (a.kind === 'text') {
    const size = clamp(a.size * factor, LIMITS.text.min, LIMITS.text.max);
    const grown = { ...a, size };
    // Re-anchor so the centre of the text stays put as it changes size.
    const after = centreOf(grown, pageWidth, pageHeight);
    return {
      ...grown,
      at: { x: a.at.x + (centre.x - after.x), y: a.at.y + (centre.y - after.y) },
    };
  }

  const width = clamp(a.width * factor, LIMITS.stroke.min, LIMITS.stroke.max);
  const applied = width / a.width;
  return {
    ...a,
    width,
    points: a.points.map((p) => ({
      x: centre.x + (p.x - centre.x) * applied,
      y: centre.y + (p.y - centre.y) * applied,
    })),
  };
}

/** Whether scaling would actually change anything, for enabling the controls. */
export function canScale(
  a: Annotation,
  factor: number,
  pageWidth: number,
  pageHeight: number,
): boolean {
  const scaled = scaleAnnotation(a, factor, pageWidth, pageHeight);
  if (scaled.kind === 'signature' && a.kind === 'signature') {
    return Math.abs(scaled.box.w - a.box.w) > 1e-6;
  }
  if (scaled.kind === 'text' && a.kind === 'text') return Math.abs(scaled.size - a.size) > 1e-9;
  if (isStroke(scaled) && isStroke(a)) return Math.abs(scaled.width - a.width) > 1e-9;
  return false;
}

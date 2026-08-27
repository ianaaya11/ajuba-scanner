import type { Annotation, Point } from '../types';

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

import type { Point, Quad } from '../types';

/** Solves A·x = b in place by Gaussian elimination with partial pivoting. */
function solve(A: number[][], b: number[]): number[] {
  const n = b.length;
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(A[row][col]) > Math.abs(A[pivot][col])) pivot = row;
    }
    [A[col], A[pivot]] = [A[pivot], A[col]];
    [b[col], b[pivot]] = [b[pivot], b[col]];
    const d = A[col][col];
    if (Math.abs(d) < 1e-12) continue;
    for (let row = col + 1; row < n; row++) {
      const f = A[row][col] / d;
      if (!f) continue;
      for (let k = col; k < n; k++) A[row][k] -= f * A[col][k];
      b[row] -= f * b[col];
    }
  }
  const x = new Array(n).fill(0);
  for (let row = n - 1; row >= 0; row--) {
    let sum = b[row];
    for (let k = row + 1; k < n; k++) sum -= A[row][k] * x[k];
    x[row] = Math.abs(A[row][row]) < 1e-12 ? 0 : sum / A[row][row];
  }
  return x;
}

/**
 * Homography mapping four `from` points onto four `to` points, returned as the
 * nine coefficients of a 3x3 matrix (h22 fixed at 1).
 */
export function homography(from: Quad, to: Quad): number[] {
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = from[i];
    const { x: u, y: v } = to[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }
  return [...solve(A, b), 1];
}

/** Distance between two points. */
export const dist = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Output size for a de-skewed quad: the average of each pair of opposite
 * sides, so a page photographed at an angle keeps sane proportions.
 */
export function quadSize(q: Quad): { width: number; height: number } {
  const width = (dist(q[0], q[1]) + dist(q[3], q[2])) / 2;
  const height = (dist(q[0], q[3]) + dist(q[1], q[2])) / 2;
  return { width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)) };
}

/**
 * Perspective-corrects `quad` out of `src` into a flat rectangle. Works by
 * inverse mapping — for every destination pixel we look up where it came from
 * in the source and sample bilinearly, which leaves no holes.
 */
export function warpQuad(src: ImageData, quad: Quad, maxSide = 2400): ImageData {
  let { width: dw, height: dh } = quadSize(quad);
  const scale = Math.min(1, maxSide / Math.max(dw, dh));
  dw = Math.max(1, Math.round(dw * scale));
  dh = Math.max(1, Math.round(dh * scale));

  const rect: Quad = [
    { x: 0, y: 0 },
    { x: dw - 1, y: 0 },
    { x: dw - 1, y: dh - 1 },
    { x: 0, y: dh - 1 },
  ];
  const h = homography(rect, quad); // destination -> source
  const out = new ImageData(dw, dh);
  const { data: s, width: sw, height: sh } = src;

  for (let y = 0; y < dh; y++) {
    for (let x = 0; x < dw; x++) {
      const w = h[6] * x + h[7] * y + h[8];
      const sx = (h[0] * x + h[1] * y + h[2]) / w;
      const sy = (h[3] * x + h[4] * y + h[5]) / w;
      const di = (y * dw + x) * 4;
      out.data[di + 3] = 255;
      if (sx < 0 || sy < 0 || sx > sw - 1 || sy > sh - 1) continue;

      const x0 = Math.floor(sx), y0 = Math.floor(sy);
      const x1 = Math.min(sw - 1, x0 + 1), y1 = Math.min(sh - 1, y0 + 1);
      const fx = sx - x0, fy = sy - y0;
      const i00 = (y0 * sw + x0) * 4, i10 = (y0 * sw + x1) * 4;
      const i01 = (y1 * sw + x0) * 4, i11 = (y1 * sw + x1) * 4;
      for (let c = 0; c < 3; c++) {
        const top = s[i00 + c] * (1 - fx) + s[i10 + c] * fx;
        const bottom = s[i01 + c] * (1 - fx) + s[i11 + c] * fx;
        out.data[di + c] = top * (1 - fy) + bottom * fy;
      }
    }
  }
  return out;
}

/** Reorders four arbitrary corners into top-left, top-right, bottom-right, bottom-left. */
export function orderCorners(points: Point[]): Quad {
  const cx = points.reduce((s, p) => s + p.x, 0) / points.length;
  const cy = points.reduce((s, p) => s + p.y, 0) / points.length;
  const sorted = [...points].sort(
    (a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx),
  );
  // After the angular sort the ring starts somewhere arbitrary; rotate it so
  // the top-left-most corner leads.
  let start = 0;
  let best = Infinity;
  sorted.forEach((p, i) => {
    const d = p.x + p.y;
    if (d < best) {
      best = d;
      start = i;
    }
  });
  return [0, 1, 2, 3].map((i) => sorted[(start + i) % 4]) as Quad;
}

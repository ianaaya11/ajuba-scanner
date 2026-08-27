import type { Point, Quad } from '../types';
import { boxBlur, percentile, sobel, toGray } from './imaging';
import { orderCorners } from './warp';

interface Line {
  /** Distance from origin and angle of the normal, i.e. x·cosθ + y·sinθ = ρ. */
  rho: number;
  theta: number;
  votes: number;
}

const THETA_STEPS = 180;

/**
 * Hough line transform over a thresholded edge map. Returns the strongest
 * lines after non-maximum suppression in (ρ, θ) space.
 */
function houghLines(edges: Float32Array, w: number, h: number, threshold: number): Line[] {
  const diagonal = Math.ceil(Math.hypot(w, h));
  const rhoOffset = diagonal;
  const rhoBins = diagonal * 2 + 1;
  const acc = new Uint32Array(THETA_STEPS * rhoBins);
  const cos = new Float32Array(THETA_STEPS);
  const sin = new Float32Array(THETA_STEPS);
  for (let t = 0; t < THETA_STEPS; t++) {
    const a = (t * Math.PI) / THETA_STEPS;
    cos[t] = Math.cos(a);
    sin[t] = Math.sin(a);
  }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (edges[y * w + x] < threshold) continue;
      for (let t = 0; t < THETA_STEPS; t++) {
        const rho = Math.round(x * cos[t] + y * sin[t]) + rhoOffset;
        acc[t * rhoBins + rho]++;
      }
    }
  }

  // Keep only local maxima so one strong edge does not produce a cluster.
  const minVotes = Math.max(24, Math.round(Math.min(w, h) * 0.25));
  const found: Line[] = [];
  for (let t = 0; t < THETA_STEPS; t++) {
    for (let r = 1; r < rhoBins - 1; r++) {
      const v = acc[t * rhoBins + r];
      if (v < minVotes) continue;
      let isPeak = true;
      for (let dt = -2; dt <= 2 && isPeak; dt++) {
        const tt = (t + dt + THETA_STEPS) % THETA_STEPS;
        for (let dr = -6; dr <= 6; dr++) {
          const rr = r + dr;
          if (rr < 0 || rr >= rhoBins || (dt === 0 && dr === 0)) continue;
          if (acc[tt * rhoBins + rr] > v) {
            isPeak = false;
            break;
          }
        }
      }
      if (isPeak) found.push({ rho: r - rhoOffset, theta: (t * Math.PI) / THETA_STEPS, votes: v });
    }
  }
  return found.sort((a, b) => b.votes - a.votes).slice(0, 40);
}

function intersect(a: Line, b: Line): Point | null {
  const det = Math.cos(a.theta) * Math.sin(b.theta) - Math.sin(a.theta) * Math.cos(b.theta);
  if (Math.abs(det) < 1e-6) return null; // parallel
  return {
    x: (a.rho * Math.sin(b.theta) - b.rho * Math.sin(a.theta)) / det,
    y: (b.rho * Math.cos(a.theta) - a.rho * Math.cos(b.theta)) / det,
  };
}

/** Shoelace area of a quad, always positive. */
function area(q: Quad): number {
  let sum = 0;
  for (let i = 0; i < 4; i++) {
    const p = q[i];
    const n = q[(i + 1) % 4];
    sum += p.x * n.y - n.x * p.y;
  }
  return Math.abs(sum) / 2;
}

/** Rejects self-intersecting or wildly skewed quads before we trust them. */
function isPlausible(q: Quad, w: number, h: number): boolean {
  if (q.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return false;
  // Allow a little overshoot past the frame, but not a runaway intersection.
  if (q.some((p) => p.x < -w * 0.15 || p.x > w * 1.15 || p.y < -h * 0.15 || p.y > h * 1.15)) return false;
  if (area(q) < w * h * 0.15) return false;

  // Every interior corner must be reasonably square-ish (60°–120°).
  for (let i = 0; i < 4; i++) {
    const prev = q[(i + 3) % 4];
    const cur = q[i];
    const next = q[(i + 1) % 4];
    const v1 = { x: prev.x - cur.x, y: prev.y - cur.y };
    const v2 = { x: next.x - cur.x, y: next.y - cur.y };
    const cosAngle =
      (v1.x * v2.x + v1.y * v2.y) / (Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y) || 1);
    if (Math.abs(cosAngle) > 0.5) return false;
  }
  return true;
}

/** A quad inset from the frame edges, used when detection finds nothing. */
export function defaultQuad(w: number, h: number): Quad {
  const mx = w * 0.06;
  const my = h * 0.06;
  return [
    { x: mx, y: my },
    { x: w - mx, y: my },
    { x: w - mx, y: h - my },
    { x: mx, y: h - my },
  ];
}

/**
 * Finds the page boundary in a photo. Works on a downscaled copy for speed,
 * then scales the corners back up to full-resolution coordinates. Falls back
 * to an inset rectangle when nothing convincing is found — the user can always
 * drag the corners.
 */
export function detectDocumentQuad(src: ImageData): { quad: Quad; auto: boolean } {
  const { width: fullW, height: fullH } = src;
  const scale = Math.min(1, 480 / Math.max(fullW, fullH));
  const w = Math.max(2, Math.round(fullW * scale));
  const h = Math.max(2, Math.round(fullH * scale));

  // Downsample by area-averaging through a canvas, then find edges.
  const canvas = document.createElement('canvas');
  canvas.width = fullW;
  canvas.height = fullH;
  const ctx = canvas.getContext('2d')!;
  ctx.putImageData(src, 0, 0);
  const small = document.createElement('canvas');
  small.width = w;
  small.height = h;
  const sctx = small.getContext('2d')!;
  sctx.drawImage(canvas, 0, 0, w, h);

  const gray = boxBlur(toGray(sctx.getImageData(0, 0, w, h)), w, h, 1);
  const edges = sobel(gray, w, h);
  const threshold = percentile(edges, 0.92);
  const lines = houghLines(edges, w, h, threshold);

  // Split by orientation: θ near 0 or π is a vertical line, θ near π/2 horizontal.
  const vertical = lines.filter((l) => {
    const t = l.theta;
    return t < Math.PI / 4 || t > (3 * Math.PI) / 4;
  });
  const horizontal = lines.filter((l) => {
    const t = l.theta;
    return t >= Math.PI / 4 && t <= (3 * Math.PI) / 4;
  });

  let best: { quad: Quad; score: number } | null = null;
  const cap = 8; // only the strongest few of each orientation
  for (let i = 0; i < Math.min(cap, vertical.length); i++) {
    for (let j = i + 1; j < Math.min(cap, vertical.length); j++) {
      for (let k = 0; k < Math.min(cap, horizontal.length); k++) {
        for (let l = k + 1; l < Math.min(cap, horizontal.length); l++) {
          const corners = [
            intersect(vertical[i], horizontal[k]),
            intersect(vertical[j], horizontal[k]),
            intersect(vertical[j], horizontal[l]),
            intersect(vertical[i], horizontal[l]),
          ];
          if (corners.some((c) => c === null)) continue;
          const quad = orderCorners(corners as Point[]);
          if (!isPlausible(quad, w, h)) continue;
          // Prefer big quads made of well-supported lines.
          const votes =
            vertical[i].votes + vertical[j].votes + horizontal[k].votes + horizontal[l].votes;
          const score = area(quad) / (w * h) + votes / (4 * Math.max(w, h));
          if (!best || score > best.score) best = { quad, score };
        }
      }
    }
  }

  if (!best) return { quad: defaultQuad(fullW, fullH), auto: false };
  const up = best.quad.map((p) => ({
    x: Math.max(0, Math.min(fullW, p.x / scale)),
    y: Math.max(0, Math.min(fullH, p.y / scale)),
  })) as Quad;
  return { quad: up, auto: true };
}

import { describe, expect, it } from 'vitest';
import type { Quad } from '../types';
import { dist, homography, orderCorners, quadSize, warpQuad } from '../lib/warp';

const apply = (h: number[], p: { x: number; y: number }) => {
  const w = h[6] * p.x + h[7] * p.y + h[8];
  return { x: (h[0] * p.x + h[1] * p.y + h[2]) / w, y: (h[3] * p.x + h[4] * p.y + h[5]) / w };
};

describe('homography', () => {
  it('maps a square onto itself as the identity', () => {
    const square: Quad = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    const h = homography(square, square);
    for (const p of square) {
      const q = apply(h, p);
      expect(q.x).toBeCloseTo(p.x, 9);
      expect(q.y).toBeCloseTo(p.y, 9);
    }
  });

  it('lands the four corners exactly on their targets', () => {
    const rect: Quad = [
      { x: 0, y: 0 },
      { x: 399, y: 0 },
      { x: 399, y: 599 },
      { x: 0, y: 599 },
    ];
    const skewed: Quad = [
      { x: 32, y: 20 },
      { x: 410, y: 60 },
      { x: 380, y: 520 },
      { x: 12, y: 470 },
    ];
    const h = homography(rect, skewed);
    rect.forEach((p, i) => {
      const q = apply(h, p);
      expect(dist(q, skewed[i])).toBeLessThan(1e-6);
    });
  });
});

describe('quadSize', () => {
  it('averages opposite sides', () => {
    expect(
      quadSize([
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 50 },
        { x: 0, y: 50 },
      ]),
    ).toEqual({ width: 100, height: 50 });
  });
});

describe('orderCorners', () => {
  it('normalises any input order to TL, TR, BR, BL', () => {
    expect(
      orderCorners([
        { x: 0, y: 100 },
        { x: 100, y: 0 },
        { x: 0, y: 0 },
        { x: 100, y: 100 },
      ]),
    ).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ]);
  });
});

describe('warpQuad', () => {
  it('straightens a skewed crop back into a rectangle', () => {
    // A 40x40 image: white paper with a black square in its top-left quadrant.
    const size = 40;
    const src = new ImageData(size, size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        const dark = x < 20 && y < 20;
        src.data[i] = src.data[i + 1] = src.data[i + 2] = dark ? 0 : 255;
        src.data[i + 3] = 255;
      }
    }

    // Pull the whole frame through unchanged: output should match the input.
    const full: Quad = [
      { x: 0, y: 0 },
      { x: size - 1, y: 0 },
      { x: size - 1, y: size - 1 },
      { x: 0, y: size - 1 },
    ];
    const out = warpQuad(src, full);
    // Corners sit on pixel centres, so the span is size - 1.
    expect(out.width).toBe(size - 1);
    expect(out.height).toBe(size - 1);

    const at = (x: number, y: number) => out.data[(y * out.width + x) * 4];
    expect(at(5, 5)).toBeLessThan(30); // still dark in the top-left
    expect(at(35, 35)).toBeGreaterThan(220); // still white bottom-right
    expect(at(35, 5)).toBeGreaterThan(220);
  });

  it('normalises to a known aspect ratio when one is given', () => {
    const src = new ImageData(200, 200);
    src.data.fill(255);
    // A square quad, but the subject is known to be a bank card.
    const square: Quad = [
      { x: 0, y: 0 },
      { x: 199, y: 0 },
      { x: 199, y: 199 },
      { x: 0, y: 199 },
    ];
    const card = 85.6 / 54;
    const out = warpQuad(src, square, { aspect: card });
    expect(out.width / out.height).toBeCloseTo(card, 2);
  });

  it('caps the output at maxSide while keeping the aspect ratio', () => {
    const src = new ImageData(200, 100);
    src.data.fill(255);
    const quad: Quad = [
      { x: 0, y: 0 },
      { x: 199, y: 0 },
      { x: 199, y: 99 },
      { x: 0, y: 99 },
    ];
    const out = warpQuad(src, quad, { maxSide: 50 });
    expect(Math.max(out.width, out.height)).toBeLessThanOrEqual(50);
    expect(out.width / out.height).toBeCloseTo(2, 1);
  });
});

import { describe, expect, it } from 'vitest';
import { adaptiveThreshold, boxBlur, percentile, removeShadows, sobel, toGray } from '../lib/imaging';

/** Builds an ImageData filled by a per-pixel callback. */
function make(w: number, h: number, fn: (x: number, y: number) => [number, number, number]) {
  const img = new ImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const [r, g, b] = fn(x, y);
      img.data[i] = r;
      img.data[i + 1] = g;
      img.data[i + 2] = b;
      img.data[i + 3] = 255;
    }
  }
  return img;
}

describe('toGray', () => {
  it('uses Rec. 601 luma weights', () => {
    const gray = toGray(make(1, 1, () => [255, 0, 0]));
    expect(gray[0]).toBeCloseTo(76.245, 2);
  });

  it('leaves neutral grey untouched', () => {
    const gray = toGray(make(1, 1, () => [128, 128, 128]));
    expect(gray[0]).toBeCloseTo(128, 5);
  });
});

describe('boxBlur', () => {
  it('preserves a flat field exactly', () => {
    const flat = new Float32Array(64).fill(200);
    const blurred = boxBlur(flat, 8, 8, 2);
    expect(Math.max(...blurred)).toBeCloseTo(200, 4);
    expect(Math.min(...blurred)).toBeCloseTo(200, 4);
  });

  it('averages a single bright pixel over its window', () => {
    const spike = new Float32Array(81);
    spike[40] = 81 * 10; // centre of a 9x9 field
    const blurred = boxBlur(spike, 9, 9, 1);
    // The centre 3x3 window holds the whole spike, so its mean is total/9.
    expect(blurred[40]).toBeCloseTo(90, 4);
    expect(blurred[0]).toBe(0);
  });
});

describe('percentile', () => {
  it('finds the midpoint of a uniform ramp', () => {
    const ramp = new Float32Array(256);
    for (let i = 0; i < 256; i++) ramp[i] = i;
    expect(percentile(ramp, 0.5, 255)).toBeGreaterThan(120);
    expect(percentile(ramp, 0.5, 255)).toBeLessThan(136);
  });
});

describe('sobel', () => {
  it('responds at a vertical edge and stays quiet on flat areas', () => {
    const w = 9;
    const h = 9;
    const field = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) field[y * w + x] = x < 4 ? 0 : 255;
    }
    const edges = sobel(field, w, h);
    const atEdge = edges[4 * w + 4];
    const atFlat = edges[4 * w + 1];
    expect(atEdge).toBeGreaterThan(500);
    expect(atFlat).toBe(0);
  });
});

describe('removeShadows', () => {
  it('flattens a lighting gradient across otherwise uniform paper', () => {
    const w = 48;
    const h = 48;
    // Paper reflectance is constant; illumination falls off left to right.
    const lit = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) lit[y * w + x] = 240 - (x / w) * 140;
    }
    const before = Math.max(...lit) - Math.min(...lit);
    const after = removeShadows(lit, w, h);
    const spread = Math.max(...after) - Math.min(...after);
    expect(before).toBeGreaterThan(130);
    expect(spread).toBeLessThan(before / 4);
  });
});

describe('adaptiveThreshold', () => {
  it('keeps dark marks black and lit paper white despite a gradient', () => {
    const w = 60;
    const h = 60;
    const field = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const illumination = 250 - (x / w) * 120;
        // A dark bar of "ink" down the middle of the page.
        const ink = x > 26 && x < 34 ? 0.25 : 1;
        field[y * w + x] = illumination * ink;
      }
    }
    const binary = adaptiveThreshold(field, w, h);
    const inkPixel = binary[30 * w + 30];
    const paperLeft = binary[30 * w + 5];
    const paperRight = binary[30 * w + 55];
    expect(inkPixel).toBe(0);
    expect(paperLeft).toBe(255);
    // The right side is much dimmer, but a global threshold would fail here.
    expect(paperRight).toBe(255);
  });
});

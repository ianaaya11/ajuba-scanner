import { describe, expect, it } from 'vitest';
import type { Annotation, Signature } from '../types';
import { annotationBounds, canScale, scaleAnnotation } from '../lib/annotations';

const PW = 850;
const PH = 1100;

const sig = (): Signature => ({
  kind: 'signature', color: '#000', aspect: 3, width: 0.05,
  box: { x: 0.2, y: 0.7, w: 0.3, h: 0.1 },
  strokes: [[{ x: 0, y: 0 }, { x: 1, y: 1 }]],
});
const note = (size = 0.03): Annotation => ({
  kind: 'text', color: '#000', size, at: { x: 0.4, y: 0.5 }, text: 'Signed today',
});
const pen = (): Annotation => ({
  kind: 'draw', color: '#000', width: 0.004,
  points: [{ x: 0.2, y: 0.2 }, { x: 0.4, y: 0.3 }],
});

const centre = (a: Annotation) => {
  const b = annotationBounds(a, PW, PH);
  return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
};

describe('scaling a signature', () => {
  it('grows and shrinks the box', () => {
    const bigger = scaleAnnotation(sig(), 1.2, PW, PH) as Signature;
    expect(bigger.box.w).toBeCloseTo(0.36, 6);
    const smaller = scaleAnnotation(sig(), 0.5, PW, PH) as Signature;
    expect(smaller.box.w).toBeCloseTo(0.15, 6);
  });

  it('keeps the centre in place, so it does not creep while resizing', () => {
    const before = centre(sig());
    for (const f of [0.4, 0.8, 1.5, 3]) {
      const after = centre(scaleAnnotation(sig(), f, PW, PH));
      expect(after.x).toBeCloseTo(before.x, 6);
      expect(after.y).toBeCloseTo(before.y, 6);
    }
  });

  it('keeps the box proportions, so the signature is never distorted', () => {
    const original = sig();
    const ratio = original.box.w / original.box.h;
    for (const f of [0.3, 2, 20]) {
      const s = scaleAnnotation(original, f, PW, PH) as Signature;
      expect(s.box.w / s.box.h).toBeCloseTo(ratio, 6);
    }
  });

  it('clamps rather than letting it vanish or take over the page', () => {
    const tiny = scaleAnnotation(sig(), 0.001, PW, PH) as Signature;
    expect(tiny.box.w).toBeCloseTo(0.05, 6);
    const huge = scaleAnnotation(sig(), 100, PW, PH) as Signature;
    expect(huge.box.w).toBeCloseTo(1.6, 6);
  });
});

describe('scaling text', () => {
  it('changes the size', () => {
    const bigger = scaleAnnotation(note(), 1.5, PW, PH);
    expect(bigger.kind === 'text' && bigger.size).toBeCloseTo(0.045, 9);
  });

  it('keeps the centre in place rather than growing from its anchor', () => {
    const before = centre(note());
    const after = centre(scaleAnnotation(note(), 2, PW, PH));
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
  });

  it('clamps at both ends', () => {
    const tiny = scaleAnnotation(note(), 0.001, PW, PH);
    expect(tiny.kind === 'text' && tiny.size).toBeCloseTo(0.008, 9);
    const huge = scaleAnnotation(note(), 500, PW, PH);
    expect(huge.kind === 'text' && huge.size).toBeCloseTo(0.2, 9);
  });
});

describe('scaling a pen stroke', () => {
  it('scales the geometry and the thickness together', () => {
    const scaled = scaleAnnotation(pen(), 2, PW, PH);
    if (!('points' in scaled)) throw new Error('expected a stroke');
    expect(scaled.width).toBeCloseTo(0.008, 9);
    // The stroke spans twice the distance it used to.
    const span = Math.hypot(
      scaled.points[1].x - scaled.points[0].x,
      scaled.points[1].y - scaled.points[0].y,
    );
    expect(span).toBeCloseTo(2 * Math.hypot(0.2, 0.1), 6);
  });
});

describe('canScale', () => {
  it('is false once a mark is pinned at a limit', () => {
    const huge = scaleAnnotation(sig(), 100, PW, PH);
    expect(canScale(huge, 1.2, PW, PH)).toBe(false);
    expect(canScale(huge, 0.8, PW, PH)).toBe(true);

    const tiny = scaleAnnotation(note(), 0.001, PW, PH);
    expect(canScale(tiny, 0.8, PW, PH)).toBe(false);
    expect(canScale(tiny, 1.2, PW, PH)).toBe(true);
  });

  it('is true for an ordinary mark in either direction', () => {
    expect(canScale(sig(), 1.2, PW, PH)).toBe(true);
    expect(canScale(sig(), 0.8, PW, PH)).toBe(true);
  });
});

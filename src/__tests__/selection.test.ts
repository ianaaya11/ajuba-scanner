import { describe, expect, it } from 'vitest';
import type { Annotation } from '../types';
import { annotationBounds, annotationLabel, hitTest, moveAnnotation } from '../lib/annotations';

const PW = 850;
const PH = 1100;

const signature = (box = { x: 0.1, y: 0.7, w: 0.3, h: 0.1 }): Annotation => ({
  kind: 'signature', color: '#000', box, aspect: 3, width: 0.05,
  strokes: [[{ x: 0, y: 0 }, { x: 1, y: 1 }]],
});
const pen = (): Annotation => ({
  kind: 'draw', color: '#000', width: 0.004,
  points: [{ x: 0.2, y: 0.2 }, { x: 0.4, y: 0.3 }],
});
const note = (text = 'Hello'): Annotation => ({
  kind: 'text', color: '#000', size: 0.03, at: { x: 0.5, y: 0.5 }, text,
});

describe('annotationBounds', () => {
  it('returns the signature box unchanged', () => {
    const box = { x: 0.2, y: 0.6, w: 0.4, h: 0.12 };
    expect(annotationBounds(signature(box), PW, PH)).toEqual(box);
  });

  it('wraps a stroke including its thickness', () => {
    const b = annotationBounds(pen(), PW, PH);
    expect(b.x).toBeLessThan(0.2);
    expect(b.y).toBeLessThan(0.2);
    expect(b.x + b.w).toBeGreaterThan(0.4);
    expect(b.y + b.h).toBeGreaterThan(0.3);
  });

  it('grows a text box with the length of the longest line', () => {
    const short = annotationBounds(note('Hi'), PW, PH);
    const long = annotationBounds(note('A considerably longer line'), PW, PH);
    expect(long.w).toBeGreaterThan(short.w);
    // Two lines are taller than one.
    expect(annotationBounds(note('a\nb'), PW, PH).h).toBeGreaterThan(short.h);
  });
});

describe('hitTest', () => {
  it('finds a signature tapped in the middle', () => {
    expect(hitTest([signature()], { x: 0.25, y: 0.75 }, PW, PH)).toBe(0);
  });

  it('misses a tap well outside everything', () => {
    expect(hitTest([signature()], { x: 0.9, y: 0.1 }, PW, PH)).toBe(-1);
  });

  it('returns the topmost when marks overlap', () => {
    const a = signature({ x: 0.1, y: 0.1, w: 0.5, h: 0.5 });
    const b = signature({ x: 0.2, y: 0.2, w: 0.2, h: 0.2 });
    // b is drawn last, so it is on top and should win.
    expect(hitTest([a, b], { x: 0.3, y: 0.3 }, PW, PH)).toBe(1);
  });

  it('is forgiving enough to tap a thin pen stroke', () => {
    // A hairline stroke is only a few pixels wide; without tolerance it would
    // be almost impossible to select on a phone.
    expect(hitTest([pen()], { x: 0.3, y: 0.25 }, PW, PH)).toBe(0);
  });
});

describe('moveAnnotation', () => {
  it('shifts a signature box', () => {
    const moved = moveAnnotation(signature(), 0.1, -0.05);
    expect(moved.kind === 'signature' && moved.box.x).toBeCloseTo(0.2, 6);
    expect(moved.kind === 'signature' && moved.box.y).toBeCloseTo(0.65, 6);
  });

  it('shifts every point of a stroke', () => {
    const moved = moveAnnotation(pen(), 0.05, 0.05);
    if (moved.kind !== 'draw') throw new Error('expected a stroke');
    expect(moved.points[0].x).toBeCloseTo(0.25, 9);
    expect(moved.points[0].y).toBeCloseTo(0.25, 9);
    expect(moved.points[1].x).toBeCloseTo(0.45, 9);
    expect(moved.points[1].y).toBeCloseTo(0.35, 9);
  });

  it('shifts a text anchor', () => {
    const moved = moveAnnotation(note(), -0.1, 0.1);
    expect(moved.kind === 'text' && moved.at).toEqual({ x: 0.4, y: 0.6 });
  });

  it('leaves the rest of the annotation untouched', () => {
    const before = signature();
    const after = moveAnnotation(before, 0.1, 0.1);
    expect(after.kind === 'signature' && after.aspect).toBe(3);
    expect(after.kind === 'signature' && after.strokes).toEqual(
      before.kind === 'signature' ? before.strokes : null,
    );
  });
});

describe('annotationLabel', () => {
  it('names each kind for the selection readout', () => {
    expect(annotationLabel(signature())).toBe('Signature');
    expect(annotationLabel(pen())).toBe('Pen mark');
    expect(annotationLabel(note('Signed today'))).toBe('“Signed today”');
  });

  it('truncates a long note', () => {
    expect(annotationLabel(note('x'.repeat(60)))).toMatch(/…”$/);
  });
});

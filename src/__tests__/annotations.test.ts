import { describe, expect, it } from 'vitest';
import { displaySize, isStroke, rotatePoint, unrotatePoint } from '../lib/annotations';

describe('rotatePoint', () => {
  it('sends the top-left corner clockwise around the page', () => {
    const topLeft = { x: 0, y: 0 };
    expect(rotatePoint(topLeft, 90)).toEqual({ x: 1, y: 0 }); // -> top-right
    expect(rotatePoint(topLeft, 180)).toEqual({ x: 1, y: 1 }); // -> bottom-right
    expect(rotatePoint(topLeft, 270)).toEqual({ x: 0, y: 1 }); // -> bottom-left
  });

  it('leaves the centre alone at every angle', () => {
    for (const angle of [0, 90, 180, 270]) {
      expect(rotatePoint({ x: 0.5, y: 0.5 }, angle)).toEqual({ x: 0.5, y: 0.5 });
    }
  });
});

describe('unrotatePoint', () => {
  it('round-trips with rotatePoint at every angle', () => {
    const p = { x: 0.23, y: 0.71 };
    for (const angle of [0, 90, 180, 270]) {
      const there = rotatePoint(p, angle);
      const back = unrotatePoint(there, angle);
      expect(back.x).toBeCloseTo(p.x, 9);
      expect(back.y).toBeCloseTo(p.y, 9);
    }
  });
});

describe('displaySize', () => {
  it('swaps the axes on a quarter turn only', () => {
    expect(displaySize(800, 600, 0)).toEqual({ width: 800, height: 600 });
    expect(displaySize(800, 600, 90)).toEqual({ width: 600, height: 800 });
    expect(displaySize(800, 600, 180)).toEqual({ width: 800, height: 600 });
    expect(displaySize(800, 600, 270)).toEqual({ width: 600, height: 800 });
  });
});

describe('isStroke', () => {
  it('separates strokes from text notes', () => {
    expect(isStroke({ kind: 'draw', color: '#000', width: 1, points: [] })).toBe(true);
    expect(isStroke({ kind: 'highlight', color: '#000', width: 1, points: [] })).toBe(true);
    expect(isStroke({ kind: 'text', color: '#000', size: 1, at: { x: 0, y: 0 }, text: 'hi' })).toBe(
      false,
    );
  });
});

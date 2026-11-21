import { describe, expect, it } from 'vitest';
import { FistDetector, assignRoles, extractFeatures, normaliseOpenness, rawOpenness } from './hands';
import type { HandFeatures, Point } from './hands';

/** A flat synthetic hand: wrist at the origin, knuckles one palm length up, fingers along y. */
function hand(fingerLength: number, offset: Point = { x: 0, y: 0 }): Point[] {
  const points: Point[] = Array.from({ length: 21 }, () => ({ x: offset.x, y: offset.y, z: 0 }));
  const knuckles = [5, 9, 13, 17];
  const tips = [8, 12, 16, 20];
  knuckles.forEach((k, i) => {
    const x = offset.x + (i - 1.5) * 0.2;
    points[k] = { x, y: offset.y + 1, z: 0 };
    const tip = tips[i];
    if (tip !== undefined) points[tip] = { x, y: offset.y + 1 + fingerLength, z: 0 };
  });
  return points;
}

describe('openness', () => {
  it('is larger for an open hand than for a fist', () => {
    const open = rawOpenness(hand(0.9));
    const fist = rawOpenness(hand(-0.3));
    expect(open).not.toBeNull();
    expect(fist).not.toBeNull();
    expect(open ?? 0).toBeGreaterThan(fist ?? 0);
  });

  it('does not depend on hand size', () => {
    const small = hand(0.9).map((p) => ({ x: p.x * 0.1, y: p.y * 0.1, z: 0 }));
    expect(rawOpenness(small)).toBeCloseTo(rawOpenness(hand(0.9)) ?? -1);
  });

  it('normalises into 0..1', () => {
    expect(normaliseOpenness(0)).toBe(0);
    expect(normaliseOpenness(5)).toBe(1);
  });

  it('returns null for incomplete landmarks', () => {
    expect(rawOpenness([{ x: 0, y: 0 }])).toBeNull();
  });
});

describe('extractFeatures', () => {
  it('mirrors x so the screen matches the player', () => {
    const f = extractFeatures(hand(0.9, { x: 0.2, y: 0 }), undefined);
    expect(f?.x).toBeCloseTo(0.8);
  });
});

describe('assignRoles', () => {
  const at = (x: number): HandFeatures => ({ x, y: 0.5, openness: 1 });

  it('lets a single hand play alone', () => {
    const one = at(0.2);
    expect(assignRoles([one])).toEqual({ pitch: one, volume: null });
  });

  it('gives pitch to the hand on the right of the screen', () => {
    const left = at(0.2);
    const right = at(0.7);
    expect(assignRoles([left, right])).toEqual({ pitch: right, volume: left });
    expect(assignRoles([right, left])).toEqual({ pitch: right, volume: left });
  });

  it('handles no hands', () => {
    expect(assignRoles([])).toEqual({ pitch: null, volume: null });
  });
});

describe('FistDetector', () => {
  it('needs a clearly open hand to release', () => {
    const d = new FistDetector(0.12, 0.3);
    expect(d.update(0.5)).toBe(false);
    expect(d.update(0.05)).toBe(true);
    expect(d.update(0.2)).toBe(true); // between thresholds, stays closed
    expect(d.update(0.4)).toBe(false);
  });
});

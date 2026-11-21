import { describe, expect, it } from 'vitest';
import { PinchDetector, pinchDistances } from './pinch';
import type { Point } from './hands';

describe('pinchDistances', () => {
  it('measures in palm lengths', () => {
    const points: Point[] = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
    points[9] = { x: 0, y: 2, z: 0 }; // palm length 2
    points[4] = { x: 1, y: 0, z: 0 };
    points[8] = { x: 1, y: 1, z: 0 }; // 1 away from the thumb
    const d = pinchDistances(points);
    expect(d?.[0]).toBeCloseTo(0.5);
    expect(d).toHaveLength(4);
  });

  it('returns null for incomplete landmarks', () => {
    expect(pinchDistances([])).toBeNull();
  });
});

describe('PinchDetector', () => {
  it('fires once per pinch', () => {
    const d = new PinchDetector(0.28, 0.42);
    expect(d.update([0.8, 0.9, 1, 1])).toBeNull();
    expect(d.update([0.2, 0.9, 1, 1])).toBe(0);
    expect(d.update([0.1, 0.9, 1, 1])).toBeNull(); // still held
    expect(d.update([0.35, 0.9, 1, 1])).toBeNull(); // not released yet
    expect(d.update([0.6, 0.9, 1, 1])).toBeNull(); // released
    expect(d.update([0.2, 0.9, 1, 1])).toBe(0);
  });

  it('picks the closest finger and ignores the others while held', () => {
    const d = new PinchDetector(0.28, 0.42);
    expect(d.update([0.2, 0.25, 1, 1])).toBe(0);
    expect(d.update([0.2, 0.1, 1, 1])).toBeNull();
    expect(d.finger).toBe(0);
  });
});

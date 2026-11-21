import { describe, expect, it } from 'vitest';
import { extractFeatures } from './hands';
import { pinchDistances } from './pinch';
import { syntheticHand } from './synthetic';

describe('syntheticHand', () => {
  it('puts the palm centre where it is asked to', () => {
    const f = extractFeatures(syntheticHand({ x: 0.3, y: 0.6, size: 0.13 }), undefined);
    expect(f?.x).toBeCloseTo(0.7); // mirrored for the screen
    expect(f?.y).toBeCloseTo(0.6);
  });

  it('reads as open when flat and closed when curled', () => {
    const open = extractFeatures(syntheticHand({ x: 0.5, y: 0.5, size: 0.13 }), undefined);
    const fist = extractFeatures(syntheticHand({ x: 0.5, y: 0.5, size: 0.13, curl: 1 }), undefined);
    expect(open?.openness).toBeGreaterThan(0.8);
    expect(fist?.openness).toBeLessThan(0.12);
  });

  it('registers a pinch only when asked', () => {
    const base = { x: 0.5, y: 0.5, size: 0.13, aspect: 1 };
    expect(pinchDistances(syntheticHand(base))?.[0]).toBeGreaterThan(0.42);
    expect(pinchDistances(syntheticHand({ ...base, pinch: true }))?.[0]).toBeLessThan(0.28);
  });
});

import { describe, expect, it } from 'vitest';
import { OneEuro } from './oneEuro';

const FPS = 30;
const make = (): OneEuro => new OneEuro({ minCutoff: 1.2, beta: 8, dCutoff: 1 });

describe('OneEuro', () => {
  it('passes the first sample through', () => {
    expect(make().filter(0.42, 0)).toBe(0.42);
  });

  it('holds a constant signal', () => {
    const f = make();
    let out = 0;
    for (let i = 0; i < 30; i++) out = f.filter(0.5, i / FPS);
    expect(out).toBeCloseTo(0.5, 10);
  });

  it('cuts jitter at rest by more than half', () => {
    const f = make();
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < 120; i++) {
      const out = f.filter(0.5 + (i % 2 === 0 ? 0.005 : -0.005), i / FPS);
      if (i >= 30) {
        min = Math.min(min, out);
        max = Math.max(max, out);
      }
    }
    expect(max - min).toBeLessThan(0.005);
  });

  it('follows a fast move within three frames', () => {
    const f = make();
    f.filter(0.2, 0);
    let out = 0;
    for (let i = 1; i <= 3; i++) out = f.filter(0.8, i / FPS);
    expect(out).toBeGreaterThan(0.77); // 95% of the way
  });

  it('ignores samples that do not advance time', () => {
    const f = make();
    f.filter(0.2, 1);
    expect(f.filter(0.9, 1)).toBe(0.2);
  });

  it('starts over after reset', () => {
    const f = make();
    f.filter(0.2, 0);
    f.reset();
    expect(f.filter(0.9, 1)).toBe(0.9);
  });
});

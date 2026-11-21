import { describe, expect, it } from 'vitest';
import { pluck } from './karplus';

// Deterministic noise so the test does not depend on Math.random.
function lcg(seed = 1): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

const RATE = 48000;
const energy = (x: Float32Array, from: number, to: number): number => {
  let e = 0;
  for (let i = from; i < to; i++) e += (x[i] ?? 0) ** 2;
  return e;
};

describe('pluck', () => {
  const note = pluck(RATE, 440, 1, { brightness: 0.6, sustain: 0.996 }, lcg());

  it('is normalised and finite', () => {
    expect(note).toHaveLength(RATE);
    let peak = 0;
    for (const v of note) {
      expect(Number.isFinite(v)).toBe(true);
      peak = Math.max(peak, Math.abs(v));
    }
    expect(peak).toBeLessThanOrEqual(1);
    expect(peak).toBeGreaterThan(0.9);
  });

  it('decays', () => {
    expect(energy(note, RATE * 0.8, RATE)).toBeLessThan(energy(note, 0, RATE * 0.2) * 0.2);
  });

  it('ends at silence', () => {
    expect(Math.abs(note[note.length - 1] ?? 1)).toBeLessThan(0.001);
  });

  it('is periodic at the requested pitch', () => {
    // Autocorrelation should peak at one period (about 109 samples for 440 Hz).
    const period = RATE / 440;
    const corr = (lag: number): number => {
      let c = 0;
      for (let i = 2000; i < 8000; i++) c += (note[i] ?? 0) * (note[i + lag] ?? 0);
      return c;
    };
    let best = 0;
    let bestLag = 0;
    for (let lag = 60; lag < 200; lag++) {
      const c = corr(lag);
      if (c > best) {
        best = c;
        bestLag = lag;
      }
    }
    expect(Math.abs(bestLag - period)).toBeLessThanOrEqual(1);
  });
});

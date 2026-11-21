import { describe, expect, it } from 'vitest';
import { SCALES } from '../../input/scales';
import { glassPadParams } from './glassPad';
import { PRESETS } from './index';
import { thereminParams } from './theremin';

const STEPS = [-1, 0, 0.25, 0.5, 0.75, 1, 2]; // includes out of range input on purpose

describe('preset definitions', () => {
  it('have unique ids and a known scale', () => {
    expect(new Set(PRESETS.map((p) => p.id)).size).toBe(PRESETS.length);
    for (const p of PRESETS) expect(Object.keys(SCALES)).toContain(p.scale);
  });

  it('stay in a playable range', () => {
    for (const p of PRESETS) {
      expect(p.lowMidi).toBeGreaterThanOrEqual(24);
      expect(p.lowMidi + p.octaves * 12).toBeLessThanOrEqual(96);
      expect(p.glide).toBeGreaterThan(0);
      expect(p.glide).toBeLessThan(0.5);
    }
  });
});

describe('theremin params', () => {
  it('stay inside safe bounds for any input', () => {
    for (const t of STEPS) for (const m of STEPS) {
      const p = thereminParams(t, m);
      expect(p.cutoffHz).toBeGreaterThanOrEqual(900);
      expect(p.cutoffHz).toBeLessThanOrEqual(5000);
      expect(p.vibratoCents).toBeGreaterThanOrEqual(4);
      expect(p.vibratoCents).toBeLessThanOrEqual(18);
      expect(p.reverbSend).toBeGreaterThan(0);
      expect(p.reverbSend).toBeLessThanOrEqual(0.5);
    }
  });
});

describe('glass-pad params', () => {
  it('stay inside safe bounds for any input', () => {
    for (const t of STEPS) for (const m of STEPS) {
      const p = glassPadParams(t, m);
      expect(p.cutoffHz).toBeGreaterThanOrEqual(160);
      expect(p.cutoffHz).toBeLessThanOrEqual(6500);
      expect(p.reverbSend).toBeGreaterThan(0);
      expect(p.reverbSend).toBeLessThanOrEqual(0.75);
      expect(p.shimmer).toBeGreaterThanOrEqual(0);
      expect(p.shimmer).toBeLessThanOrEqual(0.09);
    }
  });

  it('opens the filter as the hand opens', () => {
    expect(glassPadParams(0.5, 1).cutoffHz).toBeGreaterThan(glassPadParams(0.5, 0).cutoffHz);
  });
});

import { describe, expect, it } from 'vitest';
import { SCALES } from '../../input/scales';
import { glassPadParams } from './glassPad';
import { PRESETS } from './index';
import { THEREMIN_VARIANTS, thereminParams } from './theremin';

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
  it('stay inside each variant\'s bounds for any input', () => {
    for (const cfg of THEREMIN_VARIANTS) for (const t of STEPS) for (const m of STEPS) {
      const p = thereminParams(cfg, t, m);
      expect(p.cutoffHz).toBeGreaterThanOrEqual(cfg.cutoffHz[0]);
      expect(p.cutoffHz).toBeLessThanOrEqual(cfg.cutoffHz[1]);
      expect(p.vibratoCents).toBeGreaterThanOrEqual(cfg.vibratoCents[0]);
      expect(p.vibratoCents).toBeLessThanOrEqual(cfg.vibratoCents[1]);
      expect(p.reverbSend).toBeGreaterThan(0);
      expect(p.reverbSend).toBeLessThanOrEqual(0.65);
    }
  });

  it('keep vibrato subtle and levels sane', () => {
    for (const cfg of THEREMIN_VARIANTS) {
      expect(cfg.vibratoCents[1]).toBeLessThanOrEqual(25);
      expect(cfg.peak).toBeLessThanOrEqual(0.6);
      expect(cfg.echo?.feedback ?? 0).toBeLessThan(0.7);
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

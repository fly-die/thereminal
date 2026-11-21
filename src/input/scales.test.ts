import { describe, expect, it } from 'vitest';
import {
  Quantizer,
  SCALES,
  chordNote,
  midiToFreq,
  midiToName,
  nearestInScale,
  scaleNotesInRange,
  stepInScale,
} from './scales';

describe('midi helpers', () => {
  it('converts A4 and octaves', () => {
    expect(midiToFreq(69)).toBeCloseTo(440);
    expect(midiToFreq(57)).toBeCloseTo(220);
  });

  it('names notes', () => {
    expect(midiToName(60)).toBe('C4');
    expect(midiToName(70)).toBe('A#4');
  });
});

describe('nearestInScale', () => {
  it('snaps to C minor pentatonic', () => {
    expect(nearestInScale(61.2, 0, SCALES.minpent)).toBe(60); // C
    expect(nearestInScale(62.1, 0, SCALES.minpent)).toBe(63); // D# is closer than C
    expect(nearestInScale(66.4, 0, SCALES.minpent)).toBe(67); // G
  });

  it('respects the root key', () => {
    expect(nearestInScale(60, 2, SCALES.major)).toBe(59); // D major has B and C#, tie goes down
    expect(nearestInScale(61.6, 2, SCALES.major)).toBe(62);
  });

  it('only ever returns scale notes', () => {
    for (let m = 36; m < 96; m += 0.37) {
      const note = nearestInScale(m, 0, SCALES.minpent);
      expect(SCALES.minpent).toContain(((note % 12) + 12) % 12);
      expect(Math.abs(note - m)).toBeLessThanOrEqual(1.5);
    }
  });
});

describe('Quantizer', () => {
  it('does not flip on jitter around a note border', () => {
    const q = new Quantizer(0.25);
    // border between C (60) and D# (63) is 61.5
    expect(q.next(61.3, 0, SCALES.minpent)).toBe(60);
    expect(q.next(61.6, 0, SCALES.minpent)).toBe(60);
    expect(q.next(61.4, 0, SCALES.minpent)).toBe(60);
  });

  it('moves once the hand clearly passes the border', () => {
    const q = new Quantizer(0.25);
    q.next(60, 0, SCALES.minpent);
    expect(q.next(62, 0, SCALES.minpent)).toBe(63);
  });

  it('re-snaps when the scale changes under it', () => {
    const q = new Quantizer();
    expect(q.next(61, 0, SCALES.chromatic)).toBe(61);
    expect(q.next(61, 0, SCALES.minpent)).toBe(60);
  });
});

describe('scaleNotesInRange', () => {
  it('lists the scale notes inside the range', () => {
    expect(scaleNotesInRange(60, 72, 0, SCALES.minpent)).toEqual([60, 63, 65, 67, 70, 72]);
    expect(scaleNotesInRange(59.5, 62.5, 0, SCALES.chromatic)).toEqual([60, 61, 62]);
  });
});

describe('stepInScale and chordNote', () => {
  it('walks scale degrees', () => {
    expect(stepInScale(60, 2, 0, SCALES.major)).toBe(64);
    expect(stepInScale(60, 7, 0, SCALES.major)).toBe(72);
    expect(stepInScale(60, 0, 0, SCALES.major)).toBe(60);
  });

  it('builds a stacked chord in seven-note scales', () => {
    expect([0, 1, 2, 3].map((f) => chordNote(60, f, 0, SCALES.minor))).toEqual([60, 63, 67, 72]);
  });

  it('uses neighbouring notes in pentatonic scales', () => {
    expect([0, 1, 2, 3].map((f) => chordNote(60, f, 0, SCALES.minpent))).toEqual([60, 63, 65, 67]);
  });

  it('falls back to a major chord without a scale', () => {
    expect([0, 1, 2, 3].map((f) => chordNote(60, f, 0, null))).toEqual([60, 64, 67, 72]);
  });
});

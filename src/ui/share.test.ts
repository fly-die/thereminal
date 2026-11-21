import { describe, expect, it } from 'vitest';
import { PRESETS } from '../audio/presets';
import { formatShare, parseShare } from './share';

const index = (id: string): number => PRESETS.findIndex((p) => p.id === id);

describe('parseShare', () => {
  it('reads a full link', () => {
    expect(parseShare(new URLSearchParams('p=glass-pad&s=dorian&k=Fs&o=-1'))).toEqual({
      preset: index('glass-pad'),
      scale: 'dorian',
      root: 6,
      octave: -1,
    });
  });

  it('uses the preset scale when the link names none', () => {
    expect(parseShare(new URLSearchParams('p=kalimba'))).toEqual({ preset: index('kalimba'), scale: 'majpent' });
  });

  it('ignores anything invalid', () => {
    expect(parseShare(new URLSearchParams('p=nope&s=blues&k=H&o=9'))).toEqual({});
    expect(parseShare(new URLSearchParams(''))).toEqual({});
  });
});

describe('formatShare', () => {
  it('round-trips', () => {
    const state = { preset: index('wind'), scale: 'harmminor' as const, root: 10, octave: 2 };
    expect(parseShare(formatShare(state))).toEqual(state);
  });

  it('leaves out the octave when it is zero and keeps other params', () => {
    const params = formatShare({ preset: 0, scale: 'off', root: 0, octave: 0 }, new URLSearchParams('demo'));
    expect(params.has('o')).toBe(false);
    expect(params.has('demo')).toBe(true);
    expect(params.get('k')).toBe('C');
  });
});

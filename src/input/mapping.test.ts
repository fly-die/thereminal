import { describe, expect, it } from 'vitest';
import { heightToUnit, unitToFreq, unitToHeight } from './mapping';

describe('heightToUnit', () => {
  it('maps the usable band of the frame to 0..1, top is high', () => {
    expect(heightToUnit(0.1)).toBeCloseTo(1);
    expect(heightToUnit(0.5)).toBeCloseTo(0.5);
    expect(heightToUnit(0.9)).toBeCloseTo(0);
  });

  it('clamps inside the dead zones', () => {
    expect(heightToUnit(0)).toBe(1);
    expect(heightToUnit(1)).toBe(0);
    expect(heightToUnit(-0.3)).toBe(1);
  });
});

describe('unitToFreq', () => {
  it('spans exactly the requested octaves', () => {
    expect(unitToFreq(0, 110, 3)).toBeCloseTo(110);
    expect(unitToFreq(1, 110, 3)).toBeCloseTo(880);
  });

  it('gives equal intervals for equal distances', () => {
    const lowerHalf = unitToFreq(0.5, 110, 3) / unitToFreq(0, 110, 3);
    const upperHalf = unitToFreq(1, 110, 3) / unitToFreq(0.5, 110, 3);
    expect(lowerHalf).toBeCloseTo(upperHalf);
  });

  it('never leaves the range', () => {
    expect(unitToFreq(-1, 110, 3)).toBeCloseTo(110);
    expect(unitToFreq(2, 110, 3)).toBeCloseTo(880);
  });
});

describe('unitToHeight', () => {
  it('is the inverse of heightToUnit', () => {
    for (const u of [0, 0.2, 0.5, 0.9, 1]) expect(heightToUnit(unitToHeight(u))).toBeCloseTo(u);
  });
});

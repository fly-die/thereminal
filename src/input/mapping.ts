// Pure hand-to-parameter mapping. No DOM, no audio, so it is cheap to unit test.

export const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

/**
 * Image y (0 = top of frame, 1 = bottom) to play height (0 = low, 1 = high).
 * The outer `margin` of the frame is a dead zone because tracking is worst at the edges.
 */
export function heightToUnit(y: number, margin = 0.1): number {
  return clamp01((1 - margin - y) / (1 - 2 * margin));
}

/** Inverse of heightToUnit, used to draw note guides where the hand has to be. */
export function unitToHeight(unit: number, margin = 0.1): number {
  return 1 - margin - clamp01(unit) * (1 - 2 * margin);
}

/** Play height to frequency. Exponential, so equal distance means equal interval. */
export function unitToFreq(unit: number, lowHz: number, octaves: number): number {
  return lowHz * 2 ** (clamp01(unit) * octaves);
}

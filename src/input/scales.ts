// Scales and pitch quantization. Pitches are MIDI note numbers, fractional while gliding.

export const SCALES = {
  off: null,
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  minpent: [0, 3, 5, 7, 10],
  majpent: [0, 2, 4, 7, 9],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  harmminor: [0, 2, 3, 5, 7, 8, 11],
  chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
} as const satisfies Record<string, readonly number[] | null>;

export type ScaleId = keyof typeof SCALES;
export const SCALE_IDS = Object.keys(SCALES) as ScaleId[];

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

export const midiToFreq = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);

export function midiToName(midi: number): string {
  const n = Math.round(midi);
  const name = NOTE_NAMES[((n % 12) + 12) % 12] ?? '?';
  return `${name}${Math.floor(n / 12) - 1}`;
}

const inScale = (note: number, root: number, scale: readonly number[]): boolean =>
  scale.includes((((note - root) % 12) + 12) % 12);

/** All notes of a scale inside a range, lowest first. Used for the on-screen note guides. */
export function scaleNotesInRange(
  low: number,
  high: number,
  root: number,
  scale: readonly number[],
): number[] {
  const notes: number[] = [];
  for (let n = Math.ceil(low); n <= Math.floor(high); n++) if (inScale(n, root, scale)) notes.push(n);
  return notes;
}

/** Closest scale note to a fractional pitch. Ties resolve downwards. */
export function nearestInScale(midi: number, root: number, scale: readonly number[]): number {
  const base = Math.round(midi);
  for (let d = 0; d <= 12; d++) {
    const below = base - d;
    const above = base + d;
    const hitBelow = inScale(below, root, scale);
    const hitAbove = inScale(above, root, scale);
    if (hitBelow && hitAbove) return Math.abs(midi - below) <= Math.abs(midi - above) ? below : above;
    if (hitBelow) return below;
    if (hitAbove) return above;
  }
  return base;
}

/**
 * Quantizer with hysteresis. A hand resting on the border between two notes would
 * otherwise flip between them on every frame of jitter.
 */
export class Quantizer {
  private current: number | null = null;

  /** @param margin extra semitones the hand must travel past the midpoint before the note changes */
  constructor(private readonly margin = 0.25) {}

  reset(): void {
    this.current = null;
  }

  next(midi: number, root: number, scale: readonly number[]): number {
    const candidate = nearestInScale(midi, root, scale);
    if (this.current === null || !inScale(this.current, root, scale)) {
      this.current = candidate;
    } else if (
      candidate !== this.current &&
      Math.abs(midi - candidate) + this.margin < Math.abs(midi - this.current)
    ) {
      this.current = candidate;
    }
    return this.current;
  }
}

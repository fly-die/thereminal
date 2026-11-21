// Karplus-Strong plucked string, rendered offline into a plain sample array.
// A live feedback loop in the Web Audio graph cannot do this: a DelayNode inside a
// cycle is at least one render block (128 samples) long, which caps the pitch around
// 340 Hz. Rendering the note up front has no such limit and needs no AudioWorklet.

export interface PluckOptions {
  /** 0..1, how bright the initial pluck is. */
  brightness: number;
  /** Loop gain per period, just below 1. Higher rings longer. */
  sustain: number;
}

export function pluck(
  sampleRate: number,
  hz: number,
  seconds: number,
  opts: PluckOptions,
  random: () => number = Math.random,
): Float32Array<ArrayBuffer> {
  const length = Math.floor(sampleRate * seconds);
  const out = new Float32Array(new ArrayBuffer(length * 4));
  // The averaging filter in the loop adds half a sample of delay, so the line is
  // that much shorter than one period. The fractional part keeps high notes in tune.
  const delay = sampleRate / hz - 0.5;
  const size = Math.ceil(delay) + 2;
  const line = new Float32Array(size);

  // Excitation: one period of noise, lowpassed so a soft pluck is not a click.
  let low = 0;
  const k = 0.15 + 0.85 * Math.min(1, Math.max(0, opts.brightness));
  for (let i = 0; i < size; i++) {
    low += (random() * 2 - 1 - low) * k;
    line[i] = low;
  }

  let write = 0;
  let previous = 0;
  let peak = 0;
  for (let n = 0; n < length; n++) {
    const pos = (write - delay + size * 2) % size;
    const i0 = Math.floor(pos);
    const frac = pos - i0;
    const a = line[i0] ?? 0;
    const b = line[(i0 + 1) % size] ?? 0;
    const sample = a + (b - a) * frac;
    line[write] = opts.sustain * 0.5 * (sample + previous);
    previous = sample;
    write = (write + 1) % size;
    out[n] = sample;
    peak = Math.max(peak, Math.abs(sample));
  }

  // Normalise, and fade the last few milliseconds so the buffer never ends on a step.
  const fade = Math.min(length, Math.floor(sampleRate * 0.02));
  for (let n = 0; n < length; n++) {
    const tail = n >= length - fade ? (length - n) / fade : 1;
    out[n] = ((out[n] ?? 0) / (peak || 1)) * tail;
  }
  return out;
}

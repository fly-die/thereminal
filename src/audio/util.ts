export const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * clamp01(t);

/** Exponential interpolation, for anything heard on a log scale (Hz, gain). */
export const expLerp = (a: number, b: number, t: number): number => a * (b / a) ** clamp01(t);

/**
 * Synthetic reverb impulse: decaying stereo noise that gets darker as it fades,
 * which is what makes a tail sound like a room instead of a hiss.
 * @param damping 0 = bright tail, 1 = very dark tail
 */
export function makeImpulse(
  ctx: BaseAudioContext,
  seconds: number,
  damping: number,
  preDelay = 0.012,
): AudioBuffer {
  const rate = ctx.sampleRate;
  const length = Math.floor(rate * seconds);
  const start = Math.floor(rate * preDelay);
  const buffer = ctx.createBuffer(2, length, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    let low = 0;
    for (let i = start; i < length; i++) {
      const t = (i - start) / (length - start);
      const k = 1 - damping * Math.sqrt(t) * 0.97; // one-pole lowpass that closes over time
      low += (Math.random() * 2 - 1 - low) * k;
      data[i] = low * Math.exp(-6.9 * t); // -60 dB at the end
    }
  }
  return buffer;
}

/** Soft saturation curve for a WaveShaperNode. */
export function tanhCurve(drive: number, size = 1024): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(new ArrayBuffer(size * 4));
  const norm = Math.tanh(drive);
  for (let i = 0; i < size; i++) {
    const x = (i / (size - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * drive) / norm;
  }
  return curve;
}

/** A loop of white noise. */
export function makeNoise(ctx: BaseAudioContext, seconds = 2): AudioBuffer {
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

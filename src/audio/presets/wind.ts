import { expLerp, lerp, makeImpulse, makeNoise } from '../util';
import type { Preset, Voice } from './types';

// Patch
//   looping white noise -> two bandpass filters (at the played pitch and a fifth above)
//     -> gust amplitude (two slow lfos that never line up) -> vca -> out
//                                                              \-> long hall -> out
// A narrow filter makes the noise whistle a note, a wide one is just air.
// Hand: up/down = pitch of the whistle, left/right = air to whistle, open hand = more.

const PEAK = 0.9;

export function windParams(timbre: number, macro: number) {
  const q = expLerp(1.5, 28, timbre);
  return {
    q,
    // A narrower band passes less energy, so it is made up here.
    makeup: 1 + q / 7,
    reverbSend: lerp(0.3, 0.8, macro),
  };
}

function create(ctx: AudioContext): Voice {
  const noise = new AudioBufferSourceNode(ctx, { buffer: makeNoise(ctx), loop: true });
  const low = new BiquadFilterNode(ctx, { type: 'bandpass', frequency: 600, Q: 6 });
  const high = new BiquadFilterNode(ctx, { type: 'bandpass', frequency: 900, Q: 6 });
  const highGain = new GainNode(ctx, { gain: 0.4 });
  const makeup = new GainNode(ctx, { gain: 2 });
  noise.connect(low).connect(makeup);
  noise.connect(high).connect(highGain).connect(makeup);

  const gust = new GainNode(ctx, { gain: 0.7 });
  const lfos = [0.11, 0.29].map((frequency) => {
    const lfo = new OscillatorNode(ctx, { type: 'sine', frequency });
    lfo.connect(new GainNode(ctx, { gain: 0.15 })).connect(gust.gain);
    return lfo;
  });

  const vca = new GainNode(ctx, { gain: 0 });
  const send = new GainNode(ctx, { gain: 0.5 });
  const output = new GainNode(ctx);
  makeup.connect(gust).connect(vca).connect(output);
  vca.connect(send).connect(new ConvolverNode(ctx, { buffer: makeImpulse(ctx, 4.5, 0.6, 0.03) })).connect(output);

  noise.start();
  for (const lfo of lfos) lfo.start();

  return {
    output,
    setPitch(hz, glide) {
      const now = ctx.currentTime;
      low.frequency.setTargetAtTime(hz, now, glide);
      high.frequency.setTargetAtTime(hz * 1.5, now, glide);
    },
    setLevel(level) {
      vca.gain.setTargetAtTime(level * level * PEAK, ctx.currentTime, level > 0.001 ? 0.25 : 0.6);
    },
    setTimbre(value) {
      const p = windParams(value, 0);
      const now = ctx.currentTime;
      low.Q.setTargetAtTime(p.q, now, 0.1);
      high.Q.setTargetAtTime(p.q, now, 0.1);
      makeup.gain.setTargetAtTime(p.makeup, now, 0.1);
    },
    setMacro(value) {
      send.gain.setTargetAtTime(windParams(0, value).reverbSend, ctx.currentTime, 0.15);
    },
    dispose() {
      noise.stop();
      for (const lfo of lfos) lfo.stop();
      output.disconnect();
    },
  };
}

export const wind: Preset = {
  id: 'wind',
  mode: 'continuous',
  scale: 'minpent',
  lowMidi: 60, // C4
  octaves: 2.5,
  glide: 0.15,
  timbreLabel: 'whistle',
  macroLabel: 'air',
  create,
};

import { expLerp, lerp, makeImpulse, tanhCurve } from '../util';
import type { Preset, Voice } from './types';

// Patch
//   3 detuned saws + square one octave down
//     -> resonant lowpass -> soft drive -> phaser (4 swept allpass stages) -> vca -> out
//                                                                 a little room -> out
// The slow beating between the saws is the "reese" movement, the phaser adds a second,
// slower one on top.
// Hand: left/right = filter cutoff, open hand = filter opens further and it growls.

const PEAK = 0.4;
const DETUNE_CENTS = [-13, 0, 12] as const;

export function subReeseParams(timbre: number, macro: number) {
  return {
    cutoffHz: expLerp(110, 1800, timbre) * lerp(0.6, 1.6, macro),
    resonance: lerp(1.5, 6, macro),
    drive: lerp(0.35, 1, macro),
  };
}

function create(ctx: AudioContext): Voice {
  const sources: OscillatorNode[] = [];
  const bus = new GainNode(ctx, { gain: 0.3 });
  const saws = DETUNE_CENTS.map((detune) => {
    const saw = new OscillatorNode(ctx, { type: 'sawtooth', detune });
    saw.connect(bus);
    sources.push(saw);
    return saw;
  });
  const sub = new OscillatorNode(ctx, { type: 'square' });
  sub.connect(new GainNode(ctx, { gain: 0.5 })).connect(bus);
  sources.push(sub);

  const lowpass = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 500, Q: 3 });
  const pre = new GainNode(ctx, { gain: 0.6 });
  const shaper = new WaveShaperNode(ctx, { curve: tanhCurve(3), oversample: '2x' });
  bus.connect(lowpass).connect(pre).connect(shaper);

  // Phaser: four allpass stages whose centre is swept together, mixed with the dry signal.
  const sweep = new OscillatorNode(ctx, { type: 'sine', frequency: 0.13 });
  const sweepDepth = new GainNode(ctx, { gain: 500 });
  sweep.connect(sweepDepth);
  sources.push(sweep);
  let stage: AudioNode = shaper;
  for (let i = 0; i < 4; i++) {
    const allpass = new BiquadFilterNode(ctx, { type: 'allpass', frequency: 800, Q: 0.6 });
    sweepDepth.connect(allpass.frequency);
    stage = stage.connect(allpass);
  }
  const mix = new GainNode(ctx, { gain: 0.5 });
  shaper.connect(mix);
  stage.connect(mix);

  const vca = new GainNode(ctx, { gain: 0 });
  const output = new GainNode(ctx);
  mix.connect(vca).connect(output);
  vca
    .connect(new GainNode(ctx, { gain: 0.12 }))
    .connect(new ConvolverNode(ctx, { buffer: makeImpulse(ctx, 1.2, 0.8) }))
    .connect(output);

  for (const src of sources) src.start();

  let timbre = 0.5;
  let macro = 0.6;
  const apply = (): void => {
    const p = subReeseParams(timbre, macro);
    const now = ctx.currentTime;
    lowpass.frequency.setTargetAtTime(p.cutoffHz, now, 0.06);
    lowpass.Q.setTargetAtTime(p.resonance, now, 0.06);
    pre.gain.setTargetAtTime(p.drive, now, 0.06);
  };

  return {
    output,
    setPitch(hz, glide) {
      const now = ctx.currentTime;
      for (const saw of saws) saw.frequency.setTargetAtTime(hz, now, glide);
      sub.frequency.setTargetAtTime(hz / 2, now, glide);
    },
    setLevel(level) {
      vca.gain.setTargetAtTime(level * level * PEAK, ctx.currentTime, level > 0.001 ? 0.04 : 0.25);
    },
    setTimbre(value) {
      timbre = value;
      apply();
    },
    setMacro(value) {
      macro = value;
      apply();
    },
    dispose() {
      for (const src of sources) src.stop();
      output.disconnect();
    },
  };
}

export const subReese: Preset = {
  id: 'sub-reese',
  mode: 'continuous',
  scale: 'minor',
  lowMidi: 33, // A1
  octaves: 2,
  glide: 0.09,
  timbreLabel: 'cutoff',
  macroLabel: 'growl',
  create,
};

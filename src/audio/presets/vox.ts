import { lerp, makeImpulse } from '../util';
import type { Preset, Voice } from './types';

// Patch
//   sawtooth (a buzzy source, like vocal cords) + a little noise for breath
//     -> three parallel bandpass filters (formants) -> vca -> out, plus a small room
//   lfo -> oscillator detune (vibrato), fading in after the note starts
// A vowel is nothing more than where the first two resonances of the mouth sit. The
// two hand axes move them the way a mouth does:
//   open / close the hand = open / close the mouth (first formant: "oo" up to "ah")
//   left / right          = tongue back / front (second formant: "oo" across to "ee")
// So closed and left is "oo", open is "ah", right is "ee", with everything in between.

const PEAK = 1.95; // the bandpass filters throw most of the saw away
const VIBRATO_CENTS = 14;

export function voxParams(timbre: number, macro: number) {
  return {
    f1: lerp(300, 760, macro),
    f2: lerp(850, 2300, timbre),
    f3: lerp(2300, 3000, timbre),
  };
}

function create(ctx: BaseAudioContext): Voice {
  const saw = new OscillatorNode(ctx, { type: 'sawtooth' });
  const source = new GainNode(ctx, { gain: 0.5 });
  saw.connect(source);

  const lfo = new OscillatorNode(ctx, { type: 'sine', frequency: 5.4 });
  const vibrato = new GainNode(ctx, { gain: 0 });
  lfo.connect(vibrato).connect(saw.detune);

  const vca = new GainNode(ctx, { gain: 0 });
  const formants = [
    { q: 7, gain: 1 },
    { q: 9, gain: 0.5 },
    { q: 10, gain: 0.22 },
  ].map(({ q, gain }) => {
    const filter = new BiquadFilterNode(ctx, { type: 'bandpass', frequency: 800, Q: q });
    source.connect(filter).connect(new GainNode(ctx, { gain })).connect(vca);
    return filter;
  });

  const output = new GainNode(ctx);
  vca.connect(output);
  vca
    .connect(new GainNode(ctx, { gain: 0.28 }))
    .connect(new ConvolverNode(ctx, { buffer: makeImpulse(ctx, 1.8, 0.7, 0.015) }))
    .connect(output);

  saw.start();
  lfo.start();

  let timbre = 0.5;
  let macro = 0.6;
  let sounding = false;
  const apply = (): void => {
    const p = voxParams(timbre, macro);
    const now = ctx.currentTime;
    [p.f1, p.f2, p.f3].forEach((hz, i) => formants[i]?.frequency.setTargetAtTime(hz, now, 0.04));
  };

  return {
    output,
    setPitch(hz, glide) {
      saw.frequency.setTargetAtTime(hz, ctx.currentTime, glide);
    },
    setLevel(level) {
      const now = ctx.currentTime;
      const on = level > 0.001;
      vca.gain.setTargetAtTime(level * level * PEAK, now, on ? 0.06 : 0.14);
      if (on && !sounding) {
        vibrato.gain.setTargetAtTime(VIBRATO_CENTS, now + 0.3, 0.4);
      } else if (!on && sounding) {
        vibrato.gain.cancelScheduledValues(now);
        vibrato.gain.setTargetAtTime(0, now, 0.05);
      }
      sounding = on;
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
      saw.stop();
      lfo.stop();
      output.disconnect();
    },
  };
}

export const vox: Preset = {
  id: 'vox',
  mode: 'continuous',
  scale: 'dorian',
  lowMidi: 45, // A2
  octaves: 2,
  glide: 0.06,
  timbreLabel: 'oo to ee',
  macroLabel: 'ah',
  create,
};

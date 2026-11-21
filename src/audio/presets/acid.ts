import { expLerp, lerp, tanhCurve } from '../util';
import type { Preset, Voice } from './types';

// Patch
//   one sawtooth (always running) -> resonant lowpass -> soft drive -> vca -> out
//                                                                       \-> short echo
// Each pinch is a note: the pitch slides to it, the filter snaps open and falls shut
// again (that sweep through a ringing filter is the squelch), and the volume follows a
// short envelope. One voice only, so fast notes slur into each other.
// Hand: up/down picks the note, pinch plays it, left/right = how dark the filter
// rests, open hand = more resonance.

const SLIDE = 0.03;

export function acidParams(timbre: number, macro: number) {
  return {
    /** Where the filter rests between notes. */
    cutoffHz: expLerp(180, 1400, timbre),
    /** How far above the resting cutoff each note opens the filter, as a factor. */
    sweep: lerp(5, 9, macro),
    resonance: lerp(4, 15, macro),
    decaySeconds: lerp(0.18, 0.42, timbre),
  };
}

function create(ctx: BaseAudioContext): Voice {
  const saw = new OscillatorNode(ctx, { type: 'sawtooth', frequency: 110 });
  const lowpass = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 400, Q: 8 });
  const pre = new GainNode(ctx, { gain: 0.8 });
  const shaper = new WaveShaperNode(ctx, { curve: tanhCurve(2.5), oversample: '2x' });
  const amp = new GainNode(ctx, { gain: 0 });
  const bus = new GainNode(ctx, { gain: 0 });
  const output = new GainNode(ctx);
  saw.connect(lowpass).connect(pre).connect(shaper).connect(amp).connect(bus).connect(output);

  const echo = new DelayNode(ctx, { delayTime: 0.19, maxDelayTime: 1 });
  const feedback = new GainNode(ctx, { gain: 0.3 });
  bus.connect(new GainNode(ctx, { gain: 0.22 })).connect(echo);
  echo.connect(feedback).connect(echo);
  echo.connect(output);

  saw.start();

  let timbre = 0.5;
  let macro = 0.5;

  return {
    output,
    setPitch() {
      // Pitch is set per note.
    },
    setLevel(level) {
      bus.gain.setTargetAtTime(level, ctx.currentTime, 0.05);
    },
    setTimbre(value) {
      timbre = value;
    },
    setMacro(value) {
      macro = value;
      lowpass.Q.setTargetAtTime(acidParams(timbre, macro).resonance, ctx.currentTime, 0.05);
    },
    trigger(hz, velocity) {
      const p = acidParams(timbre, macro);
      const now = ctx.currentTime;
      saw.frequency.setTargetAtTime(hz, now, SLIDE);

      // Envelopes restart from wherever they are, so a fast second note cannot click.
      const top = Math.min(9000, p.cutoffHz * p.sweep);
      lowpass.frequency.cancelScheduledValues(now);
      lowpass.frequency.setTargetAtTime(top, now, 0.004);
      lowpass.frequency.setTargetAtTime(p.cutoffHz, now + 0.02, p.decaySeconds / 3);

      amp.gain.cancelScheduledValues(now);
      amp.gain.setTargetAtTime(0.3 * velocity, now, 0.004);
      amp.gain.setTargetAtTime(0, now + 0.05, p.decaySeconds);
    },
    dispose() {
      saw.stop();
      output.disconnect();
    },
  };
}

export const acid: Preset = {
  id: 'acid',
  mode: 'pluck',
  scale: 'minor',
  lowMidi: 36, // C2
  octaves: 2,
  glide: 0.01,
  timbreLabel: 'cutoff',
  macroLabel: 'squelch',
  create,
};

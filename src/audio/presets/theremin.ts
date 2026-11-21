import { expLerp, lerp, makeImpulse, tanhCurve } from '../util';
import type { Preset, Voice } from './types';

// Patch
//   sine + a little triangle -> soft saturation -> lowpass -> vca -> out
//                                                             \-> plate reverb -> out
//   5.6 Hz lfo -> detune of both oscillators (vibrato)
// The vibrato fades in a moment after the note starts, the way a player adds it.
// Hand: left/right = tone (darker to more nasal), open hand = more vibrato and space.

const PEAK = 0.5;
const VIBRATO_DELAY = 0.25;

/** Pure parameter mapping, kept apart from the nodes so it can be unit tested. */
export function thereminParams(timbre: number, macro: number) {
  return {
    cutoffHz: expLerp(1400, 7000, timbre),
    triangleMix: lerp(0.04, 0.4, timbre),
    vibratoCents: lerp(0, 32, macro),
    reverbSend: lerp(0.06, 0.5, macro),
  };
}

function create(ctx: AudioContext): Voice {
  const sine = new OscillatorNode(ctx, { type: 'sine' });
  const triangle = new OscillatorNode(ctx, { type: 'triangle' });
  const triangleGain = new GainNode(ctx, { gain: 0.15 });
  const shaper = new WaveShaperNode(ctx, { curve: tanhCurve(1.6), oversample: '2x' });
  const lowpass = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 3500, Q: 0.5 });
  const vca = new GainNode(ctx, { gain: 0 });
  const send = new GainNode(ctx, { gain: 0.2 });
  const plate = new ConvolverNode(ctx, { buffer: makeImpulse(ctx, 1.6, 0.6) });
  const output = new GainNode(ctx);

  const lfo = new OscillatorNode(ctx, { type: 'sine', frequency: 5.6 });
  const vibrato = new GainNode(ctx, { gain: 0 });
  lfo.connect(vibrato);
  vibrato.connect(sine.detune);
  vibrato.connect(triangle.detune);

  sine.connect(shaper);
  triangle.connect(triangleGain).connect(shaper);
  shaper.connect(lowpass).connect(vca);
  vca.connect(output);
  vca.connect(send).connect(plate).connect(output);

  for (const osc of [sine, triangle, lfo]) osc.start();

  let sounding = false;
  let vibratoCents = 0;

  return {
    output,
    setPitch(hz, glide) {
      const now = ctx.currentTime;
      sine.frequency.setTargetAtTime(hz, now, glide);
      triangle.frequency.setTargetAtTime(hz, now, glide);
    },
    setLevel(level) {
      const now = ctx.currentTime;
      const on = level > 0.001;
      vca.gain.setTargetAtTime(level * level * PEAK, now, on ? 0.03 : 0.07);
      if (on && !sounding) {
        vibrato.gain.setTargetAtTime(vibratoCents, now + VIBRATO_DELAY, 0.35);
      } else if (!on && sounding) {
        vibrato.gain.cancelScheduledValues(now);
        vibrato.gain.setTargetAtTime(0, now, 0.05);
      }
      sounding = on;
    },
    setTimbre(value) {
      const p = thereminParams(value, 0);
      const now = ctx.currentTime;
      lowpass.frequency.setTargetAtTime(p.cutoffHz, now, 0.05);
      triangleGain.gain.setTargetAtTime(p.triangleMix, now, 0.05);
    },
    setMacro(value) {
      const p = thereminParams(0, value);
      const now = ctx.currentTime;
      vibratoCents = p.vibratoCents;
      send.gain.setTargetAtTime(p.reverbSend, now, 0.1);
      if (sounding) vibrato.gain.setTargetAtTime(vibratoCents, now + 0.001, 0.2);
    },
    dispose() {
      for (const osc of [sine, triangle, lfo]) osc.stop();
      output.disconnect();
    },
  };
}

export const theremin: Preset = {
  id: 'theremin',
  scale: 'off',
  lowMidi: 48, // C3
  octaves: 3,
  glide: 0.02,
  timbreLabel: 'tone',
  macroLabel: 'vibrato',
  create,
};

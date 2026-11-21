import { expLerp, lerp, makeImpulse } from '../util';
import type { Preset, Voice } from './types';

// Patch
//   one oscillator with a hand-built harmonic series (strong fundamental, quickly
//   falling overtones: closer to a bowed string or a voice than to a test tone)
//     -> lowpass -> body resonance around 1.1 kHz -> vca -> out
//                                                       \-> plate reverb -> out
//   5.2 Hz lfo -> oscillator detune (vibrato)
// The vibrato fades in a moment after the note starts, the way a player adds it.
// Pitch snaps to semitones by default but glides slowly between them, so it still
// slides like a theremin while staying in tune. Turn the scale off for the raw thing.
// Hand: left/right = tone (dark to bright), open hand = more vibrato and space.

const PEAK = 0.5;
const VIBRATO_DELAY = 0.3;
// Amplitudes of harmonics 1..7.
const HARMONICS = [1, 0.42, 0.2, 0.1, 0.05, 0.025, 0.012] as const;

/** Pure parameter mapping, kept apart from the nodes so it can be unit tested. */
export function thereminParams(timbre: number, macro: number) {
  return {
    cutoffHz: expLerp(900, 5000, timbre),
    vibratoCents: lerp(4, 18, macro),
    reverbSend: lerp(0.15, 0.5, macro),
  };
}

function create(ctx: AudioContext): Voice {
  const imag = new Float32Array(HARMONICS.length + 1);
  HARMONICS.forEach((amp, i) => {
    imag[i + 1] = amp;
  });
  const wave = ctx.createPeriodicWave(new Float32Array(imag.length), imag);

  const osc = new OscillatorNode(ctx, { type: 'custom', periodicWave: wave });
  const lowpass = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 2500, Q: 0.7 });
  const body = new BiquadFilterNode(ctx, { type: 'peaking', frequency: 1100, Q: 1.2, gain: 3 });
  const vca = new GainNode(ctx, { gain: 0 });
  const send = new GainNode(ctx, { gain: 0.3 });
  const plate = new ConvolverNode(ctx, { buffer: makeImpulse(ctx, 2.2, 0.65, 0.02) });
  const output = new GainNode(ctx);

  const lfo = new OscillatorNode(ctx, { type: 'sine', frequency: 5.2 });
  const vibrato = new GainNode(ctx, { gain: 0 });
  lfo.connect(vibrato).connect(osc.detune);

  osc.connect(lowpass).connect(body).connect(vca);
  vca.connect(output);
  vca.connect(send).connect(plate).connect(output);

  osc.start();
  lfo.start();

  let sounding = false;
  let vibratoCents = thereminParams(0.5, 0.5).vibratoCents;

  return {
    output,
    setPitch(hz, glide) {
      osc.frequency.setTargetAtTime(hz, ctx.currentTime, glide);
    },
    setLevel(level) {
      const now = ctx.currentTime;
      const on = level > 0.001;
      vca.gain.setTargetAtTime(level * level * PEAK, now, on ? 0.05 : 0.12);
      if (on && !sounding) {
        vibrato.gain.setTargetAtTime(vibratoCents, now + VIBRATO_DELAY, 0.4);
      } else if (!on && sounding) {
        vibrato.gain.cancelScheduledValues(now);
        vibrato.gain.setTargetAtTime(0, now, 0.05);
      }
      sounding = on;
    },
    setTimbre(value) {
      lowpass.frequency.setTargetAtTime(thereminParams(value, 0).cutoffHz, ctx.currentTime, 0.05);
    },
    setMacro(value) {
      const p = thereminParams(0, value);
      const now = ctx.currentTime;
      vibratoCents = p.vibratoCents;
      send.gain.setTargetAtTime(p.reverbSend, now, 0.1);
      if (sounding) vibrato.gain.setTargetAtTime(vibratoCents, now + 0.001, 0.25);
    },
    dispose() {
      osc.stop();
      lfo.stop();
      output.disconnect();
    },
  };
}

export const theremin: Preset = {
  id: 'theremin',
  scale: 'chromatic',
  lowMidi: 48, // C3
  octaves: 3,
  glide: 0.07,
  timbreLabel: 'tone',
  macroLabel: 'vibrato',
  create,
};

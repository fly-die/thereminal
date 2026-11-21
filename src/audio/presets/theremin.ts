import { expLerp, lerp, makeImpulse } from '../util';
import type { Preset, Voice } from './types';

// Patch (config driven, so the voice can be re-tuned in the polish pass)
//   1 or 2 oscillators with a hand-built harmonic series
//     -> lowpass -> optional formant / body peaks -> vca -> out
//                                                     \-> reverb -> out
//                                                     \-> optional echo -> out
//   lfo -> oscillator detune (vibrato), fading in a moment after the note starts
// Pitch snaps to semitones but glides slowly between them, so it still slides like a
// theremin while staying in tune. Turn the scale off for the raw thing.
// Hand: left/right = space (dry to echoing), open hand = brighter with more vibrato.

interface Peak {
  hz: number;
  q: number;
  gainDb: number;
}

export interface ThereminConfig {
  id: string;
  /** Amplitudes of harmonics 1..n. */
  harmonics: readonly number[];
  /** One oscillator per entry, detuned by this many cents. Two make it thicker. */
  detuneCents: readonly number[];
  peaks: readonly Peak[];
  cutoffHz: readonly [number, number];
  attack: number;
  release: number;
  vibratoHz: number;
  vibratoCents: readonly [number, number];
  reverbSeconds: number;
  reverbSend: readonly [number, number];
  echo?: { time: number; feedback: number; mix: number };
  peak: number;
}

export const THEREMIN_VARIANTS: readonly ThereminConfig[] = [
  {
    // Almost a sine, slow attack, lots of space. Closest to a glass flute.
    id: 'theremin',
    harmonics: [1, 0.12, 0.03],
    detuneCents: [0],
    peaks: [],
    cutoffHz: [700, 3500],
    attack: 0.12,
    release: 0.25,
    vibratoHz: 4.8,
    vibratoCents: [0, 10],
    reverbSeconds: 3.5,
    reverbSend: [0.1, 0.65],
    echo: { time: 0.33, feedback: 0.35, mix: 0.22 },
    peak: 0.55,
  },
];

/** Pure parameter mapping, kept apart from the nodes so it can be unit tested. */
export function thereminParams(cfg: ThereminConfig, timbre: number, macro: number) {
  return {
    reverbSend: lerp(cfg.reverbSend[0], cfg.reverbSend[1], timbre),
    cutoffHz: expLerp(cfg.cutoffHz[0], cfg.cutoffHz[1], macro),
    vibratoCents: lerp(cfg.vibratoCents[0], cfg.vibratoCents[1], macro),
  };
}

const VIBRATO_DELAY = 0.3;

function create(cfg: ThereminConfig, ctx: AudioContext): Voice {
  const imag = new Float32Array(cfg.harmonics.length + 1);
  cfg.harmonics.forEach((amp, i) => {
    imag[i + 1] = amp;
  });
  const wave = ctx.createPeriodicWave(new Float32Array(imag.length), imag);

  const lfo = new OscillatorNode(ctx, { type: 'sine', frequency: cfg.vibratoHz });
  const vibrato = new GainNode(ctx, { gain: 0 });
  lfo.connect(vibrato);

  const mix = new GainNode(ctx, { gain: 1 / cfg.detuneCents.length });
  const oscs = cfg.detuneCents.map((detune) => {
    const osc = new OscillatorNode(ctx, { type: 'custom', periodicWave: wave, detune });
    vibrato.connect(osc.detune);
    osc.connect(mix);
    return osc;
  });

  const lowpass = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 2500, Q: 0.7 });
  let tail: AudioNode = mix.connect(lowpass);
  for (const p of cfg.peaks) {
    tail = tail.connect(
      new BiquadFilterNode(ctx, { type: 'peaking', frequency: p.hz, Q: p.q, gain: p.gainDb }),
    );
  }
  const vca = new GainNode(ctx, { gain: 0 });
  const output = new GainNode(ctx);
  tail.connect(vca).connect(output);

  const send = new GainNode(ctx, { gain: cfg.reverbSend[0] });
  const reverb = new ConvolverNode(ctx, { buffer: makeImpulse(ctx, cfg.reverbSeconds, 0.65, 0.02) });
  vca.connect(send).connect(reverb).connect(output);

  if (cfg.echo) {
    const delay = new DelayNode(ctx, { delayTime: cfg.echo.time, maxDelayTime: 1 });
    const feedback = new GainNode(ctx, { gain: cfg.echo.feedback });
    const damp = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 2200 });
    vca.connect(new GainNode(ctx, { gain: cfg.echo.mix })).connect(delay);
    delay.connect(damp).connect(feedback).connect(delay); // each repeat gets darker
    delay.connect(output);
    delay.connect(send);
  }

  for (const osc of [...oscs, lfo]) osc.start();

  let sounding = false;
  let vibratoCents = thereminParams(cfg, 0.5, 0.5).vibratoCents;

  return {
    output,
    setPitch(hz, glide) {
      for (const osc of oscs) osc.frequency.setTargetAtTime(hz, ctx.currentTime, glide);
    },
    setLevel(level) {
      const now = ctx.currentTime;
      const on = level > 0.001;
      vca.gain.setTargetAtTime(level * level * cfg.peak, now, on ? cfg.attack : cfg.release);
      if (on && !sounding) {
        vibrato.gain.setTargetAtTime(vibratoCents, now + VIBRATO_DELAY, 0.4);
      } else if (!on && sounding) {
        vibrato.gain.cancelScheduledValues(now);
        vibrato.gain.setTargetAtTime(0, now, 0.05);
      }
      sounding = on;
    },
    setTimbre(value) {
      const wet = thereminParams(cfg, value, 0).reverbSend;
      send.gain.setTargetAtTime(wet, ctx.currentTime, 0.1);
    },
    setMacro(value) {
      const p = thereminParams(cfg, 0, value);
      const now = ctx.currentTime;
      vibratoCents = p.vibratoCents;
      lowpass.frequency.setTargetAtTime(p.cutoffHz, now, 0.05);
      if (sounding) vibrato.gain.setTargetAtTime(vibratoCents, now + 0.001, 0.25);
    },
    dispose() {
      for (const osc of [...oscs, lfo]) osc.stop();
      output.disconnect();
    },
  };
}

export const THEREMINS: readonly Preset[] = THEREMIN_VARIANTS.map((cfg) => ({
  id: cfg.id,
  mode: 'continuous',
  scale: 'chromatic',
  lowMidi: 48, // C3
  octaves: 3,
  glide: 0.07,
  timbreLabel: 'space',
  macroLabel: 'bright',
  create: (ctx: AudioContext) => create(cfg, ctx),
}));

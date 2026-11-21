import { expLerp, lerp, makeImpulse } from '../util';
import type { Preset, Voice } from './types';

// Patch
//   5 detuned saws spread across the stereo field + sub sine one octave down
//     -> lowpass -> high shelf cut -> vca (slow attack) -> chorus -> out
//                                                       \-> long hall reverb -> out
//   2 sines one octave up -> reverb only. They are never heard dry, they just make
//   the tail glow (a cheap stand-in for a shimmer reverb).
// Hand: left/right = filter cutoff, open hand = brighter, more shimmer and more hall.

const PEAK = 0.55;
const DETUNE_CENTS = [-17, -9, 0, 8, 16] as const;
const PAN = [-0.8, -0.4, 0, 0.4, 0.8] as const;

export function glassPadParams(timbre: number, macro: number) {
  return {
    // A closing hand pulls the filter down by up to an octave.
    cutoffHz: expLerp(320, 6500, timbre) * lerp(0.5, 1, macro),
    reverbSend: lerp(0.2, 0.75, macro),
    shimmer: lerp(0, 0.09, macro),
  };
}

function create(ctx: BaseAudioContext): Voice {
  const sources: OscillatorNode[] = [];
  const bus = new GainNode(ctx, { gain: 0.16 });

  const saws = DETUNE_CENTS.map((detune, i) => {
    const saw = new OscillatorNode(ctx, { type: 'sawtooth', detune });
    saw.connect(new StereoPannerNode(ctx, { pan: PAN[i] ?? 0 })).connect(bus);
    sources.push(saw);
    return saw;
  });
  const sub = new OscillatorNode(ctx, { type: 'sine' });
  sub.connect(new GainNode(ctx, { gain: 1.4 })).connect(bus);
  sources.push(sub);

  const lowpass = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 1500, Q: 1.1 });
  const shelf = new BiquadFilterNode(ctx, { type: 'highshelf', frequency: 6000, gain: -5 });
  const vca = new GainNode(ctx, { gain: 0 });
  const output = new GainNode(ctx);
  bus.connect(lowpass).connect(shelf).connect(vca);

  // Chorus: two short delays, slowly modulated, panned apart.
  const dry = new GainNode(ctx, { gain: 0.75 });
  vca.connect(dry).connect(output);
  const taps = [
    { time: 0.012, rate: 0.31, depth: 0.003, pan: -0.6 },
    { time: 0.019, rate: 0.43, depth: 0.004, pan: 0.6 },
  ];
  for (const tap of taps) {
    const delay = new DelayNode(ctx, { delayTime: tap.time, maxDelayTime: 0.05 });
    const lfo = new OscillatorNode(ctx, { type: 'sine', frequency: tap.rate });
    lfo.connect(new GainNode(ctx, { gain: tap.depth })).connect(delay.delayTime);
    vca
      .connect(delay)
      .connect(new StereoPannerNode(ctx, { pan: tap.pan }))
      .connect(new GainNode(ctx, { gain: 0.45 }))
      .connect(output);
    sources.push(lfo);
  }

  const hall = new ConvolverNode(ctx, { buffer: makeImpulse(ctx, 5, 0.75, 0.03) });
  const send = new GainNode(ctx, { gain: 0.4 });
  vca.connect(send).connect(hall).connect(output);

  const shimmerGain = new GainNode(ctx, { gain: 0 });
  const shimmerVca = new GainNode(ctx, { gain: 0 });
  const shimmers = [-6, 6].map((detune) => {
    const osc = new OscillatorNode(ctx, { type: 'sine', detune });
    osc.connect(shimmerGain);
    sources.push(osc);
    return osc;
  });
  shimmerGain.connect(shimmerVca).connect(hall);

  for (const src of sources) src.start();

  let timbre = 0.5;
  let macro = 0.6;
  const applyParams = (): void => {
    const p = glassPadParams(timbre, macro);
    const now = ctx.currentTime;
    lowpass.frequency.setTargetAtTime(p.cutoffHz, now, 0.08);
    send.gain.setTargetAtTime(p.reverbSend, now, 0.15);
    shimmerGain.gain.setTargetAtTime(p.shimmer, now, 0.15);
  };

  return {
    output,
    setPitch(hz, glide) {
      const now = ctx.currentTime;
      for (const saw of saws) saw.frequency.setTargetAtTime(hz, now, glide);
      sub.frequency.setTargetAtTime(hz / 2, now, glide);
      for (const osc of shimmers) osc.frequency.setTargetAtTime(hz * 2, now, glide);
    },
    setLevel(level) {
      const now = ctx.currentTime;
      const gain = level * level * PEAK;
      const rising = level > 0.001;
      vca.gain.setTargetAtTime(gain, now, rising ? 0.18 : 0.5);
      shimmerVca.gain.setTargetAtTime(level * level, now, rising ? 0.4 : 0.5);
    },
    setTimbre(value) {
      timbre = value;
      applyParams();
    },
    setMacro(value) {
      macro = value;
      applyParams();
    },
    dispose() {
      for (const src of sources) src.stop();
      output.disconnect();
    },
  };
}

export const glassPad: Preset = {
  id: 'glass-pad',
  mode: 'continuous',
  scale: 'minpent',
  lowMidi: 45, // A2
  octaves: 2.5,
  glide: 0.07,
  timbreLabel: 'cutoff',
  macroLabel: 'shimmer',
  create,
};

import { expLerp, lerp, makeImpulse } from '../util';
import type { Preset, Voice } from './types';

// Patch (per strike)
//   modulator sine at 3.5x the pitch -> depth envelope -> carrier sine frequency
//   carrier -> amplitude envelope (instant attack, long exponential decay) -> pan -> bus
//   quiet second partial at 2.76x for the first moment of the strike
// bus -> out, bus -> ping-pong delay -> out, bus -> hall -> out
// The 3.5 ratio is not a whole number, so the overtones are inharmonic: that is what
// makes it a bell and not an organ. The modulation depth falls faster than the volume,
// so each note starts bright and metallic and rings out pure.
// Hand: up/down picks the note, pinch strikes it, left/right = how metallic,
// open hand = longer ring and more echo.

const RATIO = 3.5;

export function fmBellParams(timbre: number, macro: number) {
  return {
    /** Modulation index at the moment of the strike. */
    index: lerp(1.5, 7, timbre),
    decaySeconds: expLerp(1.2, 5, macro),
    echoSend: lerp(0.15, 0.55, macro),
  };
}

function create(ctx: AudioContext): Voice {
  const bus = new GainNode(ctx, { gain: 0 });
  const output = new GainNode(ctx);
  bus.connect(output);

  // Ping-pong: two delays feeding each other, panned hard left and right.
  const left = new DelayNode(ctx, { delayTime: 0.29, maxDelayTime: 1 });
  const right = new DelayNode(ctx, { delayTime: 0.43, maxDelayTime: 1 });
  const feedback = new GainNode(ctx, { gain: 0.38 });
  const echoSend = new GainNode(ctx, { gain: 0.3 });
  bus.connect(echoSend).connect(left);
  left.connect(right).connect(feedback).connect(left);
  left.connect(new StereoPannerNode(ctx, { pan: -0.7 })).connect(output);
  right.connect(new StereoPannerNode(ctx, { pan: 0.7 })).connect(output);

  bus
    .connect(new GainNode(ctx, { gain: 0.35 }))
    .connect(new ConvolverNode(ctx, { buffer: makeImpulse(ctx, 3.5, 0.55, 0.02) }))
    .connect(output);

  let timbre = 0.5;
  let macro = 0.6;

  return {
    output,
    setPitch() {
      // Pitch is set per strike.
    },
    setLevel(level) {
      bus.gain.setTargetAtTime(level, ctx.currentTime, 0.05);
    },
    setTimbre(value) {
      timbre = value;
    },
    setMacro(value) {
      macro = value;
      echoSend.gain.setTargetAtTime(fmBellParams(timbre, macro).echoSend, ctx.currentTime, 0.1);
    },
    trigger(hz, velocity) {
      const p = fmBellParams(timbre, macro);
      const now = ctx.currentTime;
      const end = now + p.decaySeconds + 0.1;

      const carrier = new OscillatorNode(ctx, { type: 'sine', frequency: hz });
      const modulator = new OscillatorNode(ctx, { type: 'sine', frequency: hz * RATIO });
      const depth = new GainNode(ctx, { gain: 0 });
      depth.gain.setValueAtTime(p.index * hz, now);
      depth.gain.exponentialRampToValueAtTime(0.05 * hz, now + p.decaySeconds * 0.4);
      modulator.connect(depth).connect(carrier.frequency);

      const partial = new OscillatorNode(ctx, { type: 'sine', frequency: hz * 2.76 });
      const partialAmp = new GainNode(ctx, { gain: 0 });
      partialAmp.gain.setValueAtTime(0.25, now);
      partialAmp.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);

      const amp = new GainNode(ctx, { gain: 0 });
      amp.gain.setValueAtTime(0, now);
      amp.gain.linearRampToValueAtTime(0.32 * velocity, now + 0.003); // 3 ms, no click
      amp.gain.exponentialRampToValueAtTime(0.0001, end);

      const pan = new StereoPannerNode(ctx, { pan: Math.random() * 0.6 - 0.3 });
      carrier.connect(amp);
      partial.connect(partialAmp).connect(amp);
      amp.connect(pan).connect(bus);

      for (const osc of [carrier, modulator, partial]) {
        osc.start(now);
        osc.stop(end + 0.05);
      }
      carrier.onended = () => pan.disconnect();
    },
    dispose() {
      output.disconnect();
    },
  };
}

export const fmBell: Preset = {
  id: 'fm-bell',
  mode: 'pluck',
  scale: 'minpent',
  lowMidi: 60, // C4
  octaves: 2,
  glide: 0.01,
  timbreLabel: 'metal',
  macroLabel: 'ring',
  create,
};

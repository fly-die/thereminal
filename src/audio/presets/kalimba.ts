import { pluck } from '../karplus';
import { lerp, makeImpulse } from '../util';
import type { Preset, Voice } from './types';

// Patch (per pluck)
//   Karplus-Strong string, rendered offline (see ../karplus.ts) -> pan -> bus
// bus -> highpass -> two body resonances (the wooden box) -> out, plus a short room.
// A kalimba tine is short and soft, so the string is plucked dull and decays fast.
// Hand: up/down picks the note, each finger pinched against the thumb plucks its own
// note (index, middle, ring, pinky), left/right = soft to bright pluck.

const NOTE_SECONDS = 1.6;

export function kalimbaParams(timbre: number) {
  return {
    brightness: lerp(0.15, 0.75, timbre),
    sustain: lerp(0.99, 0.996, timbre),
  };
}

function create(ctx: AudioContext): Voice {
  const bus = new GainNode(ctx, { gain: 0 });
  const highpass = new BiquadFilterNode(ctx, { type: 'highpass', frequency: 140 });
  const box = new BiquadFilterNode(ctx, { type: 'peaking', frequency: 420, Q: 2, gain: 6 });
  const air = new BiquadFilterNode(ctx, { type: 'peaking', frequency: 2400, Q: 1.5, gain: 3 });
  const output = new GainNode(ctx);
  bus.connect(highpass).connect(box).connect(air).connect(output);
  air
    .connect(new GainNode(ctx, { gain: 0.3 }))
    .connect(new ConvolverNode(ctx, { buffer: makeImpulse(ctx, 0.7, 0.85, 0.005) }))
    .connect(output);

  // Rendering a note takes well under a millisecond, but a few notes get played over
  // and over, so they are kept. Timbre is bucketed to keep the cache small.
  const cache = new Map<string, AudioBuffer>();
  let timbre = 0.5;

  return {
    output,
    setPitch() {
      // Pitch is set per pluck.
    },
    setLevel(level) {
      bus.gain.setTargetAtTime(level, ctx.currentTime, 0.05);
    },
    setTimbre(value) {
      timbre = value;
    },
    setMacro() {
      // The hand is busy pinching, so openness is not used here.
    },
    trigger(hz, velocity) {
      const bucket = Math.round(timbre * 4) / 4;
      const key = `${hz.toFixed(2)}:${bucket}`;
      let buffer = cache.get(key);
      if (!buffer) {
        const samples = pluck(ctx.sampleRate, hz, NOTE_SECONDS, kalimbaParams(bucket));
        buffer = ctx.createBuffer(1, samples.length, ctx.sampleRate);
        buffer.copyToChannel(samples, 0);
        cache.set(key, buffer);
      }
      const source = new AudioBufferSourceNode(ctx, { buffer });
      const amp = new GainNode(ctx, { gain: 0.6 * velocity });
      const pan = new StereoPannerNode(ctx, { pan: Math.random() * 0.5 - 0.25 });
      source.connect(amp).connect(pan).connect(bus);
      source.onended = () => pan.disconnect();
      source.start();
    },
    dispose() {
      output.disconnect();
    },
  };
}

export const kalimba: Preset = {
  id: 'kalimba',
  mode: 'pluck',
  scale: 'majpent',
  lowMidi: 60, // C4
  octaves: 2,
  glide: 0.01,
  timbreLabel: 'pluck',
  macroLabel: 'pluck',
  create,
};

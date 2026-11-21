import type { Preset, Voice } from './presets';

// Master chain
//   voices -> glue compressor -> limiter -> master volume -> speakers
// The compressor evens out presets, the limiter guarantees nothing ever blasts.

const MASTER_VOLUME = 0.7; // conservative on purpose
const CROSSFADE = 0.05; // time constant in seconds
const DISPOSE_AFTER_MS = 1500;

export interface Controls {
  /** null keeps the last pitch, used while the hand is gone. */
  hz: number | null;
  level: number;
  timbre: number;
  macro: number;
}

interface ActiveVoice {
  voice: Voice;
  fade: GainNode;
}

export class Engine {
  readonly ctx: AudioContext;
  /** Post-master tap for the scope and meters. */
  readonly analyser: AnalyserNode;
  private readonly input: GainNode;
  private active: ActiveVoice | null = null;
  private preset: Preset | null = null;

  /** Must be constructed inside a user gesture, browsers require it. */
  constructor() {
    this.ctx = new AudioContext({ latencyHint: 'interactive' });
    const ctx = this.ctx;
    this.input = new GainNode(ctx);
    const glue = new DynamicsCompressorNode(ctx, {
      threshold: -18, knee: 12, ratio: 3, attack: 0.01, release: 0.2,
    });
    const limiter = new DynamicsCompressorNode(ctx, {
      threshold: -4, knee: 0, ratio: 20, attack: 0.002, release: 0.1,
    });
    const master = new GainNode(ctx, { gain: MASTER_VOLUME });
    this.analyser = new AnalyserNode(ctx, { fftSize: 2048 });
    this.input.connect(glue).connect(limiter).connect(master).connect(ctx.destination);
    master.connect(this.analyser);
  }

  get outputLatencyMs(): number {
    return (this.ctx.baseLatency + (this.ctx.outputLatency || 0)) * 1000;
  }

  /** Crossfades to a new preset. The old voice rings out briefly, then is torn down. */
  setPreset(preset: Preset): void {
    if (preset === this.preset) return;
    const now = this.ctx.currentTime;
    const old = this.active;
    if (old) {
      old.voice.setLevel(0);
      old.fade.gain.setTargetAtTime(0, now, CROSSFADE);
      setTimeout(() => {
        old.voice.dispose();
        old.fade.disconnect();
      }, DISPOSE_AFTER_MS);
    }
    const fade = new GainNode(this.ctx, { gain: 0 });
    const voice = preset.create(this.ctx);
    voice.output.connect(fade).connect(this.input);
    fade.gain.setTargetAtTime(1, now, CROSSFADE);
    this.active = { voice, fade };
    this.preset = preset;
  }

  update(c: Controls): void {
    const active = this.active;
    const preset = this.preset;
    if (!active || !preset) return;
    if (c.hz !== null) active.voice.setPitch(c.hz, preset.glide);
    active.voice.setTimbre(c.timbre);
    active.voice.setMacro(c.macro);
    active.voice.setLevel(c.level);
  }

  silence(): void {
    this.active?.voice.setLevel(0);
  }
}

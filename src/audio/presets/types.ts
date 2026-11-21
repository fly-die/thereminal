import type { ScaleId } from '../../input/scales';

/** A running instance of a preset. All setters ramp, none of them may click. */
export interface Voice {
  readonly output: AudioNode;
  /** @param glide time constant in seconds for reaching the new pitch */
  setPitch(hz: number, glide: number): void;
  /** 0 = silent, 1 = full. Attack and release shapes belong to the preset. */
  setLevel(level: number): void;
  /** Horizontal hand position, 0..1. */
  setTimbre(value: number): void;
  /** Hand openness, 0 = nearly closed, 1 = flat open. */
  setMacro(value: number): void;
  dispose(): void;
}

export interface Preset {
  readonly id: string;
  readonly scale: ScaleId;
  /** Lowest playable note (MIDI) at the bottom of the frame. */
  readonly lowMidi: number;
  readonly octaves: number;
  /** Pitch glide time constant in seconds. */
  readonly glide: number;
  readonly timbreLabel: string;
  readonly macroLabel: string;
  create(ctx: AudioContext): Voice;
}

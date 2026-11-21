import { glassPad } from './glassPad';
import { THEREMINS } from './theremin';
import type { Preset } from './types';

export const PRESETS: readonly Preset[] = [...THEREMINS, glassPad];
export type { Preset, Voice } from './types';

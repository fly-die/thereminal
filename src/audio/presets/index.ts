import { glassPad } from './glassPad';
import { theremin } from './theremin';
import type { Preset } from './types';

export const PRESETS: readonly Preset[] = [theremin, glassPad];
export type { Preset, Voice } from './types';

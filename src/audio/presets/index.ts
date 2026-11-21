import { fmBell } from './fmBell';
import { glassPad } from './glassPad';
import { kalimba } from './kalimba';
import { subReese } from './subReese';
import { THEREMINS } from './theremin';
import type { Preset } from './types';
import { wind } from './wind';

/** Order is the number key order. */
export const PRESETS: readonly Preset[] = [...THEREMINS, glassPad, subReese, fmBell, kalimba, wind];
export type { Preset, Voice } from './types';

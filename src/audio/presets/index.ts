import { acid } from './acid';
import { fmBell } from './fmBell';
import { glassPad } from './glassPad';
import { kalimba } from './kalimba';
import { subReese } from './subReese';
import { THEREMINS } from './theremin';
import type { Preset } from './types';
import { vox } from './vox';
import { wind } from './wind';

/** Order is the number key order. */
export const PRESETS: readonly Preset[] = [
  ...THEREMINS, glassPad, subReese, fmBell, kalimba, wind, acid, vox,
];
export type { Preset, Voice } from './types';

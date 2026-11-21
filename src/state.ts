// The few settings the whole app shares. Per-frame data (hand positions, levels) does
// not live here, it flows straight from tracking to audio and render.

import type { ScaleId } from './input/scales';

// mono and color show the camera itself, the rest redraw it as text or pixels.
export const CAMERA_MODES = ['mono', 'color', 'ascii', 'dither', 'edges', 'off'] as const;
export type CameraMode = (typeof CAMERA_MODES)[number];

export const OVERLAY_MODES = ['star', 'pentagon', 'skeleton'] as const;
export type OverlayMode = (typeof OVERLAY_MODES)[number];

export const ACCENTS = ['green', 'amber', 'cyan'] as const;
export type Accent = (typeof ACCENTS)[number];

export type Theme = 'dark' | 'light';

export interface Settings {
  preset: number;
  scale: ScaleId;
  /** Root key as a pitch class, 0 = C. */
  root: number;
  /** Octave shift applied on top of the preset's range. */
  octave: number;
  camera: CameraMode;
  overlay: OverlayMode;
  theme: Theme;
  accent: Accent;
  muted: boolean;
  smoothing: boolean;
}

const STORAGE_KEY = 'thereminal.settings.v2';
// Only looks are remembered. Musical settings restart from the preset defaults.
const PERSISTED = ['camera', 'overlay', 'theme', 'accent'] as const;

const defaults: Settings = {
  preset: 0,
  scale: 'chromatic',
  root: 0,
  octave: 0,
  camera: 'mono',
  overlay: 'star',
  theme: 'dark',
  accent: 'green',
  muted: false,
  smoothing: true,
};

function load(): Partial<Settings> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const data = JSON.parse(raw) as Record<string, unknown>;
    const out: Partial<Settings> = {};
    if (CAMERA_MODES.includes(data.camera as CameraMode)) out.camera = data.camera as CameraMode;
    if (OVERLAY_MODES.includes(data.overlay as OverlayMode)) out.overlay = data.overlay as OverlayMode;
    if (ACCENTS.includes(data.accent as Accent)) out.accent = data.accent as Accent;
    if (data.theme === 'dark' || data.theme === 'light') out.theme = data.theme;
    return out;
  } catch {
    return {}; // private mode or corrupt data, defaults are fine
  }
}

export const settings: Settings = { ...defaults, ...load() };

type Listener = (changed: keyof Settings) => void;
const listeners: Listener[] = [];

export function subscribe(listener: Listener): void {
  listeners.push(listener);
}

export function set<K extends keyof Settings>(key: K, value: Settings[K]): void {
  if (settings[key] === value) return;
  settings[key] = value;
  if ((PERSISTED as readonly string[]).includes(key)) {
    try {
      const kept = Object.fromEntries(PERSISTED.map((k) => [k, settings[k]]));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(kept));
    } catch {
      // storage unavailable, the setting still applies for this visit
    }
  }
  for (const listener of listeners) listener(key);
}

/** Next entry in a list, wrapping around. */
export function cycle<T>(list: readonly T[], current: T, step = 1): T {
  const i = list.indexOf(current);
  return list[(i + step + list.length) % list.length] as T;
}

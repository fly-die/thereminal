import { PRESETS } from '../audio/presets';
import { NOTE_NAMES, SCALE_IDS, SCALE_LABELS } from '../input/scales';
import { ACCENTS, CAMERA_MODES, OVERLAY_MODES, cycle, set, settings } from '../state';

// Every setting in the app is an entry. The command palette and the keyboard both go
// through the same functions, so they cannot drift apart.

/** One option of a setting, for example a single scale. */
export interface Choice {
  title: string;
  key?: string;
  active(): boolean;
  run(): void;
}

/** A row on the first level of the palette: a setting to open, or an action to run. */
export interface Entry {
  section: 'sound' | 'view' | 'more';
  title: string;
  /** Current value, shown next to the title. */
  value?(): string;
  key?: string;
  /** Present on settings: the palette opens these as a second level. Read when opened. */
  choices?(): Choice[];
  /** Present on actions: runs straight away. */
  run?(): void;
  /** The palette stays open after most things, this one closes it. */
  closes?: boolean;
}

export interface CameraDevice {
  id: string;
  label: string;
}

/** What the commands need from the rest of the app. */
export interface Shell {
  toggleHelp(): void;
  openPalette(): void;
  closeOverlays(): boolean;
  toggleRecording(): void;
  recording(): boolean;
  cameras(): CameraDevice[];
  cameraId(): string;
  useCamera(id: string): void;
}

const OCTAVE_RANGE = 2;

export function selectPreset(index: number): void {
  const preset = PRESETS[index];
  if (!preset) return;
  set('preset', index);
  set('scale', preset.scale); // each preset brings the scale it sounds best in
}

const shiftOctave = (by: number): void =>
  set('octave', Math.max(-OCTAVE_RANGE, Math.min(OCTAVE_RANGE, settings.octave + by)));

export const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
export const PALETTE_KEY = isMac ? '⌘K' : 'ctrl+K';

const signed = (n: number): string => (n > 0 ? `+${n}` : String(n));

export function buildEntries(shell: Shell): Entry[] {
  return [
    {
      section: 'sound',
      title: 'preset',
      key: `1-${PRESETS.length}`,
      value: () => PRESETS[settings.preset]?.id ?? '',
      choices: () =>
        PRESETS.map((p, i) => ({
        title: p.id,
        key: String(i + 1),
        active: () => settings.preset === i,
        run: () => selectPreset(i),
      })),
    },
    {
      section: 'sound',
      title: 'scale',
      key: 's',
      value: () => SCALE_LABELS[settings.scale],
      choices: () =>
        SCALE_IDS.map((id) => ({
        title: SCALE_LABELS[id],
        active: () => settings.scale === id,
        run: () => set('scale', id),
      })),
    },
    {
      section: 'sound',
      title: 'key',
      key: 'k',
      value: () => NOTE_NAMES[settings.root] ?? 'C',
      choices: () =>
        NOTE_NAMES.map((name, i) => ({
        title: name,
        active: () => settings.root === i,
        run: () => set('root', i),
      })),
    },
    {
      section: 'sound',
      title: 'octave',
      key: '[ ]',
      value: () => signed(settings.octave),
      choices: () =>
        [2, 1, 0, -1, -2].map((n) => ({
        title: signed(n),
        active: () => settings.octave === n,
        run: () => set('octave', n),
      })),
    },
    {
      section: 'sound',
      title: 'mute',
      key: 'space',
      value: () => (settings.muted ? 'on' : 'off'),
      run: () => set('muted', !settings.muted),
    },
    {
      section: 'view',
      title: 'camera',
      key: 'v',
      value: () => settings.camera,
      choices: () =>
        CAMERA_MODES.map((m) => ({
        title: m,
        active: () => settings.camera === m,
        run: () => set('camera', m),
      })),
    },
    {
      section: 'view',
      title: 'hand overlay',
      key: 'h',
      value: () => settings.overlay,
      choices: () =>
        OVERLAY_MODES.map((m) => ({
        title: m,
        active: () => settings.overlay === m,
        run: () => set('overlay', m),
      })),
    },
    {
      section: 'view',
      title: 'accent',
      key: 'a',
      value: () => settings.accent,
      choices: () =>
        ACCENTS.map((a) => ({
        title: a,
        active: () => settings.accent === a,
        run: () => set('accent', a),
      })),
    },
    {
      section: 'view',
      title: 'theme',
      key: 'T',
      value: () => settings.theme,
      choices: () =>
        (['dark', 'light'] as const).map((t) => ({
        title: t,
        active: () => settings.theme === t,
        run: () => set('theme', t),
      })),
    },
    {
      section: 'view',
      title: 'camera device',
      value: () => shell.cameras().find((c) => c.id === shell.cameraId())?.label ?? 'default',
      choices: () =>
        shell.cameras().map((c) => ({
          title: c.label,
          active: () => c.id === shell.cameraId(),
          run: () => shell.useCamera(c.id),
        })),
    },
    {
      section: 'more',
      title: 'record',
      key: 'r',
      value: () => (shell.recording() ? 'recording' : '30s max'),
      run: shell.toggleRecording,
      closes: true,
    },
    {
      section: 'more',
      title: 'smoothing',
      value: () => (settings.smoothing ? 'on' : 'off'),
      run: () => set('smoothing', !settings.smoothing),
    },
    { section: 'more', title: 'help', key: '?', run: shell.toggleHelp, closes: true },
  ];
}

export type Cyclable = 'scale' | 'key' | 'octave' | 'camera' | 'overlay' | 'accent' | 'theme';

/** Steps a setting to its next value. Used by the keys and by taps on the setup panel. */
export function cycleSetting(name: Cyclable): void {
  switch (name) {
    case 'scale':
      set('scale', cycle(SCALE_IDS, settings.scale));
      break;
    case 'key':
      set('root', (settings.root + 1) % 12);
      break;
    case 'octave':
      set('octave', settings.octave >= OCTAVE_RANGE ? -OCTAVE_RANGE : settings.octave + 1);
      break;
    case 'camera':
      set('camera', cycle(CAMERA_MODES, settings.camera));
      break;
    case 'overlay':
      set('overlay', cycle(OVERLAY_MODES, settings.overlay));
      break;
    case 'accent':
      set('accent', cycle(ACCENTS, settings.accent));
      break;
    case 'theme':
      set('theme', settings.theme === 'dark' ? 'light' : 'dark');
      break;
  }
}

/** Direct keys. Listed here once, the help panel renders the same table. */
export const KEYS: readonly (readonly [string, string])[] = [
  [`1-${PRESETS.length}`, 'preset'],
  ['space', 'mute'],
  ['s', 'next scale'],
  ['k', 'next root key'],
  ['[ ]', 'octave down / up'],
  ['v', 'camera style'],
  ['h', 'hand overlay'],
  ['a', 'accent colour'],
  ['r', 'record, 30s max'],
  ['T', 'dark / light'],
  ['?', 'this help'],
  [PALETTE_KEY, 'all commands'],
];

export function handleKey(e: KeyboardEvent, shell: Shell): void {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    shell.openPalette();
    return;
  }
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.target instanceof HTMLInputElement) return; // typing in the palette
  if (e.key === 'Escape') {
    shell.closeOverlays();
    return;
  }
  const digit = Number.parseInt(e.key, 10);
  if (digit >= 1 && digit <= PRESETS.length) {
    selectPreset(digit - 1);
    return;
  }
  switch (e.key) {
    case ' ':
      e.preventDefault();
      set('muted', !settings.muted);
      break;
    case 's':
      cycleSetting('scale');
      break;
    case 'k':
      cycleSetting('key');
      break;
    case '[':
      shiftOctave(-1);
      break;
    case ']':
      shiftOctave(1);
      break;
    case 'v':
      cycleSetting('camera');
      break;
    case 'h':
      cycleSetting('overlay');
      break;
    case 't':
    case 'T':
      cycleSetting('theme');
      break;
    case 'a':
      cycleSetting('accent');
      break;
    case 'r':
      shell.toggleRecording();
      break;
    case '?':
      shell.toggleHelp();
      break;
  }
}

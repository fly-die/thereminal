import { PRESETS } from '../audio/presets';
import { NOTE_NAMES, SCALE_IDS, SCALE_LABELS } from '../input/scales';
import { ACCENTS, CAMERA_MODES, OVERLAY_MODES, cycle, set, settings } from '../state';

// Every action in the app is a command. The keyboard, the command palette and the
// help panel all read from this one list, so they cannot drift apart.

export interface Command {
  group: string;
  title: string;
  /** Key hint shown next to it, if it has a direct key. */
  key?: string;
  run(): void;
}

export interface Shell {
  toggleHelp(): void;
  openPalette(): void;
  closeOverlays(): boolean;
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

export function buildCommands(shell: Shell): Command[] {
  return [
    ...PRESETS.map((p, i) => ({ group: 'preset', title: p.id, key: String(i + 1), run: () => selectPreset(i) })),
    ...SCALE_IDS.map((id) => ({ group: 'scale', title: SCALE_LABELS[id], run: () => set('scale', id) })),
    ...NOTE_NAMES.map((name, i) => ({ group: 'key', title: name, run: () => set('root', i) })),
    { group: 'octave', title: 'up', key: ']', run: () => shiftOctave(1) },
    { group: 'octave', title: 'down', key: '[', run: () => shiftOctave(-1) },
    ...CAMERA_MODES.map((m) => ({ group: 'camera', title: m, run: () => set('camera', m) })),
    ...OVERLAY_MODES.map((m) => ({ group: 'overlay', title: m, run: () => set('overlay', m) })),
    ...ACCENTS.map((a) => ({ group: 'accent', title: a, run: () => set('accent', a) })),
    { group: 'theme', title: 'toggle dark / light', key: 'T', run: toggleTheme },
    { group: 'audio', title: 'mute / unmute', key: 'space', run: () => set('muted', !settings.muted) },
    { group: 'input', title: 'toggle smoothing', run: () => set('smoothing', !settings.smoothing) },
    { group: 'help', title: 'show help', key: '?', run: shell.toggleHelp },
  ];
}

function toggleTheme(): void {
  set('theme', settings.theme === 'dark' ? 'light' : 'dark');
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
      set('scale', cycle(SCALE_IDS, settings.scale));
      break;
    case 'k':
      set('root', (settings.root + 1) % 12);
      break;
    case '[':
      shiftOctave(-1);
      break;
    case ']':
      shiftOctave(1);
      break;
    case 'v':
      set('camera', cycle(CAMERA_MODES, settings.camera));
      break;
    case 'h':
      set('overlay', cycle(OVERLAY_MODES, settings.overlay));
      break;
    case 't':
    case 'T':
      toggleTheme();
      break;
    case 'a':
      set('accent', cycle(ACCENTS, settings.accent));
      break;
    case '?':
      shell.toggleHelp();
      break;
  }
}

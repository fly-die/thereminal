import { PRESETS } from '../audio/presets';
import type { Preset } from '../audio/presets';
import { NOTE_NAMES, SCALE_LABELS } from '../input/scales';
import { settings } from '../state';
import { PALETTE_KEY, selectPreset } from './commands';

// The DOM side of the interface: preset list, live controls, setup and status bar.
// Canvases (camera, ruler, scope) live in ../render.

/** What the hands are doing right now, null when no hand is visible. */
export interface LiveControls {
  note: string;
  /** Hand height as 0..1, low to high. */
  unit: number;
  timbre: number;
  open: number;
  isFist: boolean;
  /** null when there is no second hand. */
  volume: number | null;
  /** Finger pinched against the thumb (0 = index). */
  pinch: number | null;
}

interface Row {
  gesture: string;
  target: string;
  /** 0..1 for a meter, null for none. */
  value(live: LiveControls): number | null;
  text(live: LiveControls | null): string;
}

const SEGMENTS = 10;
const FINGERS = ['index', 'middle', 'ring', 'pinky'] as const;

function rowsFor(preset: Preset): Row[] {
  const volume: Row = {
    gesture: '2nd hand',
    target: 'volume',
    value: (l) => l.volume,
    text: (l) => (l && l.volume === null ? 'raise it' : ''),
  };
  const height: Row = { gesture: 'up / down', target: 'pitch', value: (l) => l.unit, text: (l) => l?.note ?? '' };
  const side: Row = { gesture: 'left / right', target: preset.timbreLabel, value: (l) => l.timbre, text: () => '' };
  if (preset.mode === 'pluck') {
    const rows: Row[] = [
      { ...height, target: 'note' },
      side,
      {
        gesture: 'pinch',
        target: 'strike',
        value: () => null,
        text: (l) => (l && l.pinch !== null ? (FINGERS[l.pinch] ?? '') : 'thumb + finger'),
      },
    ];
    if (preset.macroLabel !== preset.timbreLabel) {
      rows.push({ gesture: 'open / close', target: preset.macroLabel, value: (l) => l.open, text: () => '' });
    }
    return [...rows, volume];
  }
  return [
    height,
    side,
    { gesture: 'open / close', target: `loud + ${preset.macroLabel}`, value: (l) => l.open, text: () => '' },
    { gesture: 'fist', target: 'mute', value: () => null, text: (l) => (l?.isFist ? 'muted' : '') },
    volume,
  ];
}

const el = <T extends HTMLElement>(id: string): T => {
  const node = document.getElementById(id);
  if (!node) throw new Error(`missing element #${id}`);
  return node as T;
};

export interface StatusInfo {
  note: string;
  hands: number;
  trackFps: number;
  inferMs: number;
  outMs: number;
}

export class Panels {
  private readonly presets = el<HTMLOListElement>('presets');
  private readonly controls = el<HTMLElement>('controls');
  private readonly setup = el<HTMLElement>('setup');
  private readonly status = el<HTMLElement>('status');
  private readonly camMode = el<HTMLElement>('cam-mode');
  private rows: { row: Row; root: HTMLElement; segments: HTMLElement[]; text: HTMLElement; last: string }[] = [];
  private statusCells = new Map<string, HTMLElement>();

  constructor() {
    this.buildStatus();
    this.renderPresets();
    this.renderControls();
    this.renderSetup();
  }

  renderPresets(): void {
    this.presets.replaceChildren(
      ...PRESETS.map((preset, i) => {
        const li = document.createElement('li');
        li.setAttribute('aria-current', String(i === settings.preset));
        const key = document.createElement('kbd');
        key.textContent = String(i + 1);
        const name = document.createElement('span');
        name.textContent = preset.id;
        const mode = document.createElement('span');
        mode.className = 'mode';
        mode.textContent = preset.mode === 'pluck' ? 'pinch' : '';
        li.append(key, name, mode);
        li.addEventListener('click', () => selectPreset(i));
        return li;
      }),
    );
  }

  /** Rebuilds the gesture rows for the current preset. */
  renderControls(): void {
    const preset = PRESETS[settings.preset];
    if (!preset) return;
    this.rows = rowsFor(preset).map((row) => {
      const root = document.createElement('div');
      root.className = 'row';
      const gesture = document.createElement('span');
      gesture.textContent = row.gesture;
      const target = document.createElement('span');
      target.className = 'target';
      target.textContent = row.target;
      const meter = document.createElement('span');
      meter.className = 'meter';
      const segments = Array.from({ length: SEGMENTS }, () => document.createElement('i'));
      const text = document.createElement('em');
      text.className = 'text';
      meter.append(...segments, text);
      root.append(gesture, target, meter);
      return { row, root, segments, text, last: '' };
    });
    this.controls.replaceChildren(...this.rows.map((r) => r.root));
    this.updateControls(null);
  }

  updateControls(live: LiveControls | null): void {
    for (const r of this.rows) {
      const value = live ? r.row.value(live) : null;
      const text = r.row.text(live);
      const filled = value === null ? -1 : Math.round(value * SEGMENTS);
      const key = `${filled}|${text}`;
      if (key === r.last) continue; // nothing changed, leave the DOM alone
      r.last = key;
      r.root.dataset.live = String(value !== null || (live !== null && text !== '' && text !== 'raise it' && text !== 'thumb + finger'));
      r.segments.forEach((seg, i) => {
        seg.hidden = value === null;
        seg.classList.toggle('on', i < filled);
      });
      r.text.textContent = text;
      r.text.classList.toggle('idle', live === null || text === 'raise it' || text === 'thumb + finger');
    }
  }

  renderSetup(): void {
    const scale =
      settings.scale === 'off' ? 'off' : `${NOTE_NAMES[settings.root] ?? 'C'} ${SCALE_LABELS[settings.scale]}`;
    const octave = settings.octave === 0 ? '0' : settings.octave > 0 ? `+${settings.octave}` : String(settings.octave);
    const rows: [string, string, string][] = [
      ['scale', scale, 's / k'],
      ['octave', octave, '[ ]'],
      ['camera', settings.camera, 'v'],
      ['overlay', settings.overlay, 'h'],
      ['accent', settings.accent, 'a'],
    ];
    this.setup.replaceChildren(
      ...rows.flatMap(([label, value, key]) => {
        const dt = document.createElement('dt');
        dt.textContent = label;
        const dd = document.createElement('dd');
        dd.textContent = value;
        const hint = document.createElement('dd');
        hint.className = 'key';
        hint.textContent = key;
        return [dt, dd, hint];
      }),
    );
    this.camMode.textContent = settings.camera;
  }

  private buildStatus(): void {
    const cell = (id: string, cls = 'cell'): HTMLElement => {
      const span = document.createElement('span');
      span.className = cls;
      this.statusCells.set(id, span);
      return span;
    };
    const name = cell('name');
    name.textContent = 'thereminal';
    const keys = cell('keys', 'cell keys');
    keys.textContent = `[1-${PRESETS.length}] preset  [space] mute  [?] help  [${PALETTE_KEY}] commands`;
    const fd = document.createElement('a');
    fd.className = 'cell fd';
    fd.href = 'https://flynndiener.ch';
    fd.textContent = 'fd';
    fd.title = 'flynndiener.ch';
    this.status.append(
      name, cell('preset'), cell('scale'), cell('note', 'cell live'), cell('hands'),
      cell('fps'), cell('infer'), cell('out'), keys, fd,
    );
  }

  updateStatus(info: StatusInfo): void {
    const put = (id: string, text: string): void => {
      const node = this.statusCells.get(id);
      if (node && node.textContent !== text) node.textContent = text;
    };
    const scale =
      settings.scale === 'off' ? 'off' : `${NOTE_NAMES[settings.root] ?? 'C'} ${SCALE_LABELS[settings.scale]}`;
    put('preset', `preset ${PRESETS[settings.preset]?.id ?? ''}`);
    put('scale', `scale ${scale}`);
    put('note', settings.muted ? 'muted' : info.note || 'silent');
    put('hands', `hands ${info.hands}`);
    put('fps', `${info.trackFps.toFixed(0)}fps`);
    put('infer', `track ${info.inferMs.toFixed(0)}ms`);
    put('out', `out ${info.outMs.toFixed(0)}ms`);
  }
}

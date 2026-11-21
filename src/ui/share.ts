import { PRESETS } from '../audio/presets';
import { NOTE_NAMES, SCALE_IDS } from '../input/scales';
import type { ScaleId } from '../input/scales';
import type { Settings } from '../state';

// Shareable links: ?p=glass-pad&s=minpent&k=C&o=1
// The address bar is kept in sync, so copying it always shares the current sound.

type Shared = Pick<Settings, 'preset' | 'scale' | 'root' | 'octave'>;

/** Reads what a link asks for. Anything missing or invalid is simply left out. */
export function parseShare(params: URLSearchParams): Partial<Shared> {
  const out: Partial<Shared> = {};
  const preset = PRESETS.findIndex((p) => p.id === params.get('p'));
  if (preset >= 0) {
    out.preset = preset;
    out.scale = PRESETS[preset]?.scale; // a preset brings its scale unless the link overrides it
  }
  const scale = params.get('s');
  if (scale && (SCALE_IDS as string[]).includes(scale)) out.scale = scale as ScaleId;
  // "Fs" is accepted for F# because a raw # would start the URL fragment.
  const key = params.get('k')?.replace(/s$/i, '#').toUpperCase();
  const root = NOTE_NAMES.findIndex((n) => n === key);
  if (root >= 0) out.root = root;
  const octave = Number.parseInt(params.get('o') ?? '', 10);
  if (octave >= -2 && octave <= 2) out.octave = octave;
  return out;
}

export function formatShare(s: Shared, params = new URLSearchParams()): URLSearchParams {
  params.set('p', PRESETS[s.preset]?.id ?? '');
  params.set('s', s.scale);
  params.set('k', (NOTE_NAMES[s.root] ?? 'C').replace('#', 's'));
  if (s.octave === 0) params.delete('o');
  else params.set('o', String(s.octave));
  return params;
}

export function writeShare(s: Shared): void {
  const url = new URL(location.href);
  formatShare(s, url.searchParams);
  history.replaceState(null, '', url);
}

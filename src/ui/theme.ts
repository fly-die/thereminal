import { settings, subscribe } from '../state';

/** Colours the canvases draw with. Read from CSS so there is one source of truth. */
export interface Colors {
  bg: string;
  fg: string;
  dim: string;
  faint: string;
  line: string;
  accent: string;
  /** "r, g, b" for building rgba() strings. */
  accentRgb: string;
  fgRgb: string;
}

function toRgb(color: string): string {
  const hex = color.trim().replace('#', '');
  const full = hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex;
  const n = Number.parseInt(full, 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}

function read(): Colors {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string): string => css.getPropertyValue(name).trim();
  return {
    bg: v('--bg'),
    fg: v('--fg'),
    dim: v('--dim'),
    faint: v('--faint'),
    line: v('--line'),
    accent: v('--accent'),
    accentRgb: toRgb(v('--accent')),
    fgRgb: toRgb(v('--fg')),
  };
}

export const colors: Colors = {
  bg: '#070707', fg: '#ededea', dim: '#8a8a86', faint: '#55554f', line: '#2c2c2c',
  accent: '#6fffa0', accentRgb: '111, 255, 160', fgRgb: '237, 237, 234',
};

const themeListeners: (() => void)[] = [];
export function onThemeChange(listener: () => void): void {
  themeListeners.push(listener);
}

function apply(): void {
  const root = document.documentElement;
  root.dataset.theme = settings.theme;
  root.dataset.accent = settings.accent;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', settings.theme === 'dark' ? '#070707' : '#f4f4f1');
  Object.assign(colors, read());
  for (const listener of themeListeners) listener();
}

export function initTheme(): void {
  apply();
  subscribe((changed) => {
    if (changed === 'theme' || changed === 'accent') apply();
  });
}

export const reducedMotion = (): boolean =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

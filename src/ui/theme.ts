import { settings, subscribe } from '../state';
import { ACCENT_COLORS, THEMES, hexToRgb } from './tokens';
import type { ThemeColors } from './tokens';

/** Colours the canvases draw with, always in sync with the CSS variables. */
export interface Colors extends ThemeColors {
  accent: string;
  /** "r, g, b" for building rgba() strings. */
  accentRgb: string;
  fgRgb: string;
  dark: boolean;
}

function current(): Colors {
  const theme = THEMES[settings.theme];
  const accent = ACCENT_COLORS[settings.accent][settings.theme];
  return {
    ...theme,
    accent,
    accentRgb: hexToRgb(accent).join(', '),
    fgRgb: hexToRgb(theme.fg).join(', '),
    dark: settings.theme === 'dark',
  };
}

export const colors: Colors = current();

function apply(): void {
  Object.assign(colors, current());
  const root = document.documentElement;
  root.dataset.theme = settings.theme;
  root.dataset.accent = settings.accent;
  for (const key of ['bg', 'fg', 'dim', 'faint', 'line', 'accent'] as const) {
    root.style.setProperty(`--${key}`, colors[key]);
  }
  root.style.colorScheme = settings.theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', colors.bg);
}

export function initTheme(): void {
  apply();
  subscribe((changed) => {
    if (changed === 'theme' || changed === 'accent') apply();
  });
}

export const reducedMotion = (): boolean =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

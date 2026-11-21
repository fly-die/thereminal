import type { Accent, Theme } from '../state';

// Colour tokens, the single source of truth. theme.ts writes them to CSS variables and
// hands them to the canvases. Every text colour here is checked against WCAG AA in
// tokens.test.ts, so a tweak that breaks contrast fails the build.

export interface ThemeColors {
  bg: string;
  fg: string;
  /** Secondary text. */
  dim: string;
  /** Tertiary text such as key hints. Still readable, AA on bg. */
  faint: string;
  /** Borders and inactive meter segments. Not used for text. */
  line: string;
}

export const THEMES: Record<Theme, ThemeColors> = {
  dark: { bg: '#070707', fg: '#ededea', dim: '#9a9a95', faint: '#7a7a74', line: '#2c2c2c' },
  light: { bg: '#f4f4f1', fg: '#111111', dim: '#5a5a56', faint: '#6b6b66', line: '#cfcfca' },
};

/** The accent is only ever used for live signal. Light theme needs darker versions. */
export const ACCENT_COLORS: Record<Accent, Record<Theme, string>> = {
  green: { dark: '#6fffa0', light: '#0a7d38' },
  amber: { dark: '#ffb224', light: '#9a5b00' },
  cyan: { dark: '#5fd8ff', light: '#006f8f' },
};

export function hexToRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
}

/** WCAG 2.1 contrast ratio, 1 to 21. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
}

import { describe, expect, it } from 'vitest';
import { ACCENT_COLORS, THEMES, contrast } from './tokens';

const AA = 4.5; // WCAG AA for normal text

describe('contrast', () => {
  it('matches the reference values', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 0);
    expect(contrast('#777777', '#777777')).toBeCloseTo(1);
  });
});

describe('theme colours', () => {
  for (const theme of ['dark', 'light'] as const) {
    const t = THEMES[theme];

    it(`${theme}: all text colours pass AA on the background`, () => {
      for (const text of [t.fg, t.dim, t.faint]) expect(contrast(text, t.bg)).toBeGreaterThanOrEqual(AA);
    });

    it(`${theme}: every accent passes AA as text`, () => {
      for (const accent of Object.values(ACCENT_COLORS)) {
        expect(contrast(accent[theme], t.bg)).toBeGreaterThanOrEqual(AA);
      }
    });

    it(`${theme}: selected rows (inverted) stay readable`, () => {
      expect(contrast(t.bg, t.fg)).toBeGreaterThanOrEqual(AA);
    });
  }
});

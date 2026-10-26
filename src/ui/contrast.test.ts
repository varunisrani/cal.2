import { describe, expect, it } from 'vitest';
import { contrastRatio, parseHex, relativeLuminance } from './contrast';
import { parseTokenSheet, readTokensCss, resolveTokens } from './testing/tokenSheet';
import { ACCENT_IDS, THEMES, type AccentId, type ThemeName } from './tokens';

describe('contrastRatio', () => {
  it('is 21 for black on white, either way round', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBe(21);
    expect(contrastRatio('#fff', '#000')).toBe(21);
  });

  it('is 1 for a colour against itself', () => {
    expect(contrastRatio('#3c47b3', '#3c47b3')).toBe(1);
  });

  it('matches known pairs', () => {
    // The usual "lightest grey that passes AA on white" and its neighbour that fails.
    expect(contrastRatio('#767676', '#ffffff')).toBeCloseTo(4.54, 2);
    expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.48, 2);
    expect(contrastRatio('#808080', '#000000')).toBeCloseTo(5.32, 2);
    expect(contrastRatio('#ff0000', '#ffffff')).toBeCloseTo(4.0, 2);
    expect(contrastRatio('#0000ff', '#ffffff')).toBeCloseTo(8.59, 2);
  });
});

describe('relativeLuminance', () => {
  it('runs from 0 for black to 1 for white', () => {
    expect(relativeLuminance('#000000')).toBe(0);
    expect(relativeLuminance('#ffffff')).toBe(1);
    expect(relativeLuminance('#808080')).toBeCloseTo(0.2159, 4);
  });
});

describe('parseHex', () => {
  it('reads long and short forms in either case', () => {
    expect(parseHex('#1d7a43')).toEqual({ r: 29, g: 122, b: 67 });
    expect(parseHex('#1D7A43')).toEqual({ r: 29, g: 122, b: 67 });
    expect(parseHex('#fa0')).toEqual(parseHex('#ffaa00'));
  });

  it.each(['', '1d7a43', '#1d7a4', '#1d7a43ff', '#ggg', 'red', 'rgb(0 0 0)'])(
    'refuses %j',
    (input) => {
      expect(() => parseHex(input)).toThrow('Not an opaque hex colour');
    },
  );
});

/**
 * The token sweep (P00-03, L9): the real tokens.css in both themes with every accent. The phase
 * row's targets, with no exceptions, plus two non-text checks of ours (WCAG 1.4.11): the focus
 * ring and the success colour of goal lines must stand out at 3:1.
 */
describe('token contrast sweep', () => {
  const rules = parseTokenSheet(readTokensCss());
  const cases = THEMES.flatMap((theme) => ACCENT_IDS.map((accent) => [theme, accent] as const));

  /** The contrast between two colour roles, as resolved for one theme and accent. */
  const ratioIn = (theme: ThemeName, accent: AccentId) => {
    const tokens = resolveTokens(rules, { 'data-theme': theme, 'data-accent': accent });
    const colour = (role: string): string => {
      const value = tokens.get(`--${role}`);
      if (value === undefined) throw new Error(`--${role} is not defined for ${theme} ${accent}`);
      return value;
    };
    return (foreground: string, background: string) =>
      contrastRatio(colour(foreground), colour(background));
  };

  it.each(cases)('%s theme with %s: text at least 7:1 on every surface', (theme, accent) => {
    const ratio = ratioIn(theme, accent);
    for (const surface of ['page', 'card', 'raised', 'sheet']) {
      expect(ratio('text', surface), `text on ${surface}`).toBeGreaterThanOrEqual(7);
    }
  });

  it.each(cases)(
    '%s theme with %s: muted text at least 4.5:1 on every surface',
    (theme, accent) => {
      const ratio = ratioIn(theme, accent);
      for (const surface of ['page', 'card', 'raised', 'sheet']) {
        expect(ratio('text-muted', surface), `muted on ${surface}`).toBeGreaterThanOrEqual(4.5);
      }
    },
  );

  it.each(cases)('%s theme with %s: accent at least 3:1 against card', (theme, accent) => {
    expect(ratioIn(theme, accent)('accent', 'card')).toBeGreaterThanOrEqual(3);
  });

  it.each(cases)('%s theme with %s: accent-ink at least 4.5:1 on accent', (theme, accent) => {
    expect(ratioIn(theme, accent)('accent-ink', 'accent')).toBeGreaterThanOrEqual(4.5);
  });

  it.each(cases)('%s theme with %s: danger at least 4.5:1 on card', (theme, accent) => {
    expect(ratioIn(theme, accent)('danger', 'card')).toBeGreaterThanOrEqual(4.5);
  });

  it.each(cases)('%s theme with %s: inverse text at least 7:1 on text', (theme, accent) => {
    expect(ratioIn(theme, accent)('text-inverse', 'text')).toBeGreaterThanOrEqual(7);
  });

  it.each(cases)('%s theme with %s: focus ring and success at least 3:1', (theme, accent) => {
    const ratio = ratioIn(theme, accent);
    expect(ratio('focus', 'page'), 'focus on page').toBeGreaterThanOrEqual(3);
    expect(ratio('focus', 'card'), 'focus on card').toBeGreaterThanOrEqual(3);
    expect(ratio('success', 'card'), 'success on card').toBeGreaterThanOrEqual(3);
  });
});

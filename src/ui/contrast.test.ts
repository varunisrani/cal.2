import { describe, expect, it } from 'vitest';
import { parseTokenSheet, readTokensCss, resolveRootTokens } from '../test/tokenSheet';
import { blend, contrastRatio, parseHex, relativeLuminance, toHex } from './contrast';
import { ACCENT_IDS, type ThemeName } from './tokens';

describe('contrast maths', () => {
  it('rates black on white 21 and a colour on itself 1', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBe(21);
    expect(contrastRatio('#fff', '#000')).toBe(21);
    expect(contrastRatio('#3a7b5c', '#3a7b5c')).toBe(1);
  });

  it('gives the same ratio whichever colour comes first', () => {
    expect(contrastRatio('#204060', '#e0d0c0')).toBe(contrastRatio('#e0d0c0', '#204060'));
  });

  it('matches known pairs', () => {
    expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.48, 2);
    expect(contrastRatio('#767676', '#ffffff')).toBeCloseTo(4.54, 2);
    expect(contrastRatio('#0000ff', '#ffffff')).toBeCloseTo(8.59, 2);
    expect(contrastRatio('#ff0000', '#ffffff')).toBeCloseTo(4.0, 2);
    expect(contrastRatio('#808080', '#000000')).toBeCloseTo(5.32, 2);
  });

  it('computes relative luminance on the linear scale', () => {
    expect(relativeLuminance('#000000')).toBe(0);
    expect(relativeLuminance('#ffffff')).toBe(1);
    expect(relativeLuminance('#00ff00')).toBeCloseTo(0.7152, 4);
    // Channel 10 sits below the 0.04045 threshold, on the straight part of the curve.
    expect(relativeLuminance('#0a0a0a')).toBeCloseTo(10 / 255 / 12.92, 6);
  });

  it('reads short and long hex, with or without alpha', () => {
    expect(parseHex('#abc')).toEqual({ r: 0xaa, g: 0xbb, b: 0xcc, a: 1 });
    expect(parseHex('#abcd')).toEqual({ r: 0xaa, g: 0xbb, b: 0xcc, a: 0xdd / 255 });
    expect(parseHex('#A1B2C3')).toEqual({ r: 0xa1, g: 0xb2, b: 0xc3, a: 1 });
    expect(parseHex('#a1b2c380')).toEqual({ r: 0xa1, g: 0xb2, b: 0xc3, a: 0x80 / 255 });
    expect(toHex(parseHex('#A1B2C3'))).toBe('#a1b2c3');
  });

  it('refuses what is not a hex colour', () => {
    for (const bad of ['', 'fff', '#ff', '#fffff', '#ggg', 'rgb(0 0 0)', 'red', '#1234567']) {
      expect(() => parseHex(bad)).toThrow(RangeError);
    }
  });

  it('refuses a translucent colour until it is blended', () => {
    expect(() => contrastRatio('#00000080', '#ffffff')).toThrow(/translucent/);
    expect(() => blend('#000000', '#ffffff80')).toThrow(/translucent/);
  });

  it('blends a translucent colour over an opaque one', () => {
    expect(blend('#00000080', '#ffffff')).toBe('#7f7f7f');
    expect(blend('#ff000000', '#123456')).toBe('#123456');
    expect(blend('#abcdef', '#000000')).toBe('#abcdef');
  });
});

/** Floors from P00-03 (and the stricter ones of the tokens note), checked with no exceptions. */
const TEXT = 7;
const MUTED = 4.5;
const ACCENT_MARK = 3;
const ACCENT_TEXT = 4.5;
const ACCENT_INK = 4.5;
const DANGER = 4.5;
const NON_TEXT = 3;

const SURFACES = ['--page', '--card', '--raised', '--sheet'] as const;
const COLOUR_ROLES = [
  ...SURFACES,
  '--line',
  '--text',
  '--text-muted',
  '--text-inverse',
  '--danger',
  '--success',
  '--focus',
  '--accent',
  '--accent-ink',
  '--accent-soft',
] as const;

const rules = parseTokenSheet(await readTokensCss());
const themes: ThemeName[] = ['dark', 'light'];
const combos = themes.flatMap((theme) => ACCENT_IDS.map((accent) => ({ theme, accent })));

function coloursOf(theme: ThemeName, accent: string): Record<string, string> {
  const tokens = resolveRootTokens(rules, { 'data-theme': theme, 'data-accent': accent });
  return Object.fromEntries(COLOUR_ROLES.map((role) => [role, tokens.get(role) ?? '(missing)']));
}

/** Every pair below its floor, as readable lines; an empty list is a pass. */
function shortfalls(c: Record<string, string>, pairs: Array<[string, string, number]>): string[] {
  return pairs
    .map(([fg, bg, floor]) => ({ fg, bg, floor, ratio: contrastRatio(c[fg]!, c[bg]!) }))
    .filter(({ ratio, floor }) => ratio < floor)
    .map(({ fg, bg, floor, ratio }) => `${fg} on ${bg}: ${ratio.toFixed(2)} < ${floor}`);
}

describe('token contrast sweep', () => {
  it('defines every colour role as hex in both themes and every accent', () => {
    for (const { theme, accent } of combos) {
      for (const [role, value] of Object.entries(coloursOf(theme, accent))) {
        expect(() => parseHex(value), `${theme}/${accent} ${role} = ${value}`).not.toThrow();
      }
    }
  });

  it('keeps surfaces and inks opaque and the accent wash translucent', () => {
    for (const { theme, accent } of combos) {
      const c = coloursOf(theme, accent);
      for (const role of COLOUR_ROLES.filter((r) => r !== '--accent-soft')) {
        expect(parseHex(c[role]!).a, `${theme}/${accent} ${role}`).toBe(1);
      }
      const wash = parseHex(c['--accent-soft']!);
      expect(wash.a, `${theme}/${accent} --accent-soft`).toBeGreaterThan(0);
      expect(wash.a, `${theme}/${accent} --accent-soft`).toBeLessThan(0.5);
      expect(toHex(wash), `${theme}/${accent} --accent-soft hue`).toBe(c['--accent']);
    }
  });

  it.each(combos)('meets every floor: $theme theme, $accent accent', ({ theme, accent }) => {
    const c = coloursOf(theme, accent);
    const onSurfaces = (fg: string, floor: number): Array<[string, string, number]> =>
      SURFACES.map((bg) => [fg, bg, floor]);
    const washed = { ...c, '--accent-soft-on-card': blend(c['--accent-soft']!, c['--card']!) };
    expect(
      shortfalls(washed, [
        // Required by P00-03, on every surface (the row names page and card).
        ...onSurfaces('--text', TEXT),
        ...onSurfaces('--text-muted', MUTED),
        ...onSurfaces('--accent', ACCENT_MARK),
        ['--accent-ink', '--accent', ACCENT_INK],
        ...onSurfaces('--danger', DANGER),
        // Ours: accent words, inverse text, focus ring, goal lines, a filled track on its wash.
        ...onSurfaces('--accent', ACCENT_TEXT),
        ['--text-inverse', '--text', TEXT],
        ['--focus', '--page', NON_TEXT],
        ['--focus', '--card', NON_TEXT],
        ['--success', '--card', NON_TEXT],
        ['--accent', '--accent-soft-on-card', NON_TEXT],
      ]),
    ).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
import { t } from '../i18n/t';
import {
  parseTokenSheet,
  readProductFile,
  readTokensCss,
  resolveTokens,
} from './testing/tokenSheet';
import {
  ACCENT_IDS,
  ACCENT_LABEL_KEYS,
  DEFAULT_ACCENT,
  isAccentId,
  PAGE_COLOURS,
  THEMES,
  type AccentId,
  type ThemeName,
} from './tokens';

const tokensCss = readTokensCss();
const rules = parseTokenSheet(tokensCss);

const COLOUR_ROLES = [
  '--page',
  '--card',
  '--raised',
  '--sheet',
  '--line',
  '--text',
  '--text-muted',
  '--text-inverse',
  '--danger',
  '--success',
  '--focus',
];

const ACCENT_PROPERTIES = ['--accent', '--accent-ink', '--accent-soft'];

const tokensFor = (theme: ThemeName, accent: AccentId) =>
  resolveTokens(rules, { 'data-theme': theme, 'data-accent': accent });

const rootTokens = resolveTokens(rules, {});

/** A length token in px (rem at the browser default of 16 px). */
function px(value: string | undefined): number {
  const match = /^(\d+(?:\.\d+)?)(px|rem)$/.exec(value ?? '');
  if (!match) throw new Error(`not a px or rem length: ${value}`);
  return Number(match[1]) * (match[2] === 'rem' ? 16 : 1);
}

describe('accent presets', () => {
  it('has six presets in picker order with basil as the default', () => {
    expect(ACCENT_IDS).toEqual(['basil', 'saffron', 'lagoon', 'beet', 'ember', 'ink']);
    expect(DEFAULT_ACCENT).toBe('basil');
  });

  it('recognises only its own ids', () => {
    for (const id of ACCENT_IDS) expect(isAccentId(id)).toBe(true);
    for (const other of ['', 'Basil', 'pink', 'toString', undefined, null, 3]) {
      expect(isAccentId(other)).toBe(false);
    }
  });

  it('names every preset through the catalogue', () => {
    expect(ACCENT_IDS.map((id) => t(ACCENT_LABEL_KEYS[id]))).toEqual([
      'Basil',
      'Saffron',
      'Lagoon',
      'Beet',
      'Ember',
      'Ink',
    ]);
  });

  it.each(ACCENT_IDS)('has a dark and a light block for %s in tokens.css', (id) => {
    const block = (selector: string) => rules.find((rule) => rule.selectors.includes(selector));
    const dark = block(`[data-accent='${id}']`);
    const light = block(`[data-theme='light'][data-accent='${id}']`);
    expect([...(dark?.declarations.keys() ?? [])].sort()).toEqual(ACCENT_PROPERTIES);
    expect([...(light?.declarations.keys() ?? [])].sort()).toEqual(ACCENT_PROPERTIES);
  });

  it.each(THEMES)('gives every preset its own accent colour in the %s theme', (theme) => {
    const accents = ACCENT_IDS.map((id) => tokensFor(theme, id).get('--accent'));
    expect(new Set(accents).size).toBe(ACCENT_IDS.length);
  });
});

describe('themes', () => {
  it.each(THEMES)('defines every colour role in the %s theme', (theme) => {
    const tokens = tokensFor(theme, DEFAULT_ACCENT);
    for (const role of COLOUR_ROLES) expect(tokens.get(role), role).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('gives the two themes different colours for every role', () => {
    const dark = tokensFor('dark', DEFAULT_ACCENT);
    const light = tokensFor('light', DEFAULT_ACCENT);
    for (const role of COLOUR_ROLES) expect(dark.get(role), role).not.toBe(light.get(role));
  });

  it.each(THEMES)('keeps PAGE_COLOURS equal to --page in the %s theme', (theme) => {
    expect(tokensFor(theme, DEFAULT_ACCENT).get('--page')).toBe(PAGE_COLOURS[theme]);
  });

  it('starts index.html with the dark page colour as its theme-color', () => {
    const meta = /<meta name="theme-color" content="([^"]+)"/.exec(readProductFile('index.html'));
    expect(meta?.[1]).toBe(PAGE_COLOURS.dark);
  });

  it('shows dark with basil when the root has no attributes', () => {
    expect(rootTokens).toEqual(tokensFor('dark', 'basil'));
  });

  it('falls back to basil in the light theme when the accent is missing or unknown', () => {
    const lightBasil = tokensFor('light', 'basil');
    expect(resolveTokens(rules, { 'data-theme': 'light' })).toEqual(lightBasil);
    expect(resolveTokens(rules, { 'data-theme': 'light', 'data-accent': 'pink' })).toEqual(
      lightBasil,
    );
    expect(resolveTokens(rules, { 'data-accent': 'pink' })).toEqual(rootTokens);
  });
});

describe('scales', () => {
  it('has the four radii', () => {
    expect(
      ['control', 'card', 'sheet', 'pill'].map((name) => px(rootTokens.get(`--radius-${name}`))),
    ).toEqual([12, 18, 24, 999]);
  });

  it('has the spacing steps 4 to 32', () => {
    const steps = [...rootTokens].filter(([name]) => name.startsWith('--space-'));
    expect(steps.map(([, value]) => px(value))).toEqual([4, 8, 12, 16, 20, 24, 32]);
  });

  it('keeps every type size between 11 and 48 px, from 11 up to 48', () => {
    const sizes = [...rootTokens]
      .filter(([name]) => name.startsWith('--type-'))
      .map(([, value]) => px(value));
    expect(Math.min(...sizes)).toBe(11);
    expect(Math.max(...sizes)).toBe(48);
    expect(sizes).toEqual([...sizes].sort((a, b) => a - b));
  });

  it('uses the system font stack and no web fonts', () => {
    expect(rootTokens.get('--font-sans')).toMatch(/^system-ui,/);
    expect(tokensCss).not.toMatch(/@font-face|@import|url\(/);
  });

  it('has safe-area insets for all four edges', () => {
    for (const edge of ['top', 'right', 'bottom', 'left']) {
      expect(rootTokens.get(`--safe-${edge}`)).toBe(`env(safe-area-inset-${edge}, 0px)`);
    }
  });

  it('uses solid colours only: no gradients', () => {
    expect(tokensCss).not.toMatch(/gradient\(/);
  });
});

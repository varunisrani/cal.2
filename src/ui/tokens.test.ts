import { describe, expect, it } from 'vitest';
import indexHtml from '../../index.html?raw';
import { t } from '../i18n/t';
import { parseTokenSheet, readTokensCss, resolveRootTokens } from '../test/tokenSheet';
import {
  ACCENT_IDS,
  ACCENT_LABEL_KEYS,
  DEFAULT_ACCENT,
  isAccentId,
  PAGE_COLOURS,
  type ThemeName,
} from './tokens';
const tokensCss = await readTokensCss();
const rules = parseTokenSheet(tokensCss);
const themes: ThemeName[] = ['dark', 'light'];
const rootTokens = (attributes: Record<string, string> = {}) =>
  resolveRootTokens(rules, attributes);
const px = (value: string | undefined): number => {
  const m = /^(\d+(?:\.\d+)?)(px|rem)$/.exec(value ?? '');
  if (!m) throw new Error(`"${value}" is not a px or rem length`);
  return Number(m[1]) * (m[2] === 'rem' ? 16 : 1);
};

describe('accent presets', () => {
  it('has Orange (D-16.90) and the six presets of D-16.1 in picker order, Orange first and default', () => {
    expect(ACCENT_IDS).toEqual(['orange', 'basil', 'saffron', 'lagoon', 'beet', 'ember', 'ink']);
    expect(new Set(ACCENT_IDS).size).toBe(7);
    expect(DEFAULT_ACCENT).toBe('orange');
  });

  it('names every preset through the catalogue, each name distinct', () => {
    expect(Object.keys(ACCENT_LABEL_KEYS)).toEqual([...ACCENT_IDS]);
    const names = ACCENT_IDS.map((id) => t(ACCENT_LABEL_KEYS[id]));
    expect(names).toEqual(['Orange', 'Basil', 'Saffron', 'Lagoon', 'Beet', 'Ember', 'Ink']);
  });

  it('tells preset ids from other values', () => {
    for (const id of ACCENT_IDS) expect(isAccentId(id)).toBe(true);
    for (const other of ['', 'Orange', 'Basil', 'pink', 'toString', undefined, 3]) {
      expect(isAccentId(other)).toBe(false);
    }
  });

  it('has a [data-accent] block in tokens.css for every id, in both themes', () => {
    const selectors = rules.flatMap((r) => r.selectors);
    for (const id of ACCENT_IDS) {
      expect(selectors).toContain(`[data-accent='${id}']`);
      expect(selectors).toContain(`[data-theme='light'][data-accent='${id}']`);
    }
  });

  it('gives each preset its own accent colour in each theme', () => {
    for (const theme of themes) {
      const accents = ACCENT_IDS.map((id) =>
        rootTokens({ 'data-theme': theme, 'data-accent': id }).get('--accent')!,
      );
      expect(new Set(accents).size).toBe(ACCENT_IDS.length);
    }
  });
});

describe('tokens.css', () => {
  it('defaults to the dark theme with the Orange accent when the root has no attributes', () => {
    const bare = Object.fromEntries(rootTokens());
    expect(bare).toEqual(
      Object.fromEntries(rootTokens({ 'data-theme': 'dark', 'data-accent': 'orange' })),
    );
    expect(bare['color-scheme']).toBe('dark');
    expect(rootTokens({ 'data-theme': 'light' }).get('color-scheme')).toBe('light');
  });

  it('shows Orange on the light theme when no accent is set', () => {
    expect(Object.fromEntries(rootTokens({ 'data-theme': 'light' }))).toEqual(
      Object.fromEntries(rootTokens({ 'data-theme': 'light', 'data-accent': 'orange' })),
    );
  });

  it('keeps every light surface white, so the light orange holds 4.5:1 on all of them', () => {
    const light = rootTokens({ 'data-theme': 'light' });
    for (const surface of ['--page', '--card', '--raised', '--sheet']) {
      expect(light.get(surface), surface).toBe('#ffffff');
    }
    expect(light.get('--accent-ink')).toBe('#ffffff');
  });

  it('has the radii 14, 22, 28 and 999', () => {
    const tokens = rootTokens();
    expect(
      ['control', 'card', 'sheet', 'pill'].map((r) => px(tokens.get(`--radius-${r}`))),
    ).toEqual([14, 22, 28, 999]);
  });

  it('has the spacing steps 4 to 32', () => {
    const tokens = rootTokens();
    const steps = [...tokens].filter(([name]) => name.startsWith('--space-'));
    expect(steps.map(([, value]) => px(value))).toEqual([4, 8, 12, 16, 20, 24, 32]);
    for (const [name, value] of steps) expect(px(value)).toBe(4 * Number(name.slice(8)));
  });

  it('sizes type from 11 to 48 px in rem, so the browser text size applies', () => {
    const sizes = [...rootTokens()].filter(([name]) => name.startsWith('--type-'));
    for (const [, value] of sizes) expect(value).toMatch(/rem$/);
    const pixels = sizes.map(([, value]) => px(value));
    expect(Math.min(...pixels)).toBe(11);
    expect(Math.max(...pixels)).toBe(48);
    expect([...pixels].sort((a, b) => a - b)).toEqual(pixels);
  });

  it('uses the system font stack and no web font', () => {
    expect(rootTokens().get('--font-sans')).toMatch(/^system-ui, -apple-system,.*sans-serif/);
    expect(tokensCss).not.toMatch(/@font-face|@import|url\(/);
  });

  it('exposes the four safe-area insets', () => {
    const tokens = rootTokens();
    for (const side of ['top', 'right', 'bottom', 'left']) {
      expect(tokens.get(`--safe-${side}`)).toBe(`env(safe-area-inset-${side}, 0px)`);
    }
  });

  it('has shadows, motion and stacking layers, with a dialog above a sheet', () => {
    const tokens = rootTokens();
    for (const name of ['--shadow-card', '--shadow-raised', '--shadow-sheet', '--scrim']) {
      expect(tokens.get(name)).toBeTruthy();
    }
    const z = (name: string) => Number(tokens.get(`--z-${name}`));
    expect(z('sheet')).toBeGreaterThan(z('scrim'));
    expect(z('dialog')).toBeGreaterThan(z('sheet'));
    expect(z('toast')).toBeGreaterThan(z('dialog'));
    expect(z('scrim')).toBeGreaterThan(z('tabbar'));
  });

  it('cuts every motion duration to 1 ms under reduced motion', () => {
    const reduced = resolveRootTokens(rules, {}, { media: (c) => c.includes('reduced-motion') });
    const durations = [...rootTokens()].filter(([name]) => name.startsWith('--motion-'));
    expect(durations.length).toBeGreaterThan(0);
    for (const [name, value] of durations) {
      expect(value).toMatch(/^\d+ms$/);
      expect(reduced.get(name)).toBe('1ms');
    }
  });

  it('draws with solid colours only (no gradients, D-16.1)', () => {
    expect(tokensCss).not.toMatch(/gradient\(/i);
  });
});

describe('page colours', () => {
  it('match --page of each theme in tokens.css', () => {
    for (const theme of themes) {
      expect(rootTokens({ 'data-theme': theme }).get('--page')).toBe(PAGE_COLOURS[theme]);
    }
  });

  it('start index.html with the dark page colour as the theme colour', () => {
    const meta = /<meta name="theme-color" content="([^"]+)"/.exec(indexHtml);
    expect(meta?.[1]).toBe(PAGE_COLOURS.dark);
  });
});

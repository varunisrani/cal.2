import type { TKey } from '../i18n/t';

/**
 * The accent presets of tokens.css (D-16.1, D-16.90), in the order the accent picker shows them:
 * Orange, the brand, first. Each id is the value of `data-accent` on <html> and of the
 * `display.accent` setting.
 */
export const ACCENT_IDS = ['orange', 'basil', 'saffron', 'lagoon', 'beet', 'ember', 'ink'] as const;

export type AccentId = (typeof ACCENT_IDS)[number];

export const DEFAULT_ACCENT: AccentId = 'orange';

/** The catalogue key of each preset's name, for the picker's labels. */
export const ACCENT_LABEL_KEYS: Readonly<Record<AccentId, TKey>> = {
  orange: 'appearance.accent.orange',
  basil: 'appearance.accent.basil',
  saffron: 'appearance.accent.saffron',
  lagoon: 'appearance.accent.lagoon',
  beet: 'appearance.accent.beet',
  ember: 'appearance.accent.ember',
  ink: 'appearance.accent.ink',
};

export function isAccentId(value: unknown): value is AccentId {
  return typeof value === 'string' && (ACCENT_IDS as readonly string[]).includes(value);
}

/** The two colour themes of tokens.css; `data-theme` on <html> holds one of them. */
export type ThemeName = 'dark' | 'light';

/**
 * `--page` of each theme, for `<meta name="theme-color">`. Kept equal to tokens.css by
 * tokens.test.ts, so the browser bars match the page even before the stylesheet has loaded.
 */
export const PAGE_COLOURS: Readonly<Record<ThemeName, string>> = {
  dark: '#131313',
  light: '#ffffff',
};

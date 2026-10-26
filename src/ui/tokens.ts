import type { TKey } from '../i18n/t';

/** The six accent presets (D-16.1), in the order the accent picker shows them. */
export const ACCENT_IDS = ['basil', 'saffron', 'lagoon', 'beet', 'ember', 'ink'] as const;

export type AccentId = (typeof ACCENT_IDS)[number];

export const DEFAULT_ACCENT: AccentId = 'basil';

/** The catalogue key of each preset's name, for the accent picker. */
export const ACCENT_LABEL_KEYS = {
  basil: 'appearance.accent.basil',
  saffron: 'appearance.accent.saffron',
  lagoon: 'appearance.accent.lagoon',
  beet: 'appearance.accent.beet',
  ember: 'appearance.accent.ember',
  ink: 'appearance.accent.ink',
} as const satisfies Record<AccentId, TKey>;

export function isAccentId(value: unknown): value is AccentId {
  return typeof value === 'string' && (ACCENT_IDS as readonly string[]).includes(value);
}

/** The two colour sets of tokens.css; dark is the default. */
export const THEMES = ['dark', 'light'] as const;

export type ThemeName = (typeof THEMES)[number];

/**
 * Each theme's `--page` colour, for the browser's theme-color meta. Must equal the value in
 * tokens.css (tokens.test.ts checks it).
 */
export const PAGE_COLOURS: Readonly<Record<ThemeName, string>> = {
  dark: '#0b1210',
  light: '#f3f6f1',
};

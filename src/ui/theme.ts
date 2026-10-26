import type { TKey } from '../i18n/t';
import { DEFAULT_ACCENT, isAccentId, PAGE_COLOURS, type AccentId, type ThemeName } from './tokens';

/** The person's appearance choice; System follows the device. */
export type Appearance = 'system' | 'light' | 'dark';

export const APPEARANCES: readonly Appearance[] = ['system', 'light', 'dark'];

/** The catalogue key of each appearance choice's name, for the picker's labels. */
export const APPEARANCE_LABEL_KEYS: Readonly<Record<Appearance, TKey>> = {
  system: 'appearance.mode.system',
  light: 'appearance.mode.light',
  dark: 'appearance.mode.dark',
};

export interface ThemeChoice {
  appearance: Appearance;
  accent: AccentId;
}

/** What a new install shows: follow the device, Basil accent. */
export const DEFAULT_THEME: Readonly<ThemeChoice> = {
  appearance: 'system',
  accent: DEFAULT_ACCENT,
};

/** The query whose `matches` says the device prefers a dark scheme. */
export const PREFERS_DARK_QUERY = '(prefers-color-scheme: dark)';

type SchemeListener = (event: { readonly matches: boolean }) => void;

/** The part of a `MediaQueryList` the theme runtime uses (a real one fits; tests pass a fake). */
export interface SchemeQuery {
  readonly matches: boolean;
  addEventListener(type: 'change', listener: SchemeListener): void;
  removeEventListener(type: 'change', listener: SchemeListener): void;
}

export function isAppearance(value: unknown): value is Appearance {
  return typeof value === 'string' && (APPEARANCES as readonly string[]).includes(value);
}

/**
 * The colour theme an appearance shows. `prefersDark` is the device preference, or `undefined`
 * when the browser cannot tell; System then shows dark, the app's default.
 */
export function resolveTheme(appearance: Appearance, prefersDark: boolean | undefined): ThemeName {
  if (appearance === 'light' || appearance === 'dark') return appearance;
  return prefersDark === false ? 'light' : 'dark';
}

function deviceQuery(): SchemeQuery | null {
  return typeof matchMedia === 'function' ? matchMedia(PREFERS_DARK_QUERY) : null;
}

/** Sets every `<meta name="theme-color">` to `colour`, adding one to `<head>` if there is none. */
function setThemeColour(doc: Document, colour: string): void {
  const metas = doc.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]');
  if (metas.length === 0) {
    const meta = doc.createElement('meta');
    meta.name = 'theme-color';
    meta.content = colour;
    doc.head.append(meta);
    return;
  }
  for (const meta of metas) meta.content = colour;
}

/**
 * Shows `choice` on the page: `data-theme` and `data-accent` on `root`, and the page colour in
 * `<meta name="theme-color">`. With System the theme follows `media` (the device's dark-scheme
 * query) live until the returned function is called; Light and Dark ignore it. Call the returned
 * function before applying another choice. An unknown appearance or accent (old or hand-edited
 * storage) shows the default one.
 */
export function applyTheme(
  choice: Readonly<ThemeChoice>,
  root: HTMLElement = document.documentElement,
  media: SchemeQuery | null = deviceQuery(),
): () => void {
  const appearance = isAppearance(choice.appearance) ? choice.appearance : DEFAULT_THEME.appearance;
  const accent = isAccentId(choice.accent) ? choice.accent : DEFAULT_ACCENT;
  const show = (prefersDark: boolean | undefined): void => {
    const theme = resolveTheme(appearance, prefersDark);
    root.dataset.theme = theme;
    root.dataset.accent = accent;
    setThemeColour(root.ownerDocument, PAGE_COLOURS[theme]);
  };

  show(media?.matches);
  if (appearance !== 'system' || !media) return () => {};

  let listening = true;
  const onChange: SchemeListener = (event) => {
    if (listening) show(event.matches);
  };
  media.addEventListener('change', onChange);
  return () => {
    listening = false;
    media.removeEventListener('change', onChange);
  };
}

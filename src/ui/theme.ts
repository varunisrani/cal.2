import type { TKey } from '../i18n/t';
import { DEFAULT_ACCENT, isAccentId, PAGE_COLOURS, type AccentId, type ThemeName } from './tokens';

/** The appearance setting: follow the operating system, or a fixed theme. */
export const APPEARANCES = ['system', 'light', 'dark'] as const;

export type Appearance = (typeof APPEARANCES)[number];

/** The catalogue key of each appearance's name, for the appearance picker. */
export const APPEARANCE_LABEL_KEYS = {
  system: 'appearance.mode.system',
  light: 'appearance.mode.light',
  dark: 'appearance.mode.dark',
} as const satisfies Record<Appearance, TKey>;

export interface ThemeChoice {
  readonly appearance: Appearance;
  readonly accent: AccentId;
}

/** What a new install shows until the person picks something else. */
export const DEFAULT_THEME: ThemeChoice = { appearance: 'system', accent: DEFAULT_ACCENT };

/** The media query System follows. A browser with no preference reports light. */
export const SYSTEM_DARK_QUERY = '(prefers-color-scheme: dark)';

/** The theme shown for an appearance, given whether the operating system is in dark mode. */
export function resolveTheme(appearance: Appearance, systemIsDark: boolean): ThemeName {
  if (appearance === 'light' || appearance === 'dark') return appearance;
  return systemIsDark ? 'dark' : 'light';
}

/** The operating system's colour-scheme query, or undefined where `matchMedia` is missing. */
export function systemSchemeQuery(): MediaQueryList | undefined {
  return typeof globalThis.matchMedia === 'function'
    ? globalThis.matchMedia(SYSTEM_DARK_QUERY)
    : undefined;
}

/** The stop function of the latest applyTheme() on each root. */
const activeOnRoot = new WeakMap<Element, () => void>();

/**
 * Puts a theme choice on the page: `data-theme` (dark or light) and `data-accent` on `root`,
 * and the theme's page colour in the document's theme-color meta. Light and Dark are fixed;
 * System follows `media` and keeps listening until the returned function is called. A new call
 * on the same root stops the previous call's listening first. Without `media` (no
 * `matchMedia`), System shows dark, the app's default.
 */
export function applyTheme(
  choice: ThemeChoice,
  root: HTMLElement = document.documentElement,
  media: MediaQueryList | undefined = systemSchemeQuery(),
): () => void {
  activeOnRoot.get(root)?.();
  root.setAttribute('data-accent', isAccentId(choice.accent) ? choice.accent : DEFAULT_ACCENT);

  const show = (theme: ThemeName) => {
    root.setAttribute('data-theme', theme);
    setThemeColour(root.ownerDocument, PAGE_COLOURS[theme]);
  };
  const follows = choice.appearance !== 'light' && choice.appearance !== 'dark';
  show(resolveTheme(choice.appearance, media?.matches ?? true));
  if (!follows || !media) return () => {};

  const onChange = () => show(resolveTheme('system', media.matches));
  media.addEventListener('change', onChange);
  const stop = () => {
    media.removeEventListener('change', onChange);
    if (activeOnRoot.get(root) === stop) activeOnRoot.delete(root);
  };
  activeOnRoot.set(root, stop);
  return stop;
}

/** Sets every theme-color meta of the document, adding one to the head when there is none. */
function setThemeColour(doc: Document, colour: string): void {
  const metas = [...doc.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')];
  if (metas.length === 0) {
    const meta = doc.createElement('meta');
    meta.name = 'theme-color';
    (doc.head ?? doc.documentElement).append(meta);
    metas.push(meta);
  }
  for (const meta of metas) meta.content = colour;
}

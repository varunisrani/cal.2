import { afterEach, describe, expect, it, vi } from 'vitest';
import { t } from '../i18n/t';
import {
  APPEARANCE_LABEL_KEYS,
  APPEARANCES,
  applyTheme,
  DEFAULT_THEME,
  resolveTheme,
  SYSTEM_DARK_QUERY,
  type Appearance,
} from './theme';
import { PAGE_COLOURS, type AccentId } from './tokens';

/** A stand-in for `matchMedia('(prefers-color-scheme: dark)')` that a test can flip. */
function fakeSchemeQuery(dark: boolean) {
  const listeners = new Set<EventListener>();
  const query = {
    media: SYSTEM_DARK_QUERY,
    matches: dark,
    addEventListener: (type: string, listener: EventListener) => {
      if (type === 'change') listeners.add(listener);
    },
    removeEventListener: (type: string, listener: EventListener) => {
      if (type === 'change') listeners.delete(listener);
    },
  };
  return {
    query: query as unknown as MediaQueryList,
    listenerCount: () => listeners.size,
    /** The operating system switches its colour scheme. */
    turn(scheme: 'dark' | 'light') {
      query.matches = scheme === 'dark';
      for (const listener of [...listeners]) listener(new Event('change'));
    },
  };
}

/** A fresh document with a theme-color meta, like index.html. */
function page(withMeta = true) {
  const doc = document.implementation.createHTMLDocument('test');
  if (withMeta) {
    const meta = doc.createElement('meta');
    meta.name = 'theme-color';
    meta.content = '#123456';
    doc.head.append(meta);
  }
  const root = doc.documentElement;
  const themeColour = () =>
    doc.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.content ?? null;
  return { doc, root, themeColour };
}

const choice = (appearance: Appearance, accent: AccentId = 'basil') => ({ appearance, accent });

describe('applyTheme', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('follows the operating system live in System mode', () => {
    const { root, themeColour } = page();
    const os = fakeSchemeQuery(true);
    applyTheme(choice('system'), root, os.query);
    expect(root.dataset.theme).toBe('dark');

    os.turn('light');
    expect(root.dataset.theme).toBe('light');
    expect(themeColour()).toBe(PAGE_COLOURS.light);

    os.turn('dark');
    expect(root.dataset.theme).toBe('dark');
    expect(themeColour()).toBe(PAGE_COLOURS.dark);
  });

  it('starts from the current operating system scheme in System mode', () => {
    const { root } = page();
    applyTheme(choice('system'), root, fakeSchemeQuery(false).query);
    expect(root.dataset.theme).toBe('light');
  });

  it('keeps Light when the operating system turns dark, and listens to nothing', () => {
    const { root, themeColour } = page();
    const os = fakeSchemeQuery(false);
    applyTheme(choice('light'), root, os.query);
    os.turn('dark');
    expect(root.dataset.theme).toBe('light');
    expect(themeColour()).toBe(PAGE_COLOURS.light);
    expect(os.listenerCount()).toBe(0);
  });

  it('keeps Dark when the operating system turns light, and listens to nothing', () => {
    const { root, themeColour } = page();
    const os = fakeSchemeQuery(true);
    applyTheme(choice('dark'), root, os.query);
    os.turn('light');
    expect(root.dataset.theme).toBe('dark');
    expect(themeColour()).toBe(PAGE_COLOURS.dark);
    expect(os.listenerCount()).toBe(0);
  });

  it('sets the accent, and basil for an id that is not a preset', () => {
    const { root } = page();
    applyTheme(choice('dark', 'ember'), root, fakeSchemeQuery(true).query);
    expect(root.dataset.accent).toBe('ember');
    applyTheme({ appearance: 'dark', accent: 'pink' as AccentId }, root, undefined);
    expect(root.dataset.accent).toBe('basil');
  });

  it('puts the page colour of the theme in use in the theme-color meta', () => {
    const { root, themeColour } = page();
    applyTheme(choice('light'), root, fakeSchemeQuery(true).query);
    expect(themeColour()).toBe(PAGE_COLOURS.light);
    applyTheme(choice('dark'), root, fakeSchemeQuery(true).query);
    expect(themeColour()).toBe(PAGE_COLOURS.dark);
  });

  it('adds a theme-color meta when the page has none', () => {
    const { doc, root, themeColour } = page(false);
    applyTheme(choice('light'), root, fakeSchemeQuery(true).query);
    expect(themeColour()).toBe(PAGE_COLOURS.light);
    expect(doc.head.querySelectorAll('meta[name="theme-color"]')).toHaveLength(1);
  });

  it('stops following the operating system once unsubscribed', () => {
    const { root, themeColour } = page();
    const os = fakeSchemeQuery(true);
    const stop = applyTheme(choice('system'), root, os.query);
    expect(os.listenerCount()).toBe(1);

    stop();
    os.turn('light');
    expect(root.dataset.theme).toBe('dark');
    expect(themeColour()).toBe(PAGE_COLOURS.dark);
    expect(os.listenerCount()).toBe(0);
    expect(() => stop()).not.toThrow();
  });

  it('replaces the listening of an earlier call on the same root', () => {
    const { root } = page();
    const os = fakeSchemeQuery(true);
    applyTheme(choice('system'), root, os.query);
    applyTheme(choice('system', 'ink'), root, os.query);
    expect(os.listenerCount()).toBe(1);

    applyTheme(choice('light'), root, os.query);
    expect(os.listenerCount()).toBe(0);
    os.turn('dark');
    expect(root.dataset.theme).toBe('light');
  });

  it('shows dark in System mode where matchMedia is missing', () => {
    vi.stubGlobal('matchMedia', undefined);
    const { root, themeColour } = page();
    applyTheme(choice('system'), root);
    expect(root.dataset.theme).toBe('dark');
    expect(themeColour()).toBe(PAGE_COLOURS.dark);
  });

  it('uses the browser colour-scheme query by default', () => {
    const os = fakeSchemeQuery(false);
    const matchMedia = vi.fn(() => os.query);
    vi.stubGlobal('matchMedia', matchMedia);
    const { root } = page();
    applyTheme(choice('system'), root);
    expect(matchMedia).toHaveBeenCalledWith('(prefers-color-scheme: dark)');
    expect(root.dataset.theme).toBe('light');
    os.turn('dark');
    expect(root.dataset.theme).toBe('dark');
  });
});

describe('resolveTheme', () => {
  it.each([
    ['system', true, 'dark'],
    ['system', false, 'light'],
    ['light', true, 'light'],
    ['light', false, 'light'],
    ['dark', true, 'dark'],
    ['dark', false, 'dark'],
  ] as const)('%s with the system dark=%s shows %s', (appearance, systemIsDark, theme) => {
    expect(resolveTheme(appearance, systemIsDark)).toBe(theme);
  });
});

describe('appearance choices', () => {
  it('defaults to System with basil', () => {
    expect(DEFAULT_THEME).toEqual({ appearance: 'system', accent: 'basil' });
  });

  it('names every appearance through the catalogue', () => {
    expect(APPEARANCES.map((appearance) => t(APPEARANCE_LABEL_KEYS[appearance]))).toEqual([
      'System',
      'Light',
      'Dark',
    ]);
  });
});

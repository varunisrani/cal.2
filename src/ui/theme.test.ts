import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { t } from '../i18n/t';
import {
  APPEARANCE_LABEL_KEYS,
  APPEARANCES,
  applyTheme,
  DEFAULT_THEME,
  resolveTheme,
  type Appearance,
  type SchemeQuery,
  type ThemeChoice,
} from './theme';
import { PAGE_COLOURS, type AccentId } from './tokens';

/** A device dark-mode query the test can flip, like a phone switching at sunset. */
class FakeSchemeQuery implements SchemeQuery {
  private readonly listeners = new Set<(event: { matches: boolean }) => void>();
  constructor(public matches: boolean) {}
  addEventListener(_type: 'change', listener: (event: { matches: boolean }) => void): void {
    this.listeners.add(listener);
  }
  removeEventListener(_type: 'change', listener: (event: { matches: boolean }) => void): void {
    this.listeners.delete(listener);
  }
  get listenerCount(): number {
    return this.listeners.size;
  }
  /** The device changes its scheme; listeners hear about it. */
  flip(matches: boolean): void {
    this.matches = matches;
    for (const listener of this.listeners) listener({ matches });
  }
}

const root = document.documentElement;
const themeColours = (): string[] =>
  [...document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')].map((m) => m.content);
const choice = (appearance: Appearance, accent: AccentId = 'basil'): ThemeChoice => ({
  appearance,
  accent,
});

beforeEach(() => {
  delete root.dataset.theme;
  delete root.dataset.accent;
  document.head.innerHTML = '<meta name="theme-color" content="#000000" />';
});

afterEach(() => {
  document.head.innerHTML = '';
});

describe('applyTheme', () => {
  it('sets the theme, the accent and the theme colour', () => {
    applyTheme(choice('light', 'ember'), root, new FakeSchemeQuery(true));
    expect(root.dataset.theme).toBe('light');
    expect(root.dataset.accent).toBe('ember');
    expect(themeColours()).toEqual([PAGE_COLOURS.light]);
  });

  it('in System mode a device theme change applies without a reload', () => {
    const device = new FakeSchemeQuery(true);
    applyTheme(choice('system', 'lagoon'), root, device);
    expect(root.dataset.theme).toBe('dark');
    expect(themeColours()).toEqual([PAGE_COLOURS.dark]);

    device.flip(false);
    expect(root.dataset.theme).toBe('light');
    expect(themeColours()).toEqual([PAGE_COLOURS.light]);
    expect(root.dataset.accent).toBe('lagoon');

    device.flip(true);
    expect(root.dataset.theme).toBe('dark');
    expect(themeColours()).toEqual([PAGE_COLOURS.dark]);
  });

  it('starts System light on a light device', () => {
    applyTheme(choice('system'), root, new FakeSchemeQuery(false));
    expect(root.dataset.theme).toBe('light');
  });

  it.each(['light', 'dark'] as const)('keeps %s whatever the device does', (appearance) => {
    const device = new FakeSchemeQuery(appearance === 'light');
    applyTheme(choice(appearance), root, device);
    expect(device.listenerCount).toBe(0);
    device.flip(!device.matches);
    device.flip(!device.matches);
    expect(root.dataset.theme).toBe(appearance);
    expect(themeColours()).toEqual([PAGE_COLOURS[appearance]]);
  });

  it('stops following the device once unsubscribed', () => {
    const device = new FakeSchemeQuery(true);
    const stop = applyTheme(choice('system'), root, device);
    expect(device.listenerCount).toBe(1);
    stop();
    expect(device.listenerCount).toBe(0);
    device.flip(false);
    expect(root.dataset.theme).toBe('dark');
    expect(themeColours()).toEqual([PAGE_COLOURS.dark]);
    expect(() => stop()).not.toThrow();
  });

  it('ignores a change the browser had already queued before the unsubscribe', () => {
    let queued: ((event: { matches: boolean }) => void) | undefined;
    const device: SchemeQuery = {
      matches: true,
      addEventListener: (_type, listener) => {
        queued = listener;
      },
      removeEventListener: () => {},
    };
    applyTheme(choice('system'), root, device)();
    queued!({ matches: false });
    expect(root.dataset.theme).toBe('dark');
  });

  it('hands over cleanly when a new choice replaces System', () => {
    const device = new FakeSchemeQuery(true);
    const stop = applyTheme(choice('system'), root, device);
    stop();
    applyTheme(choice('light', 'ink'), root, device);
    device.flip(true);
    expect(root.dataset.theme).toBe('light');
    expect(root.dataset.accent).toBe('ink');
  });

  it('adds a theme-color meta when the page has none', () => {
    document.head.innerHTML = '';
    applyTheme(choice('dark'), root, null);
    expect(themeColours()).toEqual([PAGE_COLOURS.dark]);
  });

  it('updates every theme-color meta the page has', () => {
    document.head.innerHTML =
      '<meta name="theme-color" content="#000000" /><meta name="theme-color" content="#111111" />';
    applyTheme(choice('light'), root, null);
    expect(themeColours()).toEqual([PAGE_COLOURS.light, PAGE_COLOURS.light]);
  });

  it('shows dark for System when the browser cannot report a preference', () => {
    expect(applyTheme(choice('system'), root, null)).toBeTypeOf('function');
    expect(root.dataset.theme).toBe('dark');
  });

  it('falls back to the defaults for values from old or edited storage', () => {
    const junk = { appearance: 'sepia', accent: 'pink' } as unknown as ThemeChoice;
    const device = new FakeSchemeQuery(false);
    applyTheme(junk, root, device);
    expect(root.dataset.accent).toBe('orange');
    expect(root.dataset.theme).toBe('light');
    expect(device.listenerCount).toBe(1);
  });

  it('uses the document root and the device query by default', () => {
    // jsdom has no matchMedia, so the default is the no-preference path.
    applyTheme(DEFAULT_THEME);
    expect(root.dataset.theme).toBe('dark');
    expect(root.dataset.accent).toBe('orange');
  });
});

describe('resolveTheme', () => {
  it.each([
    ['system', true, 'dark'],
    ['system', false, 'light'],
    ['system', undefined, 'dark'],
    ['light', true, 'light'],
    ['light', undefined, 'light'],
    ['dark', false, 'dark'],
    ['dark', undefined, 'dark'],
  ] as const)('%s with prefersDark %s shows %s', (appearance, prefersDark, expected) => {
    expect(resolveTheme(appearance, prefersDark)).toBe(expected);
  });
});

describe('appearance choices', () => {
  it('offers System, Light and Dark, System first and by default', () => {
    expect(APPEARANCES).toEqual(['system', 'light', 'dark']);
    expect(DEFAULT_THEME).toEqual({ appearance: 'system', accent: 'orange' });
    expect(APPEARANCES.map((a) => t(APPEARANCE_LABEL_KEYS[a]))).toEqual([
      'System',
      'Light',
      'Dark',
    ]);
  });
});

import { act, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { useRoute } from '../../../app/useRoute';
import { appearance } from '../../../i18n/en/appearance';
import { appSettings } from '../../../i18n/en/appSettings';
import { menu } from '../../../i18n/en/menu';
import { settings as settingsWords } from '../../../i18n/en/settings';
import { makeProfile } from '../../../test/factories';
import { untilLoaded } from '../../../test/lazy';
import { closeHarnesses, until, untilShown } from '../../../test/screenHarness';
import { HomePage } from '../../home/HomePage';
import { settle } from '../../water/testing/openWater';
import {
  categoryFor,
  defineCategories,
  SETTINGS_CATEGORIES,
  type CategorySpec,
  type SettingsCategory,
} from '../registry';
import { SettingsScreen } from '../SettingsScreen';
import { AppPage } from './AppPage';
import { deferred, openAppSettings } from './testing/openAppSettings';

afterEach(closeHarnesses);

beforeAll(async () => {
  // Fetched on first open in the app; loaded here first so no wait includes its transform.
  await import('./AppPage');
});

const words = appSettings.appSettings;
const accents = appearance.appearance.accent;
const modes = appearance.appearance.mode;
const PAGE = '[data-ui="appSettings"]';

const radio = (group: string, name: string) =>
  within(screen.getByRole('radiogroup', { name: group })).getByRole('radio', { name });
const checkedIn = (group: string) =>
  within(screen.getByRole('radiogroup', { name: group }))
    .getAllByRole('radio')
    .filter((choice) => choice.getAttribute('aria-checked') === 'true')
    .map((choice) => choice.textContent);
const gramsFirst = () => screen.getByRole('switch', { name: words.days.gramsFirst });

/** The first day of the week bar's last page (the current week). */
const weekStartsOn = (): string | undefined => {
  const pages = document.querySelectorAll<HTMLElement>('[data-ui="home.week.page"]');
  return pages[pages.length - 1]?.querySelector<HTMLElement>('[data-day]')?.dataset.day;
};

/** The Settings tab as the app draws it: the screen for whatever the address says. */
function SettingsTab() {
  const route = useRoute();
  return route.kind === 'tab' && route.tab === 'settings' ? (
    <SettingsScreen nested={route.nested} />
  ) : null;
}

describe('AppPage', () => {
  it('is listed with the preferences and opens at #/settings/app under its title', async () => {
    expect(categoryFor(['app'])).toMatchObject({
      id: 'app',
      titleKey: 'appSettings.title',
      group: 'prefs',
    });

    const h = await openAppSettings({ hash: '#/settings' });
    h.mount(<SettingsTab />);
    const prefs = screen.getByRole('region', { name: settingsWords.settings.group.prefs });
    fireEvent.click(within(prefs).getByRole('button', { name: words.title }));

    expect(h.host.hash()).toBe('#/settings/app');
    expect(screen.getByRole('heading', { level: 1, name: words.title })).toBeVisible();
    await untilLoaded();
    await untilShown(PAGE);
  });

  it('shows the stored choices in order: look, grams first and week start, units, then the pages', async () => {
    const h = await openAppSettings();
    const { settingsRepo } = h.repos;
    await settingsRepo.set('display.appearance', 'light');
    await settingsRepo.set('display.accent', 'saffron');
    await settingsRepo.set('log.gramsFirst', true);
    await settingsRepo.set('display.weekStart', 'sun');
    h.mount(<AppPage />);
    await untilShown(PAGE);
    await untilShown('[data-ui="appSettings.units"]');

    expect(
      screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent),
    ).toEqual([words.look.heading, words.days.heading, words.units.heading, words.pages.heading]);
    expect(checkedIn(words.look.appearance)).toEqual([modes.light]);
    expect(checkedIn(words.look.accent)).toEqual([accents.saffron]);
    expect(
      within(screen.getByRole('radiogroup', { name: words.look.accent }))
        .getAllByRole('radio')
        .map((choice) => choice.textContent),
    ).toEqual([
      accents.basil,
      accents.saffron,
      accents.lagoon,
      accents.beet,
      accents.ember,
      accents.ink,
    ]);
    expect(gramsFirst()).toHaveAttribute('aria-checked', 'true');
    expect(checkedIn(words.days.weekStart)).toEqual([words.days.sun]);
    // The Add menu page is not registered yet (P09-05), so it has no row.
    const pages = screen.getByRole('region', { name: words.pages.heading });
    expect(
      within(pages)
        .getAllByRole('button')
        .map((row) => row.textContent),
    ).toEqual([words.product.title, words.tabBar.title]);
    // Nothing the web cannot do is offered.
    expect(screen.getAllByRole('switch')).toEqual([gramsFirst()]);
  });

  it('draws nothing until the settings are read (R06.22)', async () => {
    const read = deferred<void>();
    const h = await openAppSettings({
      sources: (real) => ({
        ...real,
        settingsRepo: {
          loaded: read.promise.then(() => real.settingsRepo.loaded),
          snapshot: () => real.settingsRepo.snapshot(),
        },
      }),
    });
    await h.repos.settingsRepo.set('log.gramsFirst', true);
    h.mount(<AppPage />);

    await act(async () => undefined);
    expect(document.querySelector(PAGE)).toBeNull();
    expect(screen.queryByRole('switch')).toBeNull();

    read.resolve();
    await untilShown(PAGE);
    expect(gramsFirst()).toHaveAttribute('aria-checked', 'true');
  });

  it('recolours every accent element at once when Ember is chosen (ACC-A9-1)', async () => {
    const h = await openAppSettings();
    h.mount(<AppPage />);
    await untilShown(PAGE);
    await settle(() => h.themeRoot.dataset.accent === 'basil');

    fireEvent.click(radio(words.look.accent, accents.ember));

    // The swatch is marked before the write has landed, and the theme follows the stored value.
    expect(checkedIn(words.look.accent)).toEqual([accents.ember]);
    await settle(() => h.themeRoot.dataset.accent === 'ember');
    expect(await h.repos.settingsRepo.get('display.accent')).toBe('ember');
  });

  it('shows each swatch as the page theme draws its preset', async () => {
    const h = await openAppSettings();
    h.mount(<AppPage />);
    await untilShown(PAGE);
    const swatch = () =>
      document.querySelector<HTMLElement>('[data-ui="appSettings.accent.beet"] [data-accent]');
    expect(swatch()?.dataset).toMatchObject({ accent: 'beet' });
    expect(swatch()?.dataset.theme).toBeUndefined();

    document.documentElement.dataset.theme = 'light';
    try {
      await until(() => swatch()?.dataset.theme === 'light');
    } finally {
      delete document.documentElement.dataset.theme;
    }
    await until(() => swatch()?.dataset.theme === undefined);
  });

  it('moves the accent with the arrow keys, choosing as it goes', async () => {
    const h = await openAppSettings();
    h.mount(<AppPage />);
    await untilShown(PAGE);
    const basil = radio(words.look.accent, accents.basil);
    expect(basil).toHaveAttribute('tabindex', '0');

    fireEvent.keyDown(basil, { key: 'ArrowLeft' });
    expect(radio(words.look.accent, accents.ink)).toHaveFocus();
    await settle(() => h.themeRoot.dataset.accent === 'ink');

    fireEvent.keyDown(radio(words.look.accent, accents.ink), { key: 'Home' });
    await settle(() => h.themeRoot.dataset.accent === 'basil');
  });

  it('turns the page light at once when Light is chosen', async () => {
    const h = await openAppSettings();
    h.mount(<AppPage />);
    await untilShown(PAGE);

    fireEvent.click(radio(words.look.appearance, modes.light));

    expect(checkedIn(words.look.appearance)).toEqual([modes.light]);
    await settle(() => h.themeRoot.dataset.theme === 'light');
    expect(await h.repos.settingsRepo.get('display.appearance')).toBe('light');
  });

  it('starts the week bar on Sunday once Sunday is chosen (ACC-J2-1)', async () => {
    const h = await openAppSettings({ hash: '#/home' });
    await h.repos.profileRepo.save(makeProfile({ saved: { kcal: 2_000 } }));
    h.mount(
      <>
        <HomePage />
        <AppPage />
      </>,
    );
    await untilShown('[data-ui="home.week"]');
    await untilShown(PAGE);
    // Monday 26 October 2026 begins the current week.
    expect(weekStartsOn()).toBe('2026-10-26');

    fireEvent.click(radio(words.days.weekStart, words.days.sun));

    await until(() => weekStartsOn() === '2026-10-25');
    expect(await h.repos.settingsRepo.get('display.weekStart')).toBe('sun');
  });

  it('stores grams first the moment it is switched', async () => {
    const writes: Promise<void>[] = [];
    const h = await openAppSettings({
      wrap: (real) => ({
        ...real,
        set: (key, value) => {
          const write = real.set(key, value);
          writes.push(write);
          return write;
        },
      }),
    });
    h.mount(<AppPage />);
    await untilShown(PAGE);
    expect(gramsFirst()).toHaveAttribute('aria-checked', 'false');

    fireEvent.click(gramsFirst());

    expect(gramsFirst()).toHaveAttribute('aria-checked', 'true');
    expect(writes).toHaveLength(1);
    await act(() => Promise.all(writes));
    expect(await h.repos.settingsRepo.get('log.gramsFirst')).toBe(true);
    expect(gramsFirst()).toHaveAttribute('aria-checked', 'true');
  });

  it('goes back to the stored choice and says so when a change cannot be saved', async () => {
    const save = deferred<void>();
    const h = await openAppSettings({
      wrap: (real) => ({ ...real, set: () => save.promise }),
    });
    h.mount(<AppPage />);
    await untilShown(PAGE);

    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    fireEvent.click(radio(words.look.accent, accents.ember));
    expect(checkedIn(words.look.accent)).toEqual([accents.ember]);

    save.reject(new Error('disk full'));
    await settle(() => document.querySelector('[data-ui="toast.message"]') !== null);
    expect(screen.getByText(words.saveFailed)).toBeVisible();
    expect(logged).toHaveBeenCalledOnce();
    expect(checkedIn(words.look.accent)).toEqual([accents.basil]);
    expect(h.themeRoot.dataset.accent).toBe('basil');
    expect(await h.repos.settingsRepo.get('display.accent')).toBe('basil');
  });

  it('opens the pages under it, with Add menu first once that page is registered', async () => {
    const specs: CategorySpec[] = SETTINGS_CATEGORIES.map(
      ({ route: _route, ...spec }: SettingsCategory) => spec,
    );
    const categories = defineCategories([
      ...specs,
      { id: 'menu', titleKey: 'menu.group.reuse', icon: 'plus', group: 'prefs', page: () => null },
    ]);
    const h = await openAppSettings();
    h.mount(<AppPage categories={categories} />);
    await untilShown(PAGE);
    const pages = screen.getByRole('region', { name: words.pages.heading });
    expect(
      within(pages)
        .getAllByRole('button')
        .map((row) => row.textContent),
    ).toEqual([menu.menu.group.reuse, words.product.title, words.tabBar.title]);

    fireEvent.click(within(pages).getByRole('button', { name: words.tabBar.title }));
    expect(h.host.hash()).toBe('#/settings/tab-bar');
    fireEvent.click(within(pages).getByRole('button', { name: words.product.title }));
    expect(h.host.hash()).toBe('#/settings/product-fields');
  });
});

import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { TabBar } from '../../app/TabBar';
import { useRoute } from '../../app/useRoute';
import type { DataSources } from '../../data/DataProvider';
import { appSettings } from '../../i18n/en/appSettings';
import { common } from '../../i18n/en/common';
import { settings } from '../../i18n/en/settings';
import { untilLoaded } from '../../test/lazy';
import { closeHarnesses, openHarness, untilShown } from '../../test/screenHarness';
import { Switch } from '../../ui/Switch';
import { deferred, openAppSettings } from './app/testing/openAppSettings';
import { defineCategories, type SettingsCategory } from './registry';
import { SettingsScreen } from './SettingsScreen';

afterEach(closeHarnesses);

beforeAll(async () => {
  // Fetched on first open in the app; loaded here first so no wait includes its transform.
  await import('./app/AppPage');
  await import('./app/TabsPage');
});

const words = appSettings.appSettings;
const tabs = common.common.tabs;
const SPINNER = '[data-ui="settings.pageLoading"]';
const APP_PAGE = '[data-ui="appSettings"]';

/** The Settings tab as the app draws it: the screen for whatever the address says. */
function SettingsTab({ categories }: { readonly categories?: readonly SettingsCategory[] }) {
  const route = useRoute();
  return route.kind === 'tab' && route.tab === 'settings' ? (
    <SettingsScreen nested={route.nested} categories={categories} />
  ) : null;
}

/** The read hooks with the first settings snapshot held until `release()`. */
function heldSettings() {
  const read = deferred<void>();
  const sources = (real: DataSources): DataSources => ({
    ...real,
    settingsRepo: {
      loaded: read.promise.then(() => real.settingsRepo.loaded),
      snapshot: () => real.settingsRepo.snapshot(),
    },
  });
  return { sources, release: () => read.resolve() };
}

/** Lets the held reads and anything they started run, without letting go of the hold. */
async function flush(): Promise<void> {
  for (let round = 0; round < 5; round++) await act(async () => undefined);
}

/** A page that draws a switch at its default at once, never waiting for anything itself. */
function EagerPage() {
  return (
    <Switch
      label={words.days.gramsFirst}
      checked={false}
      onChange={() => undefined}
      data-ui="eager"
    />
  );
}

const EAGER = defineCategories([
  { id: 'eager', titleKey: 'appSettings.title', icon: 'gear', group: 'prefs', page: EagerPage },
  {
    id: 'own-state',
    titleKey: 'appSettings.tabBar.title',
    icon: 'sort',
    group: 'prefs',
    page: EagerPage,
    waitForSettings: false,
  },
]);

describe('CategoryPage', () => {
  it('shows a spinner, not switches at their defaults, until the settings are read (R06.22, ACC-A10-2)', async () => {
    const held = heldSettings();
    const h = await openAppSettings({ hash: '#/settings/app', sources: held.sources });
    await h.repos.settingsRepo.set('log.gramsFirst', true);
    h.mount(<SettingsTab />);
    await flush();

    expect(screen.getByRole('heading', { level: 1, name: words.title })).toBeVisible();
    expect(screen.getByRole('status', { name: settings.settings.loading })).toBe(
      document.querySelector(SPINNER),
    );
    expect(screen.queryByRole('switch')).toBeNull();
    expect(screen.queryByRole('radio')).toBeNull();

    held.release();
    await untilLoaded();
    await untilShown(APP_PAGE);
    expect(screen.getByRole('switch', { name: words.days.gramsFirst })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(document.querySelector(SPINNER)).toBeNull();
  });

  it('holds back even a page that draws its switches at once, until the settings are read (R06.22)', async () => {
    const held = heldSettings();
    const h = await openHarness({ hash: '#/settings/eager', sources: held.sources });
    h.mount(<SettingsTab categories={EAGER} />);
    await flush();
    expect(document.querySelector(SPINNER)).not.toBeNull();
    expect(screen.queryByRole('switch')).toBeNull();

    held.release();
    await untilShown('[data-ui="eager"]');
    expect(document.querySelector(SPINNER)).toBeNull();
  });

  it('opens a page that shows no stored setting without waiting for them', async () => {
    const held = heldSettings();
    const h = await openHarness({ hash: '#/settings/own-state', sources: held.sources });
    h.mount(<SettingsTab categories={EAGER} />);

    expect(screen.getByRole('switch', { name: words.days.gramsFirst })).toBeVisible();
    expect(document.querySelector(SPINNER)).toBeNull();
  });

  it('lets the page say it cannot show its settings when they cannot be read', async () => {
    const unreadable = Promise.reject(new Error('unreadable'));
    // Each reader handles the failure itself; this keeps the test runner from reporting it.
    unreadable.catch(() => undefined);
    const h = await openAppSettings({
      hash: '#/settings/app',
      sources: (real) => ({
        ...real,
        settingsRepo: { loaded: unreadable, snapshot: () => real.settingsRepo.snapshot() },
      }),
    });
    h.mount(<SettingsTab />);
    await untilLoaded();

    await untilShown('[data-ui="appSettings.unavailable"]');
    expect(screen.getByText(words.unavailable)).toBeVisible();
    expect(screen.queryByRole('switch')).toBeNull();
  });

  it('goes to the hub from the address of a category that is not registered', async () => {
    const h = await openHarness({ hash: '#/settings/voice' });
    h.mount(<SettingsTab />);

    expect(h.host.hash()).toBe('#/settings');
    expect(h.host.entries()).toEqual({ hashes: ['#/settings'], index: 0 });
    expect(screen.getByRole('heading', { level: 1, name: tabs.settings })).toBeVisible();
    expect(screen.getByRole('button', { name: words.title })).toBeVisible();
  });

  it('opens Tab bar under a back link to App settings, which steps back; a tap on Settings goes to the hub', async () => {
    const h = await openAppSettings({ hash: '#/settings' });
    h.mount(
      <>
        <SettingsTab />
        <TabBar />
      </>,
    );
    fireEvent.click(screen.getByRole('button', { name: words.title }));
    await untilLoaded();
    await untilShown('[data-ui="appSettings.pages"]');
    fireEvent.click(screen.getByRole('button', { name: words.tabBar.title }));
    expect(h.host.entries()).toEqual({
      hashes: ['#/settings', '#/settings/app', '#/settings/tab-bar'],
      index: 2,
    });
    await untilLoaded();
    await untilShown('[data-ui="tabBar"]');

    const back = screen.getByRole('button', { name: words.title });
    expect(back).toHaveAttribute('data-ui', 'settings.back');
    fireEvent.click(back);
    expect(h.host.hash()).toBe('#/settings/app');
    expect(h.host.entries().index).toBe(1);
    await untilLoaded();
    await untilShown(APP_PAGE);

    fireEvent.click(screen.getByRole('button', { name: words.tabBar.title }));
    fireEvent.click(screen.getByRole('button', { name: tabs.settings }));
    expect(h.host.hash()).toBe('#/settings');
    expect(h.host.entries().index).toBe(0);
    expect(screen.getByRole('heading', { level: 1, name: tabs.settings })).toBeVisible();
  });
});

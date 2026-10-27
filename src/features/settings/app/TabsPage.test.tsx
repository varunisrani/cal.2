import { act, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { TabBar } from '../../../app/TabBar';
import { useRoute } from '../../../app/useRoute';
import type { Settings } from '../../../data/settingsSchema';
import { appSettings } from '../../../i18n/en/appSettings';
import { common } from '../../../i18n/en/common';
import { shell } from '../../../i18n/en/shell';
import { untilLoaded } from '../../../test/lazy';
import { closeHarnesses, until, untilShown } from '../../../test/screenHarness';
import { settle } from '../../water/testing/openWater';
import { categoryFor } from '../registry';
import { SettingsScreen } from '../SettingsScreen';
import { deferred, openAppSettings } from './testing/openAppSettings';
import { TabsPage } from './TabsPage';

afterEach(closeHarnesses);

beforeAll(async () => {
  // Fetched on first open in the app; loaded here first so no wait includes its transform.
  await import('./AppPage');
  await import('./TabsPage');
});

const words = appSettings.appSettings;
const tabs = common.common.tabs;
const PAGE = '[data-ui="tabBar"]';
const HASH = '#/settings/tab-bar';

const tabSwitch = (name: string) => screen.getByRole('switch', { name });
/** The names of the tabs the bar shows, in order. */
const barTabs = (): string[] => {
  const bar = screen.queryByRole('navigation', { name: shell.shell.tabBar.label });
  return bar
    ? within(bar)
        .getAllByRole('button')
        .map((tab) => tab.textContent ?? '')
    : [];
};
const sameTabs = (expected: readonly string[]) => () => barTabs().join('|') === expected.join('|');

/** The Settings tab as the app draws it: the screen for whatever the address says. */
function SettingsTab() {
  const route = useRoute();
  return route.kind === 'tab' && route.tab === 'settings' ? (
    <SettingsScreen nested={route.nested} />
  ) : null;
}

describe('TabsPage', () => {
  it('is reached from App settings at #/settings/tab-bar, under its title', async () => {
    expect(categoryFor(['tab-bar'])).toMatchObject({
      id: 'tab-bar',
      titleKey: 'appSettings.tabBar.title',
    });
    const h = await openAppSettings({ hash: '#/settings/app' });
    h.mount(<SettingsTab />);
    await untilLoaded();
    await untilShown('[data-ui="appSettings.pages"]');

    fireEvent.click(screen.getByRole('button', { name: words.tabBar.title }));

    expect(h.host.hash()).toBe(HASH);
    expect(screen.getByRole('heading', { level: 1, name: words.tabBar.title })).toBeVisible();
    await untilLoaded();
    await untilShown(PAGE);
  });

  it('shows Progress and Coach switched on, and says Home and Settings always stay', async () => {
    const h = await openAppSettings({ hash: HASH });
    h.mount(<TabsPage />);
    await untilShown(PAGE);

    expect(screen.getByRole('heading', { level: 2, name: words.tabBar.heading })).toBeVisible();
    expect(screen.getAllByRole('switch').map((each) => each.textContent)).toEqual([
      tabs.progress,
      tabs.coach,
    ]);
    expect(tabSwitch(tabs.progress)).toHaveAttribute('aria-checked', 'true');
    expect(tabSwitch(tabs.coach)).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText(words.tabBar.note)).toBeVisible();
  });

  it('shows a tab hidden earlier switched off', async () => {
    const h = await openAppSettings({ hash: HASH });
    await h.repos.settingsRepo.set('tabs.hidden', ['coach']);
    h.mount(<TabsPage />);
    await untilShown(PAGE);

    expect(tabSwitch(tabs.progress)).toHaveAttribute('aria-checked', 'true');
    expect(tabSwitch(tabs.coach)).toHaveAttribute('aria-checked', 'false');
  });

  it('takes Progress out of the bar at once and keeps Coach as it was (ACC-J7-1)', async () => {
    const h = await openAppSettings({ hash: HASH });
    h.mount(
      <>
        <TabsPage />
        <TabBar />
      </>,
    );
    await untilShown(PAGE);
    await until(sameTabs([tabs.home, tabs.progress, tabs.coach, tabs.settings]));

    fireEvent.click(tabSwitch(tabs.progress));

    expect(tabSwitch(tabs.progress)).toHaveAttribute('aria-checked', 'false');
    await until(sameTabs([tabs.home, tabs.coach, tabs.settings]));
    expect(tabSwitch(tabs.coach)).toHaveAttribute('aria-checked', 'true');
    expect(await h.repos.settingsRepo.get('tabs.hidden')).toEqual(['progress']);

    fireEvent.click(tabSwitch(tabs.progress));
    await until(sameTabs([tabs.home, tabs.progress, tabs.coach, tabs.settings]));
    expect(await h.repos.settingsRepo.get('tabs.hidden')).toEqual([]);
  });

  it('hides Coach without undoing Progress, hidden elsewhere after the page was read (R05.13)', async () => {
    // The page keeps the settings it read first, as a page that has not caught up would.
    const h = await openAppSettings({
      hash: HASH,
      sources: (real) => {
        let first: Promise<Settings> | undefined;
        return {
          ...real,
          settingsRepo: {
            loaded: real.settingsRepo.loaded,
            snapshot: () => (first ??= real.settingsRepo.snapshot()),
          },
        };
      },
    });
    h.mount(
      <>
        <TabsPage />
        <TabBar />
      </>,
    );
    await untilShown(PAGE);
    await until(sameTabs([tabs.home, tabs.progress, tabs.coach, tabs.settings]));

    // Another tab hides Progress; this page still shows it on.
    await act(() => h.repos.settingsRepo.toggleHiddenTab('progress', true));
    await until(sameTabs([tabs.home, tabs.coach, tabs.settings]));
    expect(tabSwitch(tabs.progress)).toHaveAttribute('aria-checked', 'true');

    fireEvent.click(tabSwitch(tabs.coach));

    await until(sameTabs([tabs.home, tabs.settings]));
    expect(await h.repos.settingsRepo.get('tabs.hidden')).toEqual(['progress', 'coach']);
  });

  it('flips a switch at once and goes back to the stored list with a message when the change fails', async () => {
    const save = deferred<never>();
    const h = await openAppSettings({
      hash: HASH,
      wrap: (real) => ({ ...real, setTabHidden: () => save.promise }),
    });
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    h.mount(<TabsPage />);
    await untilShown(PAGE);

    fireEvent.click(tabSwitch(tabs.coach));
    expect(tabSwitch(tabs.coach)).toHaveAttribute('aria-checked', 'false');

    save.reject(new Error('disk full'));
    await settle(() => document.querySelector('[data-ui="toast.message"]') !== null);
    expect(screen.getByText(words.saveFailed)).toBeVisible();
    expect(logged).toHaveBeenCalledOnce();
    expect(tabSwitch(tabs.coach)).toHaveAttribute('aria-checked', 'true');
    expect(await h.repos.settingsRepo.get('tabs.hidden')).toEqual([]);
  });

  it('draws nothing until the settings are read (R06.22)', async () => {
    const read = deferred<void>();
    const h = await openAppSettings({
      hash: HASH,
      sources: (real) => ({
        ...real,
        settingsRepo: {
          loaded: read.promise.then(() => real.settingsRepo.loaded),
          snapshot: () => real.settingsRepo.snapshot(),
        },
      }),
    });
    await h.repos.settingsRepo.set('tabs.hidden', ['progress']);
    h.mount(<TabsPage />);

    await act(async () => undefined);
    expect(screen.queryByRole('switch')).toBeNull();

    read.resolve();
    await untilShown(PAGE);
    expect(tabSwitch(tabs.progress)).toHaveAttribute('aria-checked', 'false');
  });
});

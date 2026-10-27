import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createRouter, tabRoute } from '../../app/router';
import { createAppUpdates, type AppUpdates } from '../../app/swRegistration';
import { memoryHost } from '../../app/testing/memoryHost';
import { RouterProvider, useRoute } from '../../app/useRoute';
import { about } from '../../i18n/en/about';
import { aiSetup } from '../../i18n/en/aiSetup';
import { appearance } from '../../i18n/en/appearance';
import { appSettings } from '../../i18n/en/appSettings';
import { common } from '../../i18n/en/common';
import { goals } from '../../i18n/en/goals';
import { profile } from '../../i18n/en/profile';
import { settings } from '../../i18n/en/settings';
import { trackers } from '../../i18n/en/trackers';
import {
  defineCategories,
  SETTINGS_CATEGORIES,
  type CategorySpec,
  type SettingsCategory,
  type SettingsLink,
} from './registry';
import { SettingsScreen } from './SettingsScreen';

const accents = appearance.appearance.accent;
const hub = settings.settings;

function UnitsPage() {
  return <p data-ui="test.units-page" />;
}

// Made-up pages that show no stored setting, so they open without the settings gate (that is
// CategoryPage.test.tsx's concern) and without a DataProvider.
const SPECS: readonly CategorySpec[] = [
  {
    id: 'units',
    titleKey: 'appearance.accent.basil',
    icon: 'scale',
    group: 'prefs',
    page: UnitsPage,
    waitForSettings: false,
  },
  {
    id: 'about-app',
    titleKey: 'appearance.accent.saffron',
    icon: 'info',
    group: 'info',
    page: UnitsPage,
    waitForSettings: false,
  },
  {
    id: 'tab-bar',
    titleKey: 'appearance.accent.lagoon',
    icon: 'gear',
    group: 'prefs',
    page: UnitsPage,
    waitForSettings: false,
  },
];

const CATEGORIES = defineCategories(SPECS);

/** Units with a sub-page, Energy, opened from it. */
const WITH_SUBPAGE = defineCategories([
  ...SPECS,
  {
    id: 'energy',
    titleKey: 'appearance.accent.ember',
    icon: 'chart',
    group: 'prefs',
    parent: 'units',
    page: UnitsPage,
    waitForSettings: false,
  },
]);

/** The two link rows with addresses supplied. */
const LINKS: readonly SettingsLink[] = [
  {
    id: 'help',
    titleKey: 'settings.links.help',
    icon: 'pencil',
    group: 'info',
    href: 'https://example.org/help',
  },
  {
    id: 'privacy',
    titleKey: 'settings.links.privacy',
    icon: 'lock',
    group: 'info',
    href: 'https://example.org/privacy',
  },
];

interface TabOptions {
  readonly categories?: readonly SettingsCategory[];
  readonly links?: readonly SettingsLink[];
  readonly updates?: AppUpdates;
}

/** The Settings tab as the app draws it: the screen for whatever the address says. */
function SettingsTab({ categories, links = [], updates }: TabOptions) {
  const route = useRoute();
  if (route.kind !== 'tab' || route.tab !== 'settings') return null;
  return (
    <SettingsScreen
      nested={route.nested}
      categories={categories}
      links={links}
      updates={updates ?? createAppUpdates()}
    />
  );
}

function renderSettings(
  hash = '#/settings',
  categories: readonly SettingsCategory[] = CATEGORIES,
  options: Omit<TabOptions, 'categories'> = {},
) {
  const host = memoryHost(hash);
  const router = createRouter(host);
  render(
    <RouterProvider router={router}>
      <SettingsTab categories={categories} {...options} />
    </RouterProvider>,
  );
  return { host, router };
}

/** The row names of a hub card, in order. */
function rowNames(card: string): string[] {
  const region = screen.getByRole('region', { name: card });
  return within(region)
    .getAllByRole('listitem')
    .map((row) => row.textContent ?? '');
}

/** A made-up page registered under an id the hub order names. */
function standIn(id: string, group: 'prefs' | 'info', titleKey: CategorySpec['titleKey']) {
  return { id, titleKey, icon: 'info', group, page: UnitsPage, waitForSettings: false } as const;
}

describe('SettingsHub', () => {
  it('lists the registered categories in order, preferences first, then about', () => {
    renderSettings();
    expect(
      screen.getByRole('heading', { level: 1, name: common.common.tabs.settings }),
    ).toBeVisible();
    const prefs = screen.getByRole('region', { name: settings.settings.group.prefs });
    const info = screen.getByRole('region', { name: settings.settings.group.info });
    expect(
      within(prefs)
        .getAllByRole('button')
        .map((row) => row.textContent),
    ).toEqual([accents.basil, accents.lagoon]);
    expect(
      within(info)
        .getAllByRole('button')
        .map((row) => row.textContent),
    ).toEqual([accents.saffron]);
    expect(prefs.compareDocumentPosition(info) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const row = screen.getByRole('button', { name: accents.basil });
    expect(row).toHaveAttribute('data-ui', 'settings.category.units');
    expect(row.querySelector('[data-icon="scale"]')).not.toBeNull();
    expect(row.querySelector('[data-icon="chevronRight"]')).not.toBeNull();
  });

  it('opens a category from its row, under a back link labelled Settings (ACC-J1-1)', () => {
    const { host } = renderSettings();
    fireEvent.click(screen.getByRole('button', { name: accents.lagoon }));

    expect(host.hash()).toBe('#/settings/tab-bar');
    expect(screen.getByRole('heading', { level: 1, name: accents.lagoon })).toBeVisible();
    const back = screen.getByRole('button', { name: common.common.tabs.settings });
    expect(back).toHaveAttribute('data-ui', 'settings.back');
    expect(document.querySelector('[data-ui="test.units-page"]')).not.toBeNull();
    expect(screen.queryByRole('button', { name: accents.basil })).toBeNull();
  });

  it('goes back to the hub from the back link, stepping back over the page (ACC-J1-1)', () => {
    const { host } = renderSettings();
    fireEvent.click(screen.getByRole('button', { name: accents.basil }));
    expect(host.entries().hashes).toEqual(['#/settings', '#/settings/units']);

    fireEvent.click(screen.getByRole('button', { name: common.common.tabs.settings }));

    expect(host.hash()).toBe('#/settings');
    expect(host.entries().index).toBe(0);
    expect(screen.getByRole('button', { name: accents.basil })).toBeVisible();
    expect(
      screen.getByRole('heading', { level: 1, name: common.common.tabs.settings }),
    ).toBeVisible();
  });

  it('opens a category page straight from its address, and its back link reaches the hub', () => {
    const { host } = renderSettings('#/settings/about-app');
    expect(screen.getByRole('heading', { level: 1, name: accents.saffron })).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: common.common.tabs.settings }));
    expect(host.hash()).toBe('#/settings');
    expect(screen.getByRole('region', { name: settings.settings.group.info })).toBeVisible();
  });

  it('goes to the hub from the address of a category that is not registered', () => {
    const { host } = renderSettings('#/settings/reminders');
    expect(host.hash()).toBe('#/settings');
    expect(screen.getByRole('button', { name: accents.basil })).toBeVisible();
  });

  it('shows a note and no empty cards while no category is registered', () => {
    renderSettings('#/settings', []);
    expect(screen.getByText(settings.settings.empty)).toBeVisible();
    expect(screen.queryByRole('region')).toBeNull();
    expect(document.querySelector('[data-ui="settings.empty"]')).not.toBeNull();
  });

  it('shows every v1 category in order, with the sub-pages of App settings left out (ACC-J1-2)', () => {
    renderSettings('#/settings', SETTINGS_CATEGORIES);
    expect(rowNames(hub.group.prefs)).toEqual([
      profile.profile.title,
      goals.goals.page.title,
      trackers.trackers.page.title,
      aiSetup.aiSetup.page.title,
      appSettings.appSettings.title,
    ]);
    // Help and privacy have no address yet (D-16.66); Credits opens from About.
    expect(rowNames(hub.group.info)).toEqual([about.about.page.title, about.about.methods.title]);
    for (const subPage of ['menu', 'product-fields', 'tab-bar', 'credits']) {
      expect(document.querySelector(`[data-ui="settings.category.${subPage}"]`)).toBeNull();
    }
    // Categories with no v1 content are not offered at all (06 §5).
    for (const absent of ['speech', 'voice', 'workouts', 'health']) {
      expect(SETTINGS_CATEGORIES.some(({ id }) => id === absent)).toBe(false);
    }
  });

  it('puts Your data and About in their slots, then help and privacy, once they exist (ACC-J1-2)', () => {
    // The real About and its Credits page step aside for the stand-in.
    const specs: CategorySpec[] = SETTINGS_CATEGORIES.filter(
      ({ id }) => id !== 'about' && id !== 'credits',
    ).map(({ route: _route, ...spec }: SettingsCategory) => spec);
    // Registered at the end, the way a later task adds them.
    const categories = defineCategories([
      ...specs,
      standIn('about', 'info', 'appearance.accent.saffron'),
      standIn('data', 'prefs', 'appearance.accent.basil'),
    ]);
    renderSettings('#/settings', categories, { links: LINKS });

    expect(rowNames(hub.group.prefs)).toEqual([
      profile.profile.title,
      goals.goals.page.title,
      trackers.trackers.page.title,
      aiSetup.aiSetup.page.title,
      appSettings.appSettings.title,
      accents.basil,
    ]);
    expect(rowNames(hub.group.info)).toEqual([
      accents.saffron,
      hub.links.help,
      hub.links.privacy,
      about.about.methods.title,
    ]);
  });

  it('opens help and privacy in a new tab, and leaves out a link with no address', () => {
    renderSettings('#/settings', CATEGORIES, {
      links: [LINKS[0] as SettingsLink, { ...(LINKS[1] as SettingsLink), href: null }],
    });

    const help = screen.getByRole('link', { name: hub.links.help });
    expect(help).toHaveAttribute('href', 'https://example.org/help');
    expect(help).toHaveAttribute('target', '_blank');
    expect(help).toHaveAttribute('rel', 'noopener noreferrer');
    expect(help).toHaveAttribute('data-ui', 'settings.link.help');
    expect(screen.queryByRole('link', { name: hub.links.privacy })).toBeNull();
    expect(rowNames(hub.group.info)).toEqual([hub.links.help, accents.saffron]);
  });

  it('marks the About row with a dot only while an update waits', () => {
    const updates = createAppUpdates();
    const categories = defineCategories([
      ...SPECS,
      standIn('about', 'info', 'appearance.accent.ember'),
    ]);
    renderSettings('#/settings', categories, { links: LINKS, updates });
    const dots = () => document.querySelectorAll('[data-ui="settings.updateDot"]');
    expect(dots()).toHaveLength(0);

    act(() => updates.offer(() => undefined));

    expect(dots()).toHaveLength(1);
    const row = screen.getByRole('button', { name: accents.ember });
    expect(row.querySelector('[data-ui="settings.updateDot"]')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
    // The dot adds no words to the row.
    expect(row).toHaveTextContent(new RegExp(`^${accents.ember}$`));
  });

  it('opens a sub-page under a back link named after its parent, which steps back to it', () => {
    const { host, router } = renderSettings('#/settings', WITH_SUBPAGE);
    expect(screen.queryByRole('button', { name: accents.ember })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: accents.basil }));
    // The parent page opens its sub-page.
    act(() => router.navigate(tabRoute('settings', 'energy')));
    expect(host.entries()).toEqual({
      hashes: ['#/settings', '#/settings/units', '#/settings/energy'],
      index: 2,
    });
    expect(screen.getByRole('heading', { level: 1, name: accents.ember })).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: accents.basil }));

    expect(host.hash()).toBe('#/settings/units');
    expect(host.entries().index).toBe(1);
    expect(screen.getByRole('heading', { level: 1, name: accents.basil })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: common.common.tabs.settings }));
    expect(host.entries()).toMatchObject({ index: 0 });
    expect(screen.getByRole('region', { name: hub.group.prefs })).toBeVisible();
  });

  it('goes to the parent from a sub-page the app was opened on', () => {
    const { host } = renderSettings('#/settings/energy', WITH_SUBPAGE);
    const back = screen.getByRole('button', { name: accents.basil });
    expect(back).toHaveAttribute('data-ui', 'settings.back');

    fireEvent.click(back);

    expect(host.hash()).toBe('#/settings/units');
    expect(screen.getByRole('heading', { level: 1, name: accents.basil })).toBeVisible();
  });
});

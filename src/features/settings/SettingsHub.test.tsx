import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createRouter } from '../../app/router';
import { memoryHost } from '../../app/testing/memoryHost';
import { RouterProvider, useRoute } from '../../app/useRoute';
import { appearance } from '../../i18n/en/appearance';
import { common } from '../../i18n/en/common';
import { settings } from '../../i18n/en/settings';
import { defineCategories, type SettingsCategory } from './registry';
import { SettingsScreen } from './SettingsScreen';

const accents = appearance.appearance.accent;

function UnitsPage() {
  return <p data-ui="test.units-page" />;
}

const CATEGORIES = defineCategories([
  {
    id: 'units',
    titleKey: 'appearance.accent.basil',
    icon: 'scale',
    group: 'prefs',
    page: UnitsPage,
  },
  {
    id: 'about-app',
    titleKey: 'appearance.accent.saffron',
    icon: 'info',
    group: 'info',
    page: UnitsPage,
  },
  {
    id: 'tab-bar',
    titleKey: 'appearance.accent.lagoon',
    icon: 'gear',
    group: 'prefs',
    page: UnitsPage,
  },
]);

/** The Settings tab as the app draws it: the screen for whatever the address says. */
function SettingsTab({ categories }: { categories?: readonly SettingsCategory[] }) {
  const route = useRoute();
  if (route.kind !== 'tab' || route.tab !== 'settings') return null;
  return <SettingsScreen nested={route.nested} categories={categories} />;
}

function renderSettings(hash = '#/settings', categories: readonly SettingsCategory[] = CATEGORIES) {
  const host = memoryHost(hash);
  const router = createRouter(host);
  render(
    <RouterProvider router={router}>
      <SettingsTab categories={categories} />
    </RouterProvider>,
  );
  return { host, router };
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
});

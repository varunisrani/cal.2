import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { common } from '../i18n/en/common';
import { AppStateContext, createAppState, type AppStateStore } from './appState';
import {
  DEFAULT_SHELL_SETTINGS,
  fixedStore,
  ShellPortsContext,
  type BootState,
  type ShellSettings,
} from './ports';
import { createRouter, routeHash, type Router } from './router';
import { isHiddenTab, TabBar, visibleTabs } from './TabBar';
import { controlledStore, type ControlledStore } from './testing/controlledStore';
import { memoryHost, type MemoryHost } from './testing/memoryHost';
import { RouterProvider } from './useRoute';

const NAMES = common.common.tabs;

interface Harness {
  host: MemoryHost;
  router: Router;
  settings: ControlledStore<ShellSettings>;
  appState: AppStateStore;
  at(): string;
}

function settingsWith(hiddenTabs: readonly string[]): ShellSettings {
  return { ...DEFAULT_SHELL_SETTINGS, hiddenTabs };
}

/** The bar inside the providers it reads, over an in-memory history. */
function renderBar(
  initialHash = '#/home',
  /** `null`: the settings have not been read yet. */
  settingsValue: ShellSettings | null = DEFAULT_SHELL_SETTINGS,
): Harness {
  const host = memoryHost(initialHash);
  const router = createRouter(host);
  const settings = controlledStore(settingsValue ?? undefined);
  const appState = createAppState();
  const ports = { settings, boot: fixedStore<BootState>({ status: 'ready' }) };
  render(
    <ShellPortsContext value={ports}>
      <AppStateContext value={appState}>
        <RouterProvider router={router}>
          <TabBar />
        </RouterProvider>
      </AppStateContext>
    </ShellPortsContext>,
  );
  return { host, router, settings, appState, at: () => routeHash(router.current().route) };
}

function tabNames(): string[] {
  return screen.getAllByRole('button').map((button) => button.textContent ?? '');
}

function tab(name: string): HTMLElement {
  return screen.getByRole('button', { name });
}

describe('visibleTabs', () => {
  it('shows every tab when nothing is hidden', () => {
    expect(visibleTabs([])).toEqual(['home', 'progress', 'coach', 'settings']);
  });

  it('ignores Home, Settings and unknown names, and reads names with stray spaces', () => {
    expect(visibleTabs(['home', 'settings', 'kitchen', ' progress '])).toEqual([
      'home',
      'coach',
      'settings',
    ]);
    expect(isHiddenTab('home', ['home'])).toBe(false);
    expect(isHiddenTab('settings', ['settings'])).toBe(false);
    expect(isHiddenTab('coach', ['coach'])).toBe(true);
    expect(isHiddenTab('coach', ['progress'])).toBe(false);
  });
});

describe('TabBar', () => {
  it('draws nothing until the hidden-tab setting is read, so a hidden tab never flashes in', () => {
    const { settings } = renderBar('#/home', null);
    expect(screen.queryByRole('navigation')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();

    act(() => settings.set(settingsWith(['coach'])));
    expect(screen.getByRole('navigation')).toBeInTheDocument();
    expect(tabNames()).toEqual([NAMES.home, NAMES.progress, NAMES.settings]);
  });

  it('shows Home, Progress, Coach and Settings in that order, and Home comes back where it was', () => {
    const { host, at } = renderBar('#/home');
    expect(tabNames()).toEqual([NAMES.home, NAMES.progress, NAMES.coach, NAMES.settings]);

    host.setScroll(640);
    fireEvent.click(tab(NAMES.progress));
    expect(at()).toBe('#/progress');
    expect(host.scrollY()).toBe(0);

    fireEvent.click(tab(NAMES.home));
    expect(at()).toBe('#/home');
    expect(host.scrollY()).toBe(640);
  });

  it('hides only Coach for a stored ["home", "coach"]', () => {
    renderBar('#/home', settingsWith(['home', 'coach']));
    expect(tabNames()).toEqual([NAMES.home, NAMES.progress, NAMES.settings]);
  });

  it('moves to Home when Coach is hidden while on Coach, and the tab disappears', () => {
    const { settings, at } = renderBar('#/home');
    fireEvent.click(tab(NAMES.coach));
    expect(at()).toBe('#/coach');

    act(() => settings.set(settingsWith(['coach'])));
    expect(at()).toBe('#/home');
    expect(screen.queryByRole('button', { name: NAMES.coach })).toBeNull();
    expect(tab(NAMES.home)).toHaveAttribute('aria-current', 'page');
  });

  it('goes to Home when the app opens on a hidden tab', () => {
    const { host, at } = renderBar('#/coach', settingsWith(['coach']));
    expect(at()).toBe('#/home');
    expect(host.entries()).toEqual({ hashes: ['#/home'], index: 0 });
  });

  it('returns to the Settings hub when Settings is tapped on a nested page', () => {
    const { router, at } = renderBar('#/home');
    fireEvent.click(tab(NAMES.settings));
    act(() => router.navigate({ kind: 'tab', tab: 'settings', nested: ['units'] }));
    expect(at()).toBe('#/settings/units');

    fireEvent.click(tab(NAMES.settings));
    expect(at()).toBe('#/settings');
  });

  it('does nothing when the tab on screen is tapped again', () => {
    const { host, at } = renderBar('#/home');
    fireEvent.click(tab(NAMES.progress));
    const before = host.entries();
    fireEvent.click(tab(NAMES.progress));
    fireEvent.click(tab(NAMES.progress));
    expect(at()).toBe('#/progress');
    expect(host.entries()).toEqual(before);
  });

  it('hides while the analysis overlay is showing and comes back afterwards', () => {
    const { appState } = renderBar('#/home');
    act(() => appState.setAnalysisOverlay(true));
    expect(screen.queryByRole('navigation')).toBeNull();
    act(() => appState.setAnalysisOverlay(false));
    expect(screen.getByRole('navigation')).toBeInTheDocument();
    expect(tab(NAMES.home)).toHaveAttribute('aria-current', 'page');
  });

  it('names every tab and marks only the selected one with aria-current', () => {
    renderBar('#/progress');
    const nav = screen.getByRole('navigation');
    expect(nav).toHaveAccessibleName();
    for (const name of [NAMES.home, NAMES.progress, NAMES.coach, NAMES.settings]) {
      expect(tab(name)).toHaveAttribute('data-ui');
    }
    expect(tab(NAMES.progress)).toHaveAttribute('aria-current', 'page');
    expect(
      screen.getAllByRole('button').filter((b) => b.hasAttribute('aria-current')),
    ).toHaveLength(1);
    expect(tab(NAMES.home).querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('shows Settings as selected on a nested Settings page', () => {
    renderBar('#/settings/units/weight');
    expect(tab(NAMES.settings)).toHaveAttribute('aria-current', 'page');
  });

  it('is not drawn on onboarding', () => {
    renderBar('#/onboarding');
    expect(screen.queryByRole('navigation')).toBeNull();
  });
});

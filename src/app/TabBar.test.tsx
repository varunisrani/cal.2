import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import type { HideableTab } from '../data/settingsSchema';
import { createAppState } from './appState';
import { HOME_ROUTE } from './router';
import { TabBar, tapOutcome, visibleTabs } from './TabBar';
import { fakeAppData, settingsWith } from './testing/fakeAppData';
import { historyMoved, routerAt, shellWrapper } from './testing/shellHarness';

afterEach(cleanup);

function tabNames(): string[] {
  const bar = screen.getByRole('navigation', { name: 'Tabs' });
  return within(bar)
    .getAllByRole('button')
    .map((button) => button.textContent ?? '');
}

/** A stored hidden list as it might come from an older or newer build. */
function storedHidden(names: string[]): readonly HideableTab[] {
  return names as unknown as readonly HideableTab[];
}

describe('visibleTabs and tapOutcome', () => {
  it('drops only hidden Progress and Coach, in the fixed order', () => {
    expect(visibleTabs([])).toEqual(['home', 'progress', 'coach', 'settings']);
    expect(visibleTabs(['home', 'settings', 'kitchen', 'progress'])).toEqual([
      'home',
      'coach',
      'settings',
    ]);
    expect(visibleTabs(['coach', 'progress'])).toEqual(['home', 'settings']);
  });

  it('sends a Settings tap inside Settings to the hub and ignores another current tab', () => {
    expect(tapOutcome({ name: 'settings', page: 'units' }, 'settings')).toBe('hub');
    expect(tapOutcome({ name: 'settings' }, 'settings')).toBe('hub');
    expect(tapOutcome(HOME_ROUTE, 'home')).toBe('nothing');
    expect(tapOutcome(HOME_ROUTE, 'coach')).toBe('switch');
  });
});

describe('TabBar', () => {
  it('draws nothing while the settings are not loaded, and moves nowhere', () => {
    const fake = fakeAppData();
    const router = routerAt('#/coach');
    const { container } = render(<TabBar />, {
      wrapper: shellWrapper({ router, data: fake.data }),
    });
    expect(container).toBeEmptyDOMElement();
    expect(router.current().route).toEqual({ name: 'coach' });
  });

  it('shows Home, Progress, Coach and Settings in that order, each named and hooked (ACC-A1-1)', () => {
    const fake = fakeAppData();
    fake.finishedSetup();
    render(<TabBar />, { wrapper: shellWrapper({ router: routerAt('#/home'), data: fake.data }) });
    expect(tabNames()).toEqual(['Home', 'Progress', 'Coach', 'Settings']);
    for (const tab of ['home', 'progress', 'coach', 'settings']) {
      expect(document.querySelector(`[data-ui="shell.tab.${tab}"]`)).toBeInstanceOf(
        HTMLButtonElement,
      );
    }
  });

  it('marks the tab on screen with aria-current, and only that one (ACC-A6-1)', () => {
    const fake = fakeAppData();
    fake.finishedSetup();
    render(<TabBar />, {
      wrapper: shellWrapper({ router: routerAt('#/settings/units'), data: fake.data }),
    });
    expect(screen.getByRole('button', { name: 'Settings' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    for (const name of ['Home', 'Progress', 'Coach']) {
      expect(screen.getByRole('button', { name })).not.toHaveAttribute('aria-current');
    }
  });

  it('hides only Coach when the stored list holds home and coach (R05.13)', () => {
    const fake = fakeAppData();
    fake.finishedSetup({ 'tabs.hidden': storedHidden(['home', 'coach']) });
    render(<TabBar />, { wrapper: shellWrapper({ router: routerAt('#/home'), data: fake.data }) });
    expect(tabNames()).toEqual(['Home', 'Progress', 'Settings']);
  });

  it('keeps Home and Settings when both hideable tabs are hidden', () => {
    const fake = fakeAppData();
    fake.finishedSetup({ 'tabs.hidden': ['progress', 'coach'] });
    render(<TabBar />, { wrapper: shellWrapper({ router: routerAt('#/home'), data: fake.data }) });
    expect(tabNames()).toEqual(['Home', 'Settings']);
  });

  it('moves to Home when Coach is hidden while on Coach, and the tab disappears (ACC-A3-1, R05.13)', async () => {
    const fake = fakeAppData();
    fake.finishedSetup();
    const router = routerAt('#/home');
    render(<TabBar />, { wrapper: shellWrapper({ router, data: fake.data }) });
    await userEvent.click(screen.getByRole('button', { name: 'Coach' }));
    expect(router.current().route).toEqual({ name: 'coach' });

    const moved = historyMoved();
    await act(() => fake.data.settings.toggleHiddenTab('coach', true));
    await act(() => moved);
    expect(router.current().route).toEqual(HOME_ROUTE);
    expect(window.location.hash).toBe('#/home');
    expect(tabNames()).toEqual(['Home', 'Progress', 'Settings']);
    expect(screen.getByRole('button', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
  });

  it('never draws a hidden tab while the app starts (ACC-A3-2, R05.13)', async () => {
    const fake = fakeAppData();
    const { container } = render(<TabBar />, {
      wrapper: shellWrapper({ router: routerAt('#/home'), data: fake.data }),
    });
    const coachSeen: boolean[] = [];
    const watcher = new MutationObserver(() => {
      coachSeen.push(container.querySelector('[data-ui="shell.tab.coach"]') !== null);
    });
    watcher.observe(container, { childList: true, subtree: true });

    expect(container).toBeEmptyDOMElement();
    await act(async () => {
      fake.settings.ready(settingsWith({ 'tabs.hidden': ['coach'] }));
    });
    watcher.disconnect();
    expect(tabNames()).toEqual(['Home', 'Progress', 'Settings']);
    expect(coachSeen.length).toBeGreaterThan(0);
    expect(coachSeen).not.toContain(true);
  });

  it('shows the Settings hub when Settings is tapped on a nested page (ACC-A4-1)', async () => {
    const fake = fakeAppData();
    fake.finishedSetup();
    const router = routerAt('#/settings/units');
    render(<TabBar />, { wrapper: shellWrapper({ router, data: fake.data }) });
    const moved = historyMoved();
    await userEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(router.current().route).toEqual({ name: 'settings' });
    await act(() => moved);
    expect(window.location.hash).toBe('#/settings');
  });

  it('does nothing when the tab on screen is tapped again', async () => {
    const fake = fakeAppData();
    fake.finishedSetup();
    const router = routerAt('#/coach');
    render(<TabBar />, { wrapper: shellWrapper({ router, data: fake.data }) });
    const before = router.current();
    const entry = window.history.state as unknown;
    await userEvent.click(screen.getByRole('button', { name: 'Coach' }));
    expect(router.current()).toBe(before);
    expect(window.history.state).toBe(entry);
  });

  it('returns to the address a tab last showed when it is tapped again later', async () => {
    const fake = fakeAppData();
    fake.finishedSetup();
    const router = routerAt('#/settings/units');
    render(<TabBar />, { wrapper: shellWrapper({ router, data: fake.data }) });
    const moved = historyMoved();
    await userEvent.click(screen.getByRole('button', { name: 'Home' }));
    await act(() => moved);
    await userEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(router.current().route).toEqual({ name: 'settings', page: 'units' });
  });

  it('steps aside while the analysis overlay is up and comes back afterwards', () => {
    const fake = fakeAppData();
    fake.finishedSetup();
    const appState = createAppState();
    render(<TabBar />, {
      wrapper: shellWrapper({ router: routerAt('#/home'), data: fake.data, appState }),
    });
    act(() => appState.set({ analysisOverlay: true }));
    expect(screen.queryByRole('navigation')).toBeNull();
    act(() => appState.set({ analysisOverlay: false }));
    expect(tabNames()).toEqual(['Home', 'Progress', 'Coach', 'Settings']);
    expect(screen.getByRole('button', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
  });

  it('draws no bar on onboarding', () => {
    const fake = fakeAppData();
    fake.settings.ready(settingsWith());
    render(<TabBar />, {
      wrapper: shellWrapper({ router: routerAt('#/onboarding'), data: fake.data }),
    });
    expect(screen.queryByRole('navigation')).toBeNull();
  });
});

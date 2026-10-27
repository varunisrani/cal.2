import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { shell } from '../i18n/en/shell';
import { AppStateContext, createAppState } from './appState';
import { Boot } from './Boot';
import {
  DEFAULT_SHELL_SETTINGS,
  ShellPortsContext,
  type BootState,
  type ShellSettings,
} from './ports';
import { createRouter, routeHash } from './router';
import { controlledStore } from './testing/controlledStore';
import { memoryHost } from './testing/memoryHost';
import { RouterProvider, useRoute } from './useRoute';

const WORDS = shell.shell;

/** Stands in for Home: the numbers that must never show before the profile is read. */
function FakeHome() {
  const route = useRoute();
  return <p data-testid="app">{routeHash(route)} 2000 kcal goal, 150 g protein</p>;
}

function renderBoot(initialHash = '#/home') {
  const host = memoryHost(initialHash);
  const router = createRouter(host);
  const boot = controlledStore<BootState>();
  const settings = controlledStore<ShellSettings>();
  const appState = createAppState();
  const reload = vi.fn();
  render(
    <ShellPortsContext value={{ boot, settings }}>
      <AppStateContext value={appState}>
        <RouterProvider router={router}>
          <Boot onReload={reload}>
            <FakeHome />
          </Boot>
        </RouterProvider>
      </AppStateContext>
    </ShellPortsContext>,
  );
  return { host, router, boot, settings, appState, reload };
}

function skeleton(): HTMLElement | null {
  return screen.queryByRole('status', { name: WORDS.loading });
}

describe('Boot', () => {
  it('shows no Home numbers before the profile read resolves', () => {
    const { boot, settings } = renderBoot('#/home');
    expect(skeleton()).toHaveAttribute('aria-busy', 'true');
    expect(document.body.textContent).not.toMatch(/\d/);
    expect(screen.queryByTestId('app')).toBeNull();

    act(() => boot.set({ status: 'ready' }));
    act(() => settings.set(DEFAULT_SHELL_SETTINGS));
    expect(skeleton()).toBeNull();
    expect(screen.getByTestId('app')).toHaveTextContent('2000 kcal');
  });

  it('keeps the skeleton until the settings are read too, whichever arrives first', () => {
    const { boot, settings } = renderBoot('#/home');
    act(() => settings.set(DEFAULT_SHELL_SETTINGS));
    expect(skeleton()).not.toBeNull();
    expect(screen.queryByTestId('app')).toBeNull();
    act(() => boot.set({ status: 'ready' }));
    expect(screen.getByTestId('app')).toBeInTheDocument();
  });

  it('sends a person without a completed profile to onboarding, replacing the address', () => {
    const { host, boot, settings } = renderBoot('#/progress');
    act(() => {
      settings.set(DEFAULT_SHELL_SETTINGS);
      boot.set({ status: 'needsOnboarding' });
    });
    expect(screen.getByTestId('app')).toHaveTextContent('#/onboarding');
    expect(host.entries()).toEqual({ hashes: ['#/onboarding'], index: 0 });
  });

  it('sends a person with a completed profile from onboarding to Home', () => {
    const { boot, settings } = renderBoot('#/onboarding');
    act(() => {
      settings.set(DEFAULT_SHELL_SETTINGS);
      boot.set({ status: 'ready' });
    });
    expect(screen.getByTestId('app')).toHaveTextContent('#/home');
  });

  it('keeps the tab in the address once ready', () => {
    const { boot, settings } = renderBoot('#/progress');
    act(() => {
      settings.set(DEFAULT_SHELL_SETTINGS);
      boot.set({ status: 'ready' });
    });
    expect(screen.getByTestId('app')).toHaveTextContent('#/progress');
  });

  it('moves to Home once onboarding is finished', () => {
    const { boot, settings } = renderBoot('#/home');
    act(() => {
      settings.set(DEFAULT_SHELL_SETTINGS);
      boot.set({ status: 'needsOnboarding' });
    });
    expect(screen.getByTestId('app')).toHaveTextContent('#/onboarding');
    act(() => boot.set({ status: 'ready' }));
    expect(screen.getByTestId('app')).toHaveTextContent('#/home');
  });

  it('keeps a held onboarding on screen once ready, and moves to Home when it is let go (P09-14)', () => {
    const { boot, settings, appState } = renderBoot('#/onboarding');
    act(() => {
      appState.holdOnboarding(true);
      settings.set(DEFAULT_SHELL_SETTINGS);
      boot.set({ status: 'needsOnboarding' });
    });
    act(() => boot.set({ status: 'ready' }));
    expect(screen.getByTestId('app')).toHaveTextContent('#/onboarding');

    act(() => appState.holdOnboarding(false));
    expect(screen.getByTestId('app')).toHaveTextContent('#/home');
  });

  it('shows a recovery card with Reload instead of the app when the data cannot be opened', () => {
    const { boot, settings, reload } = renderBoot('#/home');
    act(() => {
      settings.set(DEFAULT_SHELL_SETTINGS);
      boot.set({ status: 'openError' });
    });
    expect(screen.queryByTestId('app')).toBeNull();
    const card = screen.getByRole('alert', { name: WORDS.recovery.title });
    expect(card).toHaveTextContent(WORDS.recovery.body);

    const button = screen.getByRole('button', { name: WORDS.recovery.reload });
    expect(button).toHaveAttribute('data-ui', 'shell.recovery.reload');
    fireEvent.click(button);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});

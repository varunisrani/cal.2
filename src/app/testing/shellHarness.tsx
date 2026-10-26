// Rendering pieces of the shell in tests: a router on the jsdom history, fake app data and an
// app state of the test's own, all provided the way App provides them.

import type { ReactNode } from 'react';
import { onTestFinished } from 'vitest';
import type { AppData } from '../../services/appData';
import { AppDataContext } from '../appDataContext';
import { AppStateContext, createAppState, type AppState } from '../appState';
import { createRouter, type Router } from '../router';
import { RouterContext } from '../useRoute';

/** A router on the jsdom history, started as if the page had just been opened at `hash`. */
export function routerAt(hash: string): Router {
  window.history.replaceState(null, '', hash);
  const router = createRouter(window);
  onTestFinished(() => router.stop());
  return router;
}

/** Resolves after the next history move has been handled (the router listens first). */
export function historyMoved(): Promise<void> {
  return new Promise((resolve) => {
    window.addEventListener('popstate', () => resolve(), { once: true });
  });
}

export interface ShellProviders {
  readonly router: Router;
  readonly data?: AppData;
  readonly appState?: AppState;
}

/** A wrapper for `render` that provides the router, the app data and the app state. */
export function shellWrapper({ router, data, appState = createAppState() }: ShellProviders) {
  return function ShellProvidersForTest({ children }: { children?: ReactNode }) {
    const withData =
      data === undefined ? (
        children
      ) : (
        <AppDataContext.Provider value={data}>{children}</AppDataContext.Provider>
      );
    return (
      <RouterContext.Provider value={router}>
        <AppStateContext.Provider value={appState}>{withData}</AppStateContext.Provider>
      </RouterContext.Provider>
    );
  };
}

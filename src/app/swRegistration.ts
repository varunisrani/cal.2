import { useSyncExternalStore } from 'react';
import { reloadPage } from './ShellNotice';

/**
 * The page side of the offline worker (P09-17): registers `sw.js` in production builds, asks the
 * browser to look for a new version at launch and whenever the app comes back into view, and
 * turns "a new version is installed and waiting" into the update flag that the update banner,
 * the Settings dot (P09-01) and About (P09-16) read. Nothing here reloads by itself: only
 * `apply()`, which a press of Reload calls, lets the new version take over, and the page reloads
 * once it has, so an edit in progress is never lost.
 */

/** The worker's file, next to index.html. */
export const WORKER_FILE = 'sw.js';

/** What lets a waiting worker take over (`SKIP_WAITING` in src/sw/sw.ts; a test keeps them equal). */
export const SKIP_WAITING_MESSAGE = { type: 'platewise:skip-waiting' } as const;

/** `current`: nothing to do. `ready`: a new version waits for Reload. */
export type UpdateStatus = 'current' | 'ready';

/** The update flag, in the shape React's `useSyncExternalStore` takes. */
export interface AppUpdates {
  getSnapshot(): UpdateStatus;
  subscribe(onChange: () => void): () => void;
  /** Lets the waiting version take over and reloads once it has. Call it only from a press. */
  apply(): void;
}

/** The flag with the side `registerServiceWorker` drives. */
export interface UpdateSlot extends AppUpdates {
  /** A new version is ready; `apply` will put it in place. */
  offer(apply: () => void): void;
}

export function createAppUpdates(): UpdateSlot {
  let status: UpdateStatus = 'current';
  let takeOver: (() => void) | null = null;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => status,
    subscribe(onChange) {
      listeners.add(onChange);
      return () => {
        listeners.delete(onChange);
      };
    },
    apply() {
      takeOver?.();
    },
    offer(apply) {
      takeOver = apply;
      if (status === 'ready') return;
      status = 'ready';
      for (const listener of [...listeners]) listener();
    },
  };
}

/** The app's one update flag; tests make their own. */
export const appUpdates: UpdateSlot = createAppUpdates();

/** The update flag and what Reload does; re-renders when the flag changes. */
export function useAppUpdate(updates: AppUpdates = appUpdates): {
  status: UpdateStatus;
  apply: () => void;
} {
  const status = useSyncExternalStore(updates.subscribe, updates.getSnapshot);
  return { status, apply: () => updates.apply() };
}

/** The parts of a `ServiceWorker` used here. */
export interface WorkerHandle {
  readonly state: string;
  postMessage(message: unknown): void;
  addEventListener(type: 'statechange', listener: () => void): void;
}

/** The parts of a `ServiceWorkerRegistration` used here. */
export interface WorkerRegistration {
  readonly installing: WorkerHandle | null;
  readonly waiting: WorkerHandle | null;
  update(): Promise<unknown>;
  addEventListener(type: 'updatefound', listener: () => void): void;
}

/** The parts of `navigator.serviceWorker` used here. */
export interface WorkerContainer {
  /** The worker controlling this page, `null` on a first visit. */
  readonly controller: object | null;
  register(
    url: string,
    options: RegistrationOptions,
  ): Promise<WorkerRegistration | null | undefined>;
  addEventListener(type: 'controllerchange', listener: () => void): void;
}

/** The parts of `document` used here. */
export interface VisibilitySource {
  readonly visibilityState: string;
  addEventListener(type: 'visibilitychange', listener: () => void): void;
}

export interface RegisterOptions {
  /** Defaults to whether this is a production build: development never registers. */
  readonly production?: boolean;
  /** Defaults to `navigator.serviceWorker`; `null` where the browser has none. */
  readonly container?: WorkerContainer | null;
  /** Defaults to `document`. */
  readonly page?: VisibilitySource;
  /** What a finished take-over does; defaults to reloading the page. */
  readonly reload?: () => void;
  /** Defaults to `sw.js` under the app's base address. */
  readonly scriptUrl?: string;
}

function browserContainer(): WorkerContainer | null {
  return typeof navigator !== 'undefined' && 'serviceWorker' in navigator
    ? navigator.serviceWorker
    : null;
}

/**
 * Registers the offline worker and keeps `updates` in step with it. Resolves to the
 * registration, or `null` when nothing was registered (development, no service workers, or the
 * browser refused); the app runs the same either way.
 */
export async function registerServiceWorker(
  updates: UpdateSlot,
  options: RegisterOptions = {},
): Promise<WorkerRegistration | null> {
  const {
    production = import.meta.env.PROD,
    container = browserContainer(),
    page = document,
    reload = reloadPage,
    scriptUrl = `${import.meta.env.BASE_URL}${WORKER_FILE}`,
  } = options;
  if (!production || !container) return null;

  let found: WorkerRegistration | null | undefined;
  try {
    // 'none': every check asks the server for sw.js, never the HTTP cache.
    found = await container.register(scriptUrl, { updateViaCache: 'none' });
  } catch (error) {
    console.warn('Platewise: the offline worker could not be registered', error);
    return null;
  }
  // A browser that blocks workers (Playwright's `serviceWorkers: 'block'`) resolves to nothing.
  if (!found) return null;
  const registration = found;

  let controlled = container.controller !== null;
  let reloadAsked = false;

  const takeOver = (): void => {
    const waiting = registration.waiting;
    // The waiting worker is gone (a newer one replaced it, or another tab used it): reload.
    if (!waiting) {
      reload();
      return;
    }
    reloadAsked = true;
    waiting.postMessage(SKIP_WAITING_MESSAGE);
  };

  const watch = (worker: WorkerHandle): void => {
    const check = (): void => {
      // Installed while a page is controlled: a new version. On a first install (no
      // controller yet) there is nothing to update.
      if (worker.state === 'installed' && container.controller !== null) {
        updates.offer(takeOver);
      }
    };
    worker.addEventListener('statechange', check);
    check();
  };

  if (registration.waiting && container.controller !== null) updates.offer(takeOver);
  if (registration.installing) watch(registration.installing);
  registration.addEventListener('updatefound', () => {
    if (registration.installing) watch(registration.installing);
  });

  container.addEventListener('controllerchange', () => {
    if (reloadAsked) {
      reloadAsked = false;
      reload();
      return;
    }
    // Another tab let a new version take over: this page still runs the old one, so a reload
    // stays on offer, and only a press does it.
    if (controlled) updates.offer(reload);
    controlled = true;
  });

  const lookForUpdate = (): void => {
    // Offline the check fails; the next launch or return to the app tries again.
    registration.update().catch(() => undefined);
  };
  lookForUpdate();
  page.addEventListener('visibilitychange', () => {
    if (page.visibilityState === 'visible') lookForUpdate();
  });
  return registration;
}

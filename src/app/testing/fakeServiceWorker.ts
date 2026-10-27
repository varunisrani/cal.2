import { vi } from 'vitest';
import type {
  VisibilitySource,
  WorkerContainer,
  WorkerHandle,
  WorkerRegistration,
} from '../swRegistration';

/** Listeners by event type, fired by hand. */
function listenerSet() {
  const listeners = new Map<string, Array<() => void>>();
  return {
    add(type: string, listener: () => void) {
      listeners.set(type, [...(listeners.get(type) ?? []), listener]);
    },
    fire(type: string) {
      for (const listener of listeners.get(type) ?? []) listener();
    },
  };
}

export interface FakeWorker extends WorkerHandle {
  state: string;
  readonly postMessage: ReturnType<typeof vi.fn<(message: unknown) => void>>;
  /** Moves the worker to `state` and tells its listeners. */
  moveTo(state: string): void;
}

export function fakeWorker(state = 'installing'): FakeWorker {
  const events = listenerSet();
  const worker: FakeWorker = {
    state,
    postMessage: vi.fn<(message: unknown) => void>(),
    addEventListener: (type, listener) => events.add(type, listener),
    moveTo(next) {
      worker.state = next;
      events.fire('statechange');
    },
  };
  return worker;
}

export interface FakeRegistration extends WorkerRegistration {
  installing: FakeWorker | null;
  waiting: FakeWorker | null;
  readonly update: ReturnType<typeof vi.fn<() => Promise<unknown>>>;
  /** The browser found a new version: `worker` starts installing. */
  findUpdate(worker: FakeWorker): void;
  /** `installing` finished installing and now waits. */
  finishInstall(): void;
}

export function fakeRegistration(
  start: { installing?: FakeWorker; waiting?: FakeWorker } = {},
): FakeRegistration {
  const events = listenerSet();
  const registration: FakeRegistration = {
    installing: start.installing ?? null,
    waiting: start.waiting ?? null,
    update: vi.fn<() => Promise<unknown>>(async () => undefined),
    addEventListener: (type, listener) => events.add(type, listener),
    findUpdate(worker) {
      registration.installing = worker;
      events.fire('updatefound');
    },
    finishInstall() {
      const worker = registration.installing;
      if (!worker) throw new Error('fakeRegistration: nothing is installing');
      registration.installing = null;
      registration.waiting = worker;
      worker.moveTo('installed');
    },
  };
  return registration;
}

export interface FakeContainer extends WorkerContainer {
  controller: object | null;
  readonly register: ReturnType<typeof vi.fn<WorkerContainer['register']>>;
  /** `worker` now controls the page (after `clients.claim` or a take-over). */
  control(worker: FakeWorker): void;
}

export function fakeContainer(
  registration: FakeRegistration | null,
  controller: object | null = null,
): FakeContainer {
  const events = listenerSet();
  const container: FakeContainer = {
    controller,
    register: vi.fn<WorkerContainer['register']>(async () => registration),
    addEventListener: (type, listener) => events.add(type, listener),
    control(worker) {
      container.controller = worker;
      events.fire('controllerchange');
    },
  };
  return container;
}

export interface FakePage extends VisibilitySource {
  visibilityState: string;
  /** The app goes out of view (`hidden`) or comes back (`visible`). */
  show(state: 'visible' | 'hidden'): void;
}

export function fakePage(): FakePage {
  const events = listenerSet();
  const page: FakePage = {
    visibilityState: 'visible',
    addEventListener: (type, listener) => events.add(type, listener),
    show(state) {
      page.visibilityState = state;
      events.fire('visibilitychange');
    },
  };
  return page;
}

/**
 * A take-over as the browser does it: the waiting worker activates, controls the page, and the
 * registration has nothing waiting any more.
 */
export function activateWaiting(registration: FakeRegistration, container: FakeContainer): void {
  const worker = registration.waiting;
  if (!worker) throw new Error('activateWaiting: nothing is waiting');
  registration.waiting = null;
  worker.moveTo('activated');
  container.control(worker);
}

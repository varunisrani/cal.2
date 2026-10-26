// Erase everything (spec 06 §3.15, §5). This tab tells the other tabs first, lets go of the
// database and deletes it whole: every table, the API keys and their device key with it. Then it
// removes the Cache Storage entries and localStorage keys the app owns, which all start with
// `platewise-`; nothing else on the origin is touched. The caller turns backup off and stops
// reminders before (R06.5, R06.10) and moves to onboarding after.
//
// Other tabs close their connection when they hear `erase` (`closeOnErase`), and in any case on
// the delete's versionchange (db.ts). A connection that does neither keeps the delete blocked. A
// blocked delete stays queued in the browser (a second request would only queue behind it), so
// the one retry is a second broadcast and one more window for the queued delete; after that the
// block is reported, and the delete still completes on its own once that connection closes.

import { appBus, type Bus } from './bus';
import type { PlatewiseDb } from './schema';

/** The prefix of every Cache Storage entry and localStorage key the app owns. */
export const OWNED_PREFIX = 'platewise-';

/** How long the retry gives a blocked delete after the second broadcast. */
export const RETRY_WINDOW_MS = 2_000;

/** The part of Cache Storage used here. */
export interface CacheStorageLike {
  keys(): Promise<string[]>;
  delete(name: string): Promise<boolean>;
}

/** The part of localStorage used here. */
export interface KeyStorageLike {
  readonly length: number;
  key(index: number): string | null;
  removeItem(key: string): void;
}

export type EraseResult =
  | { status: 'erased' }
  /**
   * Another connection still held the database after the retry. The delete stays queued:
   * `finished` resolves true once it went through, false if the browser refused it then.
   */
  | { status: 'blocked'; finished: Promise<boolean> }
  /** The browser refused a step; every other step still ran. */
  | { status: 'failed'; cause: unknown };

export interface EraseOptions {
  /** This tab's connection. It is closed first; the database of its name is deleted. */
  db: PlatewiseDb;
  /** Where `erase` is posted; defaults to the app bus. */
  bus?: Bus;
  /** Defaults to the browser's; must be the factory `db` was opened with. */
  indexedDB?: IDBFactory;
  /** Defaults to the browser's Cache Storage; `null` where there is none. */
  caches?: CacheStorageLike | null;
  /** Defaults to the browser's localStorage; `null` where there is none. */
  localStorage?: KeyStorageLike | null;
  /** Resolves after `ms`; tests pass their own instead of a timer. */
  wait?: (ms: number) => Promise<void>;
}

type DeleteStep = { kind: 'deleted' } | { kind: 'blocked' } | { kind: 'failed'; cause: unknown };

interface PendingDelete {
  /** Resolves once the delete is done or refused; never rejects. */
  settled: Promise<DeleteStep>;
  /** Resolves when the browser reports the delete blocked by another connection. */
  blocked: Promise<DeleteStep>;
}

function startDelete(factory: IDBFactory, name: string): PendingDelete {
  let request: IDBOpenDBRequest;
  try {
    request = factory.deleteDatabase(name);
  } catch (cause) {
    return { settled: Promise.resolve({ kind: 'failed', cause }), blocked: new Promise(() => {}) };
  }
  return {
    settled: new Promise((resolve) => {
      request.onsuccess = () => resolve({ kind: 'deleted' });
      request.onerror = () => resolve({ kind: 'failed', cause: request.error });
    }),
    blocked: new Promise((resolve) => {
      request.onblocked = () => resolve({ kind: 'blocked' });
    }),
  };
}

async function deleteDatabase(
  factory: IDBFactory,
  name: string,
  bus: Bus,
  wait: (ms: number) => Promise<void>,
): Promise<EraseResult> {
  const pending = startDelete(factory, name);
  let step = await Promise.race([pending.settled, pending.blocked]);
  if (step.kind === 'blocked') {
    // The retry: ask the other tabs again and give the queued delete one more window.
    bus.post({ type: 'erase' });
    const windowClosed = wait(RETRY_WINDOW_MS).then((): DeleteStep => ({ kind: 'blocked' }));
    step = await Promise.race([pending.settled, windowClosed]);
  }
  switch (step.kind) {
    case 'deleted':
      return { status: 'erased' };
    case 'failed':
      return { status: 'failed', cause: step.cause };
    case 'blocked':
      return {
        status: 'blocked',
        finished: pending.settled.then((settled) => settled.kind === 'deleted'),
      };
  }
}

async function clearOwnedCaches(store: CacheStorageLike | null): Promise<void> {
  if (!store) return;
  const names = await store.keys();
  await Promise.all(
    names.filter((name) => name.startsWith(OWNED_PREFIX)).map((name) => store.delete(name)),
  );
}

function clearOwnedKeys(store: KeyStorageLike | null): void {
  if (!store) return;
  // Collect first: removing a key while walking the indexes would skip the next one.
  const owned: string[] = [];
  for (let index = 0; index < store.length; index++) {
    const key = store.key(index);
    if (key?.startsWith(OWNED_PREFIX)) owned.push(key);
  }
  for (const key of owned) store.removeItem(key);
}

function browserIndexedDB(): IDBFactory | null {
  return typeof indexedDB === 'undefined' ? null : indexedDB;
}

function browserCaches(): CacheStorageLike | null {
  return typeof caches === 'undefined' ? null : caches;
}

function browserLocalStorage(): KeyStorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    // Reading `localStorage` throws where the browser blocks site storage.
    return null;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Erases everything the app stored on this device, in every tab. Never rejects: a step the
 * browser refuses is reported, and the steps after it still run.
 */
export async function eraseEverything(options: EraseOptions): Promise<EraseResult> {
  const { db } = options;
  const bus = options.bus ?? appBus();
  const factory = options.indexedDB ?? browserIndexedDB();

  bus.post({ type: 'erase' });
  db.close();

  let result: EraseResult = factory
    ? await deleteDatabase(factory, db.name, bus, options.wait ?? delay)
    : { status: 'failed', cause: new Error('This browser offers no database storage here') };

  const cleanups: Array<() => Promise<void> | void> = [
    () => clearOwnedCaches(options.caches === undefined ? browserCaches() : options.caches),
    () =>
      clearOwnedKeys(
        options.localStorage === undefined ? browserLocalStorage() : options.localStorage,
      ),
  ];
  for (const cleanup of cleanups) {
    try {
      await cleanup();
    } catch (cause) {
      if (result.status !== 'failed') result = { status: 'failed', cause };
    }
  }
  return result;
}

/**
 * In every tab: when another tab erases everything, closes this tab's connection at once (so the
 * delete is not blocked) and calls `onErased` once, for the notice. Returns a stop function.
 */
export function closeOnErase(
  db: PlatewiseDb,
  onErased: () => void,
  bus: Bus = appBus(),
): () => void {
  const stop = bus.subscribe((message, fromOtherTab) => {
    // This tab's own erase closes its connection itself.
    if (message.type !== 'erase' || !fromOtherTab) return;
    stop();
    db.close();
    onErased();
  });
  return stop;
}

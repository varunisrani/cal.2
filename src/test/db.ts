/**
 * A database for one test: its own fake IndexedDB factory and its own name, so tests never share
 * rows or Dexie's per-name live-query cache. The bus stays inside the test (no other tabs) unless
 * one is passed.
 */
import type { PromiseExtended } from 'dexie';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { createBus, type Bus } from '../data/bus';
import { openDb, type OpenOptions } from '../data/db';
import type { PlatewiseDb } from '../data/schema';

export interface TestDb {
  db: PlatewiseDb;
  /** The fake IndexedDB the database lives in; open a second connection ("tab") with it. */
  factory: IDBFactory;
  name: string;
  bus: Bus;
}

let opened = 0;

export async function openTestDb(options: OpenOptions = {}): Promise<TestDb> {
  const factory = options.indexedDB ?? new IDBFactory();
  const name = options.name ?? `platewise-test-${++opened}`;
  const bus = options.bus ?? createBus({ channel: null });
  const db = await openDb({ ...options, name, indexedDB: factory, IDBKeyRange, bus });
  return { db, factory, name, bus };
}

export interface CountedQuery<A extends unknown[], T> {
  /** Call this from the query given to `live` or `useLive`. */
  query: (...args: A) => Promise<T>;
  /** How many runs have finished. */
  runs(): number;
  /**
   * Resolves once at least `count` runs have finished and their results have been handled (the
   * live source has announced or dropped them). Use it to show a re-run happened, or to give a
   * re-run that must not happen its chance to show up.
   */
  untilRuns(count: number): Promise<void>;
  /** Releases the message channel; call it at the end of the test. */
  close(): void;
}

/**
 * Wraps a live query to count its runs. Each finished run is announced on a MessageChannel: the
 * message arrives as a separate task, so the test resumes outside Dexie's query scope and after
 * every microtask of that run has finished. No timers are involved.
 *
 * `read` must return Dexie's own promise chain, without native async/await. An async query makes
 * Dexie hand its result over on a timer task instead of at once, which could arrive after the
 * message; a plain Dexie chain is handed over in the same microtasks as the run.
 */
export function countRuns<A extends unknown[], T>(
  read: (...args: A) => PromiseExtended<T>,
): CountedQuery<A, T> {
  let finished = 0;
  let waiters: Array<{ count: number; resolve: () => void }> = [];
  const channel = new MessageChannel();
  channel.port1.onmessage = () => {
    const due = waiters.filter((waiter) => finished >= waiter.count);
    waiters = waiters.filter((waiter) => finished < waiter.count);
    for (const waiter of due) waiter.resolve();
  };
  return {
    query: (...args) =>
      read(...args).then((result) => {
        finished++;
        channel.port2.postMessage(null);
        return result;
      }),
    runs: () => finished,
    untilRuns(count) {
      return new Promise((resolve) => {
        waiters.push({ count, resolve });
        // One more message makes sure a count that is already reached is noticed.
        channel.port2.postMessage(null);
      });
    },
    close() {
      channel.port1.close();
      channel.port2.close();
    },
  };
}

// Live queries: a query whose answer is pushed again whenever a committed change could alter it.
//
// Dexie's liveQuery does the heavy part: IndexedDB queues a read behind any write transaction on
// the same tables, so a subscriber that starts mid-write still reads the committed value, and
// Dexie re-runs the query after every commit that touches what it read, from this tab or another
// (R06.3). This layer adds what screens need on top: equal answers are not passed on (every read
// returns fresh copies, so they are compared by structure), a failing query becomes an error value
// instead of ending the feed, and all listeners of one feed share one subscription.

import { Dexie, liveQuery, type ObservabilitySet } from 'dexie';
import { sameData } from './values';

export type LiveState<T> =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly value: T }
  | { readonly status: 'error'; readonly error: unknown };

export interface LiveFeed<T> {
  /** The latest state: the same object until something changes. */
  current(): LiveState<T>;
  /** Calls `listener` after every change of `current()`. Returns the function that stops it. */
  subscribe(listener: () => void): () => void;
}

/** The shape of Dexie's observable that a feed needs. */
export interface AnswerSource<T> {
  subscribe(observer: { next(value: T): void; error(error: unknown): void }): {
    unsubscribe(): void;
  };
}

const LOADING: LiveState<never> = Object.freeze({ status: 'loading' });

/**
 * A feed over the answers of `open()`'s source. The source is opened with the first listener and
 * closed after the last. After an error it is opened again on the next database change.
 */
export function feedOf<T>(open: () => AnswerSource<T>): LiveFeed<T> {
  let state: LiveState<T> = LOADING;
  const listeners = new Set<() => void>();
  let subscription: { unsubscribe(): void } | null = null;
  let retry: ((parts: ObservabilitySet) => void) | null = null;

  const publish = (next: LiveState<T>): void => {
    state = next;
    for (const listener of [...listeners]) listener();
  };

  const stopWaiting = (): void => {
    if (retry) Dexie.on.storagemutated.unsubscribe(retry);
    retry = null;
  };

  const stop = (): void => {
    subscription?.unsubscribe();
    subscription = null;
    stopWaiting();
  };

  const start = (): void => {
    let failed = false;
    const opened = open().subscribe({
      next(value) {
        if (state.status === 'ready' && sameData(state.value, value)) return;
        publish({ status: 'ready', value });
      },
      error(error) {
        // Dexie may never run a failed query again, so start over after the next change.
        failed = true;
        stop();
        publish({ status: 'error', error });
        retry = () => {
          stopWaiting();
          if (listeners.size > 0) start();
        };
        Dexie.on('storagemutated', retry);
      },
    });
    // A source that failed while subscribing is closed here; otherwise keep it until the end.
    if (failed) opened.unsubscribe();
    else subscription = opened;
  };

  return {
    current: () => state,
    subscribe(listener) {
      listeners.add(listener);
      if (listeners.size === 1 && subscription === null && retry === null) start();
      return () => {
        if (listeners.delete(listener) && listeners.size === 0) stop();
      };
    },
  };
}

/** A feed of `query`'s answers, re-run by Dexie after every committed change it could see. */
export function live<T>(query: () => Promise<T> | T): LiveFeed<T> {
  // An async wrapper, so a query that throws before its first await still ends as a rejection.
  return feedOf(() => liveQuery(async () => query()));
}

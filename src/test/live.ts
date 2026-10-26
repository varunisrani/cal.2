/**
 * Live feeds in tests: `watch` records every state a feed publishes and waits for one (an event,
 * never a timer); `manualSource` drives a feed by hand; `tappedQuery` is Dexie's live query with a
 * tap that counts every answer Dexie delivers, so a test knows when an equal answer was skipped.
 */
import { liveQuery } from 'dexie';
import { onTestFinished } from 'vitest';
import type { AnswerSource, LiveFeed, LiveState } from '../data/live';

export interface Watch<T> {
  /** Every state published since the watch began, oldest first. */
  readonly states: LiveState<T>[];
  /** The values of the ready states, oldest first. */
  values(): T[];
  /** Resolves with the current or next state that passes `test`. */
  until(test: (state: LiveState<T>) => boolean): Promise<LiveState<T>>;
  stop(): void;
}

/** A state test: ready with a value that passes `test` (any ready value when omitted). */
export function ready<T>(test: (value: T) => boolean = () => true) {
  return (state: LiveState<T>): boolean => state.status === 'ready' && test(state.value);
}

/** Subscribes to `feed` for the rest of the test (or until `stop`). */
export function watch<T>(feed: LiveFeed<T>): Watch<T> {
  const states: LiveState<T>[] = [];
  const waiters = new Set<{
    test: (state: LiveState<T>) => boolean;
    done: (s: LiveState<T>) => void;
  }>();
  const stop = feed.subscribe(() => {
    const state = feed.current();
    states.push(state);
    for (const waiter of [...waiters]) {
      if (waiter.test(state)) {
        waiters.delete(waiter);
        waiter.done(state);
      }
    }
  });
  onTestFinished(stop);
  return {
    states,
    values: () => states.flatMap((state) => (state.status === 'ready' ? [state.value] : [])),
    until(test) {
      const now = feed.current();
      if (test(now)) return Promise.resolve(now);
      return new Promise((done) => waiters.add({ test, done }));
    },
    stop,
  };
}

type Observer<T> = Parameters<AnswerSource<T>['subscribe']>[0];

/** A source the test drives: `emit` an answer, `fail` with an error. */
export function manualSource<T>() {
  const observers = new Set<Observer<T>>();
  let opened = 0;
  const source: AnswerSource<T> = {
    subscribe(observer) {
      opened += 1;
      observers.add(observer);
      return { unsubscribe: () => observers.delete(observer) };
    },
  };
  return {
    open: () => source,
    /** How many times the feed opened the source. */
    opened: () => opened,
    /** How many subscriptions are open now. */
    active: () => observers.size,
    emit: (value: T) => [...observers].forEach((observer) => observer.next(value)),
    fail: (error: unknown) => [...observers].forEach((observer) => observer.error(error)),
  };
}

/** Dexie's live query on `query`, counting every answer after the feed has handled it. */
export function tappedQuery<T>(query: () => Promise<T>) {
  const answers: T[] = [];
  const waiters = new Set<{ count: number; done: () => void }>();
  const open = (): AnswerSource<T> => {
    const source = liveQuery(query);
    return {
      subscribe: (observer) =>
        source.subscribe({
          next(value) {
            observer.next(value);
            answers.push(value);
            for (const waiter of [...waiters]) {
              if (answers.length >= waiter.count) {
                waiters.delete(waiter);
                waiter.done();
              }
            }
          },
          error: (error: unknown) => observer.error(error),
        }),
    };
  };
  return {
    open,
    /** Every answer Dexie delivered, equal or not. */
    answers,
    /** Resolves once Dexie has delivered `count` answers. */
    answered(count: number): Promise<void> {
      if (answers.length >= count) return Promise.resolve();
      return new Promise((done) => waiters.add({ count, done }));
    },
  };
}

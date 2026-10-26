// Live sources over Dexie queries (R06.3). Dexie re-runs a live query after every committed write
// that touches what it read, in this tab or another one, and also re-runs it when a write lands
// while the query itself is running, so a subscriber that arrives mid-write still ends on the
// committed value. A source adds what screens need on top: a loading state, errors as values
// instead of exceptions, a snapshot for `useSyncExternalStore`, and no announcement when a re-run
// gives a result equal to the last one.

import { liveQuery } from 'dexie';

export type LiveState<T> =
  { status: 'loading' } | { status: 'ready'; value: T } | { status: 'error'; error: unknown };

export interface LiveSource<T> {
  /** Starts the query with the first listener and stops it with the last. */
  subscribe(onChange: () => void): () => void;
  /** The latest state; the same object until something changes. */
  getSnapshot(): LiveState<T>;
}

const LOADING: LiveState<never> = { status: 'loading' };

function sameBytes(a: ArrayBufferView | ArrayBuffer, b: ArrayBufferView | ArrayBuffer): boolean {
  const left = ArrayBuffer.isView(a)
    ? new Uint8Array(a.buffer, a.byteOffset, a.byteLength)
    : new Uint8Array(a);
  const right = ArrayBuffer.isView(b)
    ? new Uint8Array(b.buffer, b.byteOffset, b.byteLength)
    : new Uint8Array(b);
  return left.length === right.length && left.every((byte, index) => byte === right[index]);
}

/**
 * Deep equality for query results: plain objects (a key holding `undefined` counts as absent),
 * arrays, dates and byte buffers by content; anything else, blobs included, by identity, so an
 * unequal pair is never reported equal.
 */
export function sameData(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((item, index) => sameData(item, b[index]))
    );
  }
  if (a instanceof Date || b instanceof Date) {
    return a instanceof Date && b instanceof Date && a.getTime() === b.getTime();
  }
  const aBytes = a instanceof ArrayBuffer || ArrayBuffer.isView(a);
  const bBytes = b instanceof ArrayBuffer || ArrayBuffer.isView(b);
  if (aBytes || bBytes) {
    return aBytes && bBytes && sameBytes(a as ArrayBuffer, b as ArrayBuffer);
  }
  const aProto = Object.getPrototypeOf(a) as unknown;
  const bProto = Object.getPrototypeOf(b) as unknown;
  const plain = (proto: unknown) => proto === Object.prototype || proto === null;
  if (!plain(aProto) || !plain(bProto)) return false;
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of keys) {
    if (!sameData(left[key], right[key])) return false;
  }
  return true;
}

/**
 * A live source for `query`, which reads through Dexie (and the guard). Nothing runs until the
 * first listener subscribes.
 */
export function live<T>(query: () => T | Promise<T>): LiveSource<T> {
  let state: LiveState<T> = LOADING;
  const listeners = new Set<() => void>();
  let running: { unsubscribe(): void } | null = null;

  function publish(next: LiveState<T>): void {
    state = next;
    for (const listener of [...listeners]) listener();
  }

  function start(): void {
    running = liveQuery(query).subscribe({
      next(value) {
        if (state.status === 'ready' && sameData(state.value, value)) return;
        publish({ status: 'ready', value });
      },
      // Dexie ends the subscription after an error; the next first listener starts it again.
      error(error: unknown) {
        publish({ status: 'error', error });
      },
    });
  }

  return {
    subscribe(onChange) {
      listeners.add(onChange);
      if (!running) start();
      return () => {
        listeners.delete(onChange);
        if (listeners.size === 0 && running) {
          running.unsubscribe();
          running = null;
        }
      };
    },
    getSnapshot: () => state,
  };
}

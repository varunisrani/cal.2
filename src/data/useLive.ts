// The React side of a live source: renders loading, then the query's result, and again whenever
// a committed write changes that result.

import { useState, useSyncExternalStore } from 'react';
import { live, type LiveSource, type LiveState } from './live';

function sameDeps(a: readonly unknown[], b: readonly unknown[]): boolean {
  return a.length === b.length && a.every((item, index) => Object.is(item, b[index]));
}

/**
 * Subscribes to `query` while the component is mounted. `deps` are the values the query reads
 * from the component (a day key, a range): a change starts a new query, compared like React's own
 * dependency lists.
 */
export function useLive<T>(query: () => T | Promise<T>, deps: readonly unknown[]): LiveState<T> {
  const [held, setHeld] = useState<{ deps: readonly unknown[]; source: LiveSource<T> }>(() => ({
    deps,
    source: live(query),
  }));
  let current = held;
  if (!sameDeps(held.deps, deps)) {
    // A source does nothing until subscribed, so building one while rendering is safe.
    current = { deps, source: live(query) };
    setHeld(current);
  }
  return useSyncExternalStore(current.source.subscribe, current.source.getSnapshot);
}

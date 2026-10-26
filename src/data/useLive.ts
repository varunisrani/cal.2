// React hooks over live feeds (live.ts), on useSyncExternalStore: a component re-renders only
// when the answer changes, and starts in a loading state until the first answer arrives.

import { useMemo, useSyncExternalStore, type DependencyList } from 'react';
import { live, type LiveFeed, type LiveState } from './live';

/** The current state of `feed`; subscribes while the component is mounted. */
export function useFeed<T>(feed: LiveFeed<T>): LiveState<T> {
  return useSyncExternalStore(feed.subscribe, feed.current);
}

/**
 * The live answer of `query`. `deps` work as in useMemo: the query is rebuilt (and starts loading
 * again) when one of them changes, so list every value the query reads from props or state.
 */
export function useLive<T>(query: () => Promise<T> | T, deps: DependencyList): LiveState<T> {
  // The caller's deps decide when the query changes; `query` itself is a new function each render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const feed = useMemo(() => live(query), deps);
  return useFeed(feed);
}

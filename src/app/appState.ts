// Small UI state the whole shell shares and nothing stores: whether the food analysis overlay is
// up (the tab bar hides under it), and the day Home shows (P07 fills it in; null = today).

import { createContext, useContext, useSyncExternalStore } from 'react';
import type { DayKey } from '../domain/dates/dayKey';

export interface AppStateValues {
  /** The analysis overlay covers the screen; the tab bar steps aside (05 §3.1.1). */
  readonly analysisOverlay: boolean;
  /** The day Home shows; null follows today. */
  readonly selectedDay: DayKey | null;
}

export interface AppState {
  get(): AppStateValues;
  /** Changes some values; listeners hear about it only when something really changed. */
  set(changes: Partial<AppStateValues>): void;
  subscribe(listener: () => void): () => void;
}

export const INITIAL_APP_STATE: AppStateValues = Object.freeze({
  analysisOverlay: false,
  selectedDay: null,
});

export function createAppState(initial: AppStateValues = INITIAL_APP_STATE): AppState {
  let values = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => values,
    set(changes) {
      const next = { ...values, ...changes };
      const keys = Object.keys(next) as (keyof AppStateValues)[];
      if (keys.every((key) => Object.is(next[key], values[key]))) return;
      values = next;
      for (const listener of [...listeners]) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

let shared: AppState | null = null;

/** The page's app state, created on first use. */
export function sharedAppState(): AppState {
  shared ??= createAppState();
  return shared;
}

/** The app state screens use; tests provide their own. Without a provider: the page's. */
export const AppStateContext = createContext<AppState | null>(null);

/** The current values, re-rendering when they change, with `set`. */
export function useAppState(): AppStateValues & Pick<AppState, 'set'> {
  const store = useContext(AppStateContext) ?? sharedAppState();
  const values = useSyncExternalStore(store.subscribe, store.get);
  return { ...values, set: store.set };
}

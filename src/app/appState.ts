import { createContext, useContext, useSyncExternalStore } from 'react';
import type { DayKey } from '../domain/dates/dayKey';

/** Small UI state the shell and the screens share; nothing here is stored. */
export interface AppState {
  /** A food analysis covers the screen (P06-04); the tab bar hides meanwhile. */
  readonly analysisOverlay: boolean;
  /** The day Home shows; `null` follows today, across midnight too (P07-02). */
  readonly selectedDay: DayKey | null;
  /**
   * Onboarding stays on screen although setup is complete: a restore from Welcome waits for
   * "Open Platewise" (P09-14) instead of the start-up gate moving to Home by itself.
   */
  readonly onboardingHeld: boolean;
}

/**
 * The day shown for a stored selection on `today`: the selected day, or today when none is
 * selected or the selection is after today (the clock was moved back since).
 */
export function viewedDay(selectedDay: DayKey | null, today: DayKey): DayKey {
  return selectedDay === null || selectedDay > today ? today : selectedDay;
}

export interface AppStateStore {
  getSnapshot(): AppState;
  subscribe(onChange: () => void): () => void;
  setAnalysisOverlay(visible: boolean): void;
  selectDay(day: DayKey | null): void;
  holdOnboarding(held: boolean): void;
}

export function createAppState(initial: Partial<AppState> = {}): AppStateStore {
  let state: AppState = {
    analysisOverlay: false,
    selectedDay: null,
    onboardingHeld: false,
    ...initial,
  };
  const listeners = new Set<() => void>();
  const change = (patch: Partial<AppState>): void => {
    const next = { ...state, ...patch };
    if (
      next.analysisOverlay === state.analysisOverlay &&
      next.selectedDay === state.selectedDay &&
      next.onboardingHeld === state.onboardingHeld
    ) {
      return;
    }
    state = next;
    for (const listener of [...listeners]) listener();
  };
  return {
    getSnapshot: () => state,
    subscribe(onChange) {
      listeners.add(onChange);
      return () => {
        listeners.delete(onChange);
      };
    },
    setAnalysisOverlay: (visible) => change({ analysisOverlay: visible }),
    selectDay: (day) => change({ selectedDay: day }),
    holdOnboarding: (held) => change({ onboardingHeld: held }),
  };
}

/** The app's one store; tests provide their own through `AppStateContext`. */
export const appState: AppStateStore = createAppState();

export const AppStateContext = createContext<AppStateStore>(appState);

export function useAppStateStore(): AppStateStore {
  return useContext(AppStateContext);
}

/** The shared UI state; re-renders when it changes. */
export function useAppState(): AppState {
  const store = useAppStateStore();
  return useSyncExternalStore(store.subscribe, store.getSnapshot);
}

import { useCallback, useMemo } from 'react';
import { useAppState, useAppStateStore, viewedDay } from '../../app/appState';
import { useToday } from '../../app/TodayProvider';
import type { DayKey } from '../../domain/dates/dayKey';
import { stampForDay } from '../../domain/dates/ranges';
import { useServices } from '../../services/context';

/** The day Home shows, and what changes it. */
export interface SelectedDay {
  /** The day shown. */
  readonly day: DayKey;
  /** Today, from the today clock. */
  readonly today: DayKey;
  readonly isToday: boolean;
  /** Shows `day`. Today, or a day after it, means following today, past midnight too. */
  readonly select: (day: DayKey) => void;
  /** Back to today: what a way into Home from outside the app does (05 §3.1.1). */
  readonly reset: () => void;
  /** The instant to stamp on something logged now for the day shown (P01-02 `stampForDay`). */
  readonly stamp: () => number;
}

/**
 * The day Home shows, kept in the app's shared UI state so the review above the tabs logs on the
 * same day. Nothing is stored: a fresh start of the app opens on today, while leaving Home for
 * another tab and coming back keeps the day.
 */
export function useSelectedDay(): SelectedDay {
  const store = useAppStateStore();
  const { selectedDay } = useAppState();
  const today = useToday();
  const { clock } = useServices();
  const day = viewedDay(selectedDay, today);

  const select = useCallback(
    (next: DayKey) => store.selectDay(next >= today ? null : next),
    [store, today],
  );
  const reset = useCallback(() => store.selectDay(null), [store]);
  const stamp = useCallback(() => stampForDay(day, clock.now()), [day, clock]);

  return useMemo(
    () => ({ day, today, isToday: day === today, select, reset, stamp }),
    [day, today, select, reset, stamp],
  );
}

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { dayKeyOf, type DayKey } from '../domain/dates/dayKey';
import { nextLocalMidnight } from '../domain/dates/ranges';
import { systemClock, type Clock } from '../lib/clock';

const TodayContext = createContext<DayKey | null>(null);

export interface TodayProviderProps {
  readonly clock?: Clock;
  readonly children?: ReactNode;
}

/**
 * Today's local day key for the whole app. It moves on at the next local midnight, and is
 * checked again whenever the page becomes visible or is shown from the back-forward cache, so
 * an app left open overnight shows the new day (R05.14).
 */
export function TodayProvider({ clock = systemClock, children }: TodayProviderProps) {
  const [today, setToday] = useState(() => dayKeyOf(clock.now()));

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = (): void => {
      const now = clock.now();
      setToday(dayKeyOf(now));
      // Re-armed on every check, so a day change found by any trigger also fixes the timer.
      clearTimeout(timer);
      timer = setTimeout(check, nextLocalMidnight(now) - now);
    };
    const onVisibility = (): void => {
      if (document.visibilityState === 'visible') check();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pageshow', check);
    check();
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pageshow', check);
    };
  }, [clock]);

  return <TodayContext value={today}>{children}</TodayContext>;
}

/** Today's local day key. */
export function useToday(): DayKey {
  const today = useContext(TodayContext);
  if (today === null) throw new Error('useToday: no TodayProvider above this component');
  return today;
}

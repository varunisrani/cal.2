import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { addDays, dayKeyOf, startOfDay, type DayKey } from '../domain/dates/dayKey';
import { systemClock } from '../lib/clock';

const TodayContext = createContext<DayKey | null>(null);

/**
 * Today's day key for every screen. It moves at the next local midnight and whenever the app
 * comes back to the foreground (a tab shown again, a page restored from the back-forward cache),
 * so an app left open overnight never keeps yesterday (R05.14).
 */
export function TodayProvider({ children }: { readonly children?: ReactNode }) {
  const [today, setToday] = useState(() => dayKeyOf(systemClock.now()));

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;

    // Reads the clock, then waits for the next local midnight. Timers stop while a device
    // sleeps; the foreground events below catch that case.
    const refresh = () => {
      const now = systemClock.now();
      const day = dayKeyOf(now);
      setToday(day);
      clearTimeout(timer);
      timer = setTimeout(refresh, startOfDay(addDays(day, 1)) - now);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refresh();
    };

    refresh();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pageshow', refresh);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pageshow', refresh);
    };
  }, []);

  return <TodayContext.Provider value={today}>{children}</TodayContext.Provider>;
}

/** Today's local day key, kept current by the TodayProvider above. */
export function useToday(): DayKey {
  const today = useContext(TodayContext);
  if (today === null) throw new Error('useToday() needs a TodayProvider above it');
  return today;
}

import { useMemo } from 'react';
import { useActivity, useSettings, useWalks, type LiveState } from '../../data/hooks';
import { addDays, startOfDay, type DayKey } from '../../domain/dates/dayKey';
import { weekStart } from '../../domain/dates/week';
import { weekWalkingMinutes, type WeekMinutes } from '../../domain/walks/week';

const SETTINGS = ['display.weekStart', 'health.connected'] as const;

/**
 * The moderate minutes of the week holding `day`, from the person's week start (P15-03): the
 * brisk minutes of the walks recorded here, plus other apps' walking sessions while Health
 * Connect is connected.
 */
export function useWeekMinutes(day: DayKey): LiveState<WeekMinutes> {
  const settings = useSettings(SETTINGS);
  const start = settings.status === 'ready' ? settings.value['display.weekStart'] : 'mon';
  const first = weekStart(day, start);
  const last = addDays(first, 6);
  const walks = useWalks(first, last);
  const activity = useActivity(first, last);
  const connected = settings.status === 'ready' && settings.value['health.connected'];

  return useMemo((): LiveState<WeekMinutes> => {
    if (settings.status !== 'ready') return settings;
    if (walks.status !== 'ready') return walks;
    // A failed read of Health Connect's copy never hides the walks recorded here.
    const days = connected && activity.status === 'ready' ? activity.value : [];
    return {
      status: 'ready',
      value: weekWalkingMinutes({
        walks: walks.value,
        sessions: days.flatMap((row) => row.sessions),
        from: startOfDay(first),
        to: startOfDay(addDays(first, 7)),
      }),
    };
  }, [settings, walks, activity, connected, first]);
}

// What the fasting screens share: goals in whole hours and the fasting service.

import {
  FAST_GOAL_MAX_MINUTES,
  FAST_GOAL_MIN_MINUTES,
  clampFastGoal,
} from '../../domain/trackers/fasting';
import { t } from '../../i18n/t';
import { useServices } from '../../services/context';
import type { FastingService } from '../../services/fasting';

/** The goal pickers' range in whole hours: 1 to 168 (a week). */
export const GOAL_HOURS = {
  min: FAST_GOAL_MIN_MINUTES / 60,
  max: FAST_GOAL_MAX_MINUTES / 60,
  step: 1,
} as const;

/** The whole hours a goal in minutes shows as on the pickers (a part hour is dropped). */
export function goalHoursOf(minutes: number): number {
  return Math.floor(clampFastGoal(minutes) / 60);
}

/** "16 hours". */
export function hoursText(hours: number): string {
  return t('fasting.hours', { hours });
}

/**
 * The fasting service, or a function that throws when there is none, so a screen fails its
 * action (with its own message) rather than its render. `main.tsx` always provides it.
 */
export function useFasting(): () => FastingService {
  const { fasting } = useServices();
  return () => {
    if (!fasting) throw new Error('No fasting service above this screen');
    return fasting;
  };
}

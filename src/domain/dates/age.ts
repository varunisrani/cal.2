// Age from a birth date stored as a local day key. Both inputs are calendar dates, so the
// result never depends on the time zone (R01.15).

import { splitDayKey, type DayKey } from './dayKey';

/**
 * Whole years from `birthKey` to `todayKey`. A year counts once its anniversary date is reached,
 * so a 29 February birthday completes a year on 1 March in common years. A birth date after
 * today gives 0. Throws `RangeError` for a key that is not a real calendar day.
 */
export function ageOn(birthKey: DayKey, todayKey: DayKey): number {
  const birth = splitDayKey(birthKey);
  const today = splitDayKey(todayKey);
  const anniversaryReached =
    today.month > birth.month || (today.month === birth.month && today.day >= birth.day);
  const years = today.year - birth.year - (anniversaryReached ? 0 : 1);
  return Math.max(0, years);
}

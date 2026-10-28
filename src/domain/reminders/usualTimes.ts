// A meal's usual time of day from the diary (P17-01, D-16.100): the meal check comes about an hour
// after it. Pure.
//
// Each of the 14 days before today counts once: the earliest food of that meal that was logged on
// that same day (a late log of yesterday's lunch says nothing about when lunch was eaten). With at
// least 5 such days the usual time is their median, rounded to the minute; with fewer there is
// no usual time and the caller uses the meal reminder's time.

import { addDays, dayKeyOf, type DayKey } from '../dates/dayKey';
import { minuteOfDay } from '../meals/times';
import type { DiaryEntry, MealKind } from '../model';

/** How many days back the usual time looks. */
export const USUAL_TIME_DAYS = 14;
/** How many of those days must have the meal. */
export const USUAL_TIME_MIN_DAYS = 5;

/** Minutes after midnight as `HH:MM`. */
export function clockText(minute: number): string {
  const hours = Math.floor(minute / 60);
  return `${String(hours).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
}

/** The usual clock time (`HH:MM`) of `meal` before `today`, or null without enough days. */
export function usualMealTime(
  entries: readonly Pick<DiaryEntry, 'dayKey' | 'meal' | 'loggedAt'>[],
  meal: MealKind,
  today: DayKey,
): string | null {
  const first = addDays(today, -USUAL_TIME_DAYS);
  const earliest = new Map<DayKey, number>();
  for (const entry of entries) {
    if (entry.meal !== meal || entry.dayKey < first || entry.dayKey >= today) continue;
    if (dayKeyOf(entry.loggedAt) !== entry.dayKey) continue;
    const minute = minuteOfDay(entry.loggedAt);
    const seen = earliest.get(entry.dayKey);
    if (seen === undefined || minute < seen) earliest.set(entry.dayKey, minute);
  }
  if (earliest.size < USUAL_TIME_MIN_DAYS) return null;
  const sorted = [...earliest.values()].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 1
      ? sorted[middle]!
      : Math.round((sorted[middle - 1]! + sorted[middle]!) / 2);
  return clockText(median);
}

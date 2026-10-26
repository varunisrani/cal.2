// Day windows and time stamps in the runtime's zone.

import { addDays, dayKeyOf, startOfDay, type DayKey } from './dayKey';

/** An inclusive run of local days. */
export interface DayWindow {
  first: DayKey;
  last: DayKey;
}

/** The `days` local days ending on `lastKey`, both ends included. Fewer than 1 day counts as 1. */
export function windowEnding(lastKey: DayKey, days: number): DayWindow {
  const length = Math.max(1, Math.trunc(days));
  return { first: addDays(lastKey, -(length - 1)), last: lastKey };
}

/**
 * True when the instant falls on one of the local days `firstKey`…`lastKey`. The test is
 * half-open on instants, from the start of the first day up to (not including) the start of the
 * day after the last, so a reading logged late on the last day is inside (R05.5).
 */
export function inDays(ms: number, firstKey: DayKey, lastKey: DayKey): boolean {
  return ms >= startOfDay(firstKey) && ms < startOfDay(addDays(lastKey, 1));
}

/**
 * The instant to stamp on something logged for `dayKey`: `nowMs` itself when that day is today,
 * otherwise that day at the current local wall-clock time (hours down to milliseconds). A clock
 * time the day skips (a DST gap) moves forward to the next valid time on the same day.
 */
export function stampForDay(dayKey: DayKey, nowMs: number): number {
  if (dayKeyOf(nowMs) === dayKey) return nowMs;
  const now = new Date(nowMs);
  const stamp = new Date(startOfDay(dayKey));
  stamp.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
  return stamp.getTime();
}

/** The next local midnight strictly after `nowMs`: when "today" must roll over (R05.14). */
export function nextLocalMidnight(nowMs: number): number {
  return startOfDay(addDays(dayKeyOf(nowMs), 1));
}

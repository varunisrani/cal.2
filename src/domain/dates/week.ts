// Weeks and the pages of the Home week bar.

import { addDays, dayNumberOf, daysBetween, type DayKey } from './dayKey';

/** The first day of the week, as the `display.weekStart` setting stores it. */
export type WeekStart = 'mon' | 'sun';

/** Pages in the week bar: the current week and the 52 before it. */
export const WEEK_PAGE_COUNT = 53;

export interface WeekPage {
  /** The page's first day. */
  start: DayKey;
  /** The seven days of the week, in order. */
  days: readonly DayKey[];
}

/** 0 = Sunday … 6 = Saturday, from the calendar alone. */
function weekdayOf(key: DayKey): number {
  // 1970-01-01 was a Thursday.
  const fromThursday = dayNumberOf(key) % 7;
  return (fromThursday + 7 + 4) % 7;
}

/** The first day of the week that contains `key`. */
export function weekStart(key: DayKey, start: WeekStart): DayKey {
  const firstWeekday = start === 'mon' ? 1 : 0;
  const daysIntoWeek = (weekdayOf(key) - firstWeekday + 7) % 7;
  return addDays(key, -daysIntoWeek);
}

/**
 * The week bar's pages, oldest first: 52 past weeks, then the week containing `todayKey` last.
 * There is never a page after the current week; that page still lists the days after today.
 */
export function weekPages(todayKey: DayKey, start: WeekStart): WeekPage[] {
  const current = weekStart(todayKey, start);
  const pages: WeekPage[] = [];
  for (let weeksBack = WEEK_PAGE_COUNT - 1; weeksBack >= 0; weeksBack--) {
    const first = addDays(current, -7 * weeksBack);
    const days = Array.from({ length: 7 }, (_, offset) => addDays(first, offset));
    pages.push({ start: first, days });
  }
  return pages;
}

/**
 * The index in `weekPages(todayKey, start)` of the page showing `dayKey`. A day older than the
 * first page maps to the first page and a day after the current week to the last, so the bar
 * always lands on a page that exists.
 */
export function weekPageIndex(dayKey: DayKey, todayKey: DayKey, start: WeekStart): number {
  const weeksFromCurrent = daysBetween(weekStart(todayKey, start), weekStart(dayKey, start)) / 7;
  const last = WEEK_PAGE_COUNT - 1;
  return Math.min(last, Math.max(0, last + weeksFromCurrent));
}

import { describe, expect, it } from 'vitest';
import { addDays, dayKeyOf, startOfDay } from './dayKey';
import { inDays, nextLocalMidnight, stampForDay, windowEnding } from './ranges';

const HOUR = 3_600_000;

describe('windowEnding', () => {
  it('returns the inclusive first and last day of a 7- and a 30-day window', () => {
    expect(windowEnding('2026-03-10', 7)).toEqual({ first: '2026-03-04', last: '2026-03-10' });
    expect(windowEnding('2026-10-26', 30)).toEqual({ first: '2026-09-27', last: '2026-10-26' });
  });

  it('counts calendar days across the DST change', () => {
    expect(windowEnding('2026-03-09', 3)).toEqual({ first: '2026-03-07', last: '2026-03-09' });
  });

  it('treats fewer than one day as one day', () => {
    expect(windowEnding('2026-10-26', 1)).toEqual({ first: '2026-10-26', last: '2026-10-26' });
    expect(windowEnding('2026-10-26', 0)).toEqual({ first: '2026-10-26', last: '2026-10-26' });
    expect(windowEnding('2026-10-26', -5)).toEqual({ first: '2026-10-26', last: '2026-10-26' });
  });

  it('gives contiguous windows when the end steps back by the window length', () => {
    const current = windowEnding('2026-10-26', 7);
    const previous = windowEnding(addDays(current.last, -7), 7);
    expect(previous.last).toBe(addDays(current.first, -1));
  });
});

describe('inDays', () => {
  const first = '2026-03-04';
  const last = '2026-03-10';

  it('keeps a reading logged at 21:00 on the last day inside the window (R05.5)', () => {
    // 21:00 EDT on 10 March is already 11 March in UTC.
    const lateReading = Date.UTC(2026, 2, 11, 1);
    expect(dayKeyOf(lateReading)).toBe(last);
    expect(inDays(lateReading, first, last)).toBe(true);
  });

  it('includes the whole first and last day and nothing outside them', () => {
    expect(inDays(startOfDay(first), first, last)).toBe(true);
    expect(inDays(startOfDay(first) - 1, first, last)).toBe(false);
    expect(inDays(startOfDay('2026-03-11') - 1, first, last)).toBe(true);
    expect(inDays(startOfDay('2026-03-11'), first, last)).toBe(false);
  });

  it('keeps a reading from earlier today and leaves out one from a month ago', () => {
    const week = windowEnding('2026-10-26', 7);
    const thisMorning = Date.UTC(2026, 9, 26, 11); // 07:00 EDT
    const monthAgo = Date.UTC(2026, 8, 26, 11);
    expect(inDays(thisMorning, week.first, week.last)).toBe(true);
    expect(inDays(monthAgo, week.first, week.last)).toBe(false);
  });

  it('lets a 3650-day window reach a reading from two years back', () => {
    const all = windowEnding('2026-10-26', 3650);
    expect(all.first).toBe('2016-10-29');
    expect(inDays(Date.UTC(2024, 9, 26, 16), all.first, all.last)).toBe(true);
  });

  it('works for a one-day window on the 25-hour fall-back day', () => {
    const day = '2026-11-01';
    expect(inDays(startOfDay(day) + 24 * HOUR + 30 * 60_000, day, day)).toBe(true);
    expect(inDays(startOfDay(day) + 25 * HOUR, day, day)).toBe(false);
  });
});

describe('stampForDay', () => {
  // 14:37:12.345 on Monday 26 October 2026 in New York (EDT).
  const now = Date.UTC(2026, 9, 26, 18, 37, 12, 345);

  it('returns now itself when the day is today', () => {
    expect(stampForDay('2026-10-26', now)).toBe(now);
  });

  it('puts an earlier day at the same wall-clock time', () => {
    expect(stampForDay('2026-10-25', now)).toBe(Date.UTC(2026, 9, 25, 18, 37, 12, 345));
    expect(stampForDay('2025-03-02', now)).toBe(Date.UTC(2025, 2, 2, 19, 37, 12, 345)); // EST
  });

  it('keeps the wall-clock time, not the UTC offset, across the fall-back change', () => {
    const morningInEst = Date.UTC(2026, 10, 3, 14, 15); // 09:15 EST on 3 November
    expect(stampForDay('2026-10-30', morningInEst)).toBe(Date.UTC(2026, 9, 30, 13, 15)); // 09:15 EDT
  });

  it('moves a clock time the day skips forward and stays on that day', () => {
    const halfPastTwo = Date.UTC(2026, 2, 10, 6, 30); // 02:30 EDT on 10 March
    const stamp = stampForDay('2026-03-08', halfPastTwo); // 02:30 does not exist on 8 March
    expect(stamp).toBe(Date.UTC(2026, 2, 8, 7, 30)); // 03:30 EDT
    expect(dayKeyOf(stamp)).toBe('2026-03-08');
  });
});

describe('nextLocalMidnight', () => {
  it('is the start of the next local day', () => {
    const lateEvening = Date.UTC(2026, 2, 8, 3, 15); // 22:15 EST on 7 March
    expect(nextLocalMidnight(lateEvening)).toBe(Date.UTC(2026, 2, 8, 5));
  });

  it('comes 23 hours after midnight on the spring-forward day', () => {
    const noon = Date.UTC(2026, 2, 8, 16); // 12:00 EDT on 8 March
    expect(nextLocalMidnight(noon)).toBe(Date.UTC(2026, 2, 9, 4));
    expect(nextLocalMidnight(noon) - startOfDay('2026-03-08')).toBe(23 * HOUR);
  });

  it('comes 25 hours after midnight on the fall-back day', () => {
    const secondHalfPastOne = Date.UTC(2026, 10, 1, 6, 30); // the second 01:30, EST
    expect(nextLocalMidnight(secondHalfPastOne)).toBe(Date.UTC(2026, 10, 2, 5));
    expect(nextLocalMidnight(secondHalfPastOne) - startOfDay('2026-11-01')).toBe(25 * HOUR);
  });

  it('is strictly later than now, even exactly at midnight', () => {
    const midnight = startOfDay('2026-10-26');
    expect(nextLocalMidnight(midnight)).toBe(startOfDay('2026-10-27'));
    expect(nextLocalMidnight(midnight - 1)).toBe(midnight);
  });
});

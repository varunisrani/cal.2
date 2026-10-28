import { describe, expect, it } from 'vitest';
import { makeEntry } from '../../test/factories';
import { clockText, usualMealTime } from './usualTimes';

// Tests run in America/New_York. Monday 26 October 2026.
const TODAY = '2026-10-26';

/** A lunch logged on `day` (October 2026) at `time`. */
function lunchOn(day: number, time: string, meal: 'lunch' | 'dinner' = 'lunch') {
  return makeEntry({
    meal,
    loggedAt: new Date(`2026-10-${String(day).padStart(2, '0')}T${time}:00`).getTime(),
  });
}

describe('usualMealTime (P17-01, D-16.100)', () => {
  it('is the median of the days that have the meal, from 5 of them', () => {
    const entries = [
      lunchOn(19, '12:10'),
      lunchOn(20, '13:30'),
      lunchOn(21, '12:40'),
      lunchOn(22, '12:20'),
      lunchOn(23, '14:00'),
    ];
    expect(usualMealTime(entries, 'lunch', TODAY)).toBe('12:40');
    expect(usualMealTime(entries.slice(0, 4), 'lunch', TODAY)).toBeNull();
  });

  it('rounds the middle of an even count to the minute', () => {
    const entries = [
      lunchOn(19, '12:00'),
      lunchOn(20, '12:01'),
      lunchOn(21, '12:30'),
      lunchOn(22, '12:45'),
      lunchOn(23, '13:00'),
      lunchOn(24, '13:10'),
    ];
    // 12:30 and 12:45 → 12:37:30 → 12:38.
    expect(usualMealTime(entries, 'lunch', TODAY)).toBe('12:38');
  });

  it("counts a day's several foods of the meal once, at the earliest", () => {
    const oneBigLunch = [11, 12, 13, 14, 15].map((minute) => lunchOn(25, `12:${minute}`));
    expect(usualMealTime(oneBigLunch, 'lunch', TODAY)).toBeNull();

    const week = [19, 20, 21, 22, 23].flatMap((day) => [
      lunchOn(day, '13:00'),
      lunchOn(day, '12:15'),
    ]);
    expect(usualMealTime(week, 'lunch', TODAY)).toBe('12:15');
  });

  it('looks only at the 14 days before today, at that meal, logged on its own day', () => {
    const entries = [
      // Today, 15 days ago and other meals do not count.
      lunchOn(26, '09:00'),
      makeEntry({ meal: 'lunch', loggedAt: new Date('2026-10-11T09:00:00').getTime() }),
      lunchOn(20, '19:00', 'dinner'),
      // Yesterday's lunch logged this morning says nothing about lunch time.
      makeEntry({
        meal: 'lunch',
        dayKey: '2026-10-25',
        loggedAt: new Date('2026-10-26T08:00:00').getTime(),
      }),
      lunchOn(12, '12:30'),
      lunchOn(14, '12:30'),
      lunchOn(16, '12:30'),
      lunchOn(18, '12:30'),
    ];
    expect(usualMealTime(entries, 'lunch', TODAY)).toBeNull();
    expect(usualMealTime([...entries, lunchOn(24, '13:30')], 'lunch', TODAY)).toBe('12:30');
  });

  it('writes minutes after midnight as HH:MM', () => {
    expect(clockText(0)).toBe('00:00');
    expect(clockText(13 * 60 + 5)).toBe('13:05');
  });
});

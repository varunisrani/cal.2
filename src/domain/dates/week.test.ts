import { describe, expect, it } from 'vitest';
import { addDays } from './dayKey';
import { WEEK_PAGE_COUNT, weekPageIndex, weekPages, weekStart } from './week';

// 26 October 2026 is a Monday; 28 October a Wednesday.
describe('weekStart', () => {
  it('finds the Monday or the Sunday before a Wednesday', () => {
    expect(weekStart('2026-10-28', 'mon')).toBe('2026-10-26');
    expect(weekStart('2026-10-28', 'sun')).toBe('2026-10-25');
  });

  it('returns the day itself when it is the first day of its week', () => {
    expect(weekStart('2026-10-26', 'mon')).toBe('2026-10-26');
    expect(weekStart('2026-10-25', 'sun')).toBe('2026-10-25');
  });

  it('puts Sunday last in a Monday week and Saturday last in a Sunday week', () => {
    expect(weekStart('2026-11-01', 'mon')).toBe('2026-10-26');
    expect(weekStart('2026-10-31', 'sun')).toBe('2026-10-25');
  });

  it('crosses a year boundary', () => {
    // 1 January 2027 is a Friday.
    expect(weekStart('2027-01-01', 'mon')).toBe('2026-12-28');
    expect(weekStart('2027-01-01', 'sun')).toBe('2026-12-27');
  });

  it('crosses the DST change', () => {
    // 8 March 2026 (spring forward) is a Sunday.
    expect(weekStart('2026-03-08', 'mon')).toBe('2026-03-02');
    expect(weekStart('2026-03-08', 'sun')).toBe('2026-03-08');
  });
});

describe('weekPages', () => {
  it('lists 53 pages, oldest first, with the current week last', () => {
    const pages = weekPages('2026-10-28', 'mon');
    expect(WEEK_PAGE_COUNT).toBe(53);
    expect(pages).toHaveLength(53);
    expect(pages[0]?.start).toBe('2025-10-27');
    expect(pages[52]?.start).toBe('2026-10-26');
    expect(pages[52]?.days).toContain('2026-10-28');
  });

  it('shows the rest of the current week but never a future week', () => {
    const pages = weekPages('2026-10-28', 'mon');
    expect(pages.at(-1)?.days).toEqual([
      '2026-10-26',
      '2026-10-27',
      '2026-10-28',
      '2026-10-29',
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
    ]);
    for (const page of pages) expect(page.start <= '2026-10-26').toBe(true);
  });

  it('steps by exactly seven calendar days through the DST changes', () => {
    const pages = weekPages('2026-10-28', 'sun');
    pages.forEach((page, index) => {
      expect(page.days).toHaveLength(7);
      expect(page.days[0]).toBe(page.start);
      expect(page.days[6]).toBe(addDays(page.start, 6));
      expect(weekStart(page.start, 'sun')).toBe(page.start);
      const next = pages[index + 1];
      if (next) expect(next.start).toBe(addDays(page.start, 7));
    });
  });

  it('follows the week-start setting', () => {
    expect(weekPages('2026-10-28', 'sun').at(-1)?.start).toBe('2026-10-25');
    expect(weekPages('2026-10-25', 'mon').at(-1)?.days).toContain('2026-10-25');
    expect(weekPages('2026-10-25', 'mon').at(-1)?.start).toBe('2026-10-19');
  });
});

describe('weekPageIndex', () => {
  const today = '2026-10-28';

  it('finds the page that shows a day', () => {
    const pages = weekPages(today, 'mon');
    for (const day of ['2026-10-28', '2026-10-26', '2026-10-25', '2026-03-08', '2025-10-27']) {
      const index = weekPageIndex(day, today, 'mon');
      expect(pages[index]?.days, day).toContain(day);
    }
    expect(weekPageIndex(today, today, 'mon')).toBe(52);
    expect(weekPageIndex('2026-10-25', today, 'mon')).toBe(51);
    expect(weekPageIndex('2026-10-25', today, 'sun')).toBe(52);
  });

  it('clamps days outside the bar to its first and last page', () => {
    expect(weekPageIndex('2025-10-26', today, 'mon')).toBe(0);
    expect(weekPageIndex('2020-01-01', today, 'mon')).toBe(0);
    expect(weekPageIndex('2026-11-01', today, 'mon')).toBe(52);
    expect(weekPageIndex('2026-12-25', today, 'mon')).toBe(52);
  });
});

import { describe, expect, it } from 'vitest';
import {
  addDays,
  dayKeyOf,
  dayNumberOf,
  daysBetween,
  isDayKey,
  splitDayKey,
  startOfDay,
} from './dayKey';

const HOUR = 3_600_000;

describe('test zone', () => {
  it('runs with the zone pinned to New York', () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe('America/New_York');
  });
});

describe('dayKeyOf', () => {
  it('names the local day, not the UTC day', () => {
    // 23:59:59.999 on 14 January in New York is already 15 January in UTC.
    expect(dayKeyOf(Date.UTC(2026, 0, 15, 4, 59, 59, 999))).toBe('2026-01-14');
    expect(dayKeyOf(Date.UTC(2026, 0, 15, 5))).toBe('2026-01-15');
  });

  it('shows why a key must never be parsed as a date string', () => {
    // Date.parse reads 'YYYY-MM-DD' as UTC midnight: the evening before in New York.
    expect(dayKeyOf(Date.parse('2026-01-15'))).toBe('2026-01-14');
    expect(startOfDay('2026-01-15')).toBe(Date.UTC(2026, 0, 15, 5));
  });
});

describe('startOfDay', () => {
  it('is local midnight on both sides of a DST change', () => {
    expect(startOfDay('2026-03-08')).toBe(Date.UTC(2026, 2, 8, 5)); // EST
    expect(startOfDay('2026-03-09')).toBe(Date.UTC(2026, 2, 9, 4)); // EDT
  });

  it('round-trips through dayKeyOf for every day of a year', () => {
    let key = '2026-01-01';
    for (let i = 0; i < 365; i++) {
      const start = startOfDay(key);
      expect(dayKeyOf(start)).toBe(key);
      expect(dayKeyOf(start - 1)).toBe(addDays(key, -1));
      const length = startOfDay(addDays(key, 1)) - start;
      expect([23 * HOUR, 24 * HOUR, 25 * HOUR]).toContain(length);
      key = addDays(key, 1);
    }
    expect(key).toBe('2027-01-01');
  });

  it('keeps years below 100 as they are', () => {
    expect(dayKeyOf(startOfDay('0050-06-01'))).toBe('0050-06-01');
  });
});

describe('addDays', () => {
  it('steps over the spring-forward day, which is 23 hours long', () => {
    expect(addDays('2026-03-07', 1)).toBe('2026-03-08');
    expect(addDays('2026-03-08', 1)).toBe('2026-03-09');
    expect(startOfDay('2026-03-09') - startOfDay('2026-03-08')).toBe(23 * HOUR);
  });

  it('steps over the fall-back day, where 24 hours of milliseconds would not leave the day', () => {
    expect(startOfDay('2026-11-02') - startOfDay('2026-11-01')).toBe(25 * HOUR);
    expect(dayKeyOf(startOfDay('2026-11-01') + 24 * HOUR)).toBe('2026-11-01');
    expect(addDays('2026-11-01', 1)).toBe('2026-11-02');
  });

  it('rolls over months, years and leap days, and steps backwards', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31');
    expect(addDays('2026-03-09', -2)).toBe('2026-03-07');
    expect(addDays('2026-10-26', -364)).toBe('2025-10-27');
    expect(addDays('2026-10-26', 0)).toBe('2026-10-26');
    expect(addDays('0099-12-31', 1)).toBe('0100-01-01');
  });

  it('drops a fractional step', () => {
    expect(addDays('2026-10-26', 1.9)).toBe('2026-10-27');
    expect(addDays('2026-10-26', -1.9)).toBe('2026-10-25');
  });
});

describe('daysBetween', () => {
  it('counts calendar days, signed, across DST and leap years', () => {
    expect(daysBetween('2026-03-07', '2026-03-09')).toBe(2);
    expect(daysBetween('2026-10-31', '2026-11-02')).toBe(2);
    expect(daysBetween('2026-12-31', '2026-01-01')).toBe(-364);
    expect(daysBetween('2028-01-01', '2029-01-01')).toBe(366);
    expect(daysBetween('2026-10-26', '2026-10-26')).toBe(0);
    expect(dayNumberOf('1970-01-02')).toBe(1);
  });
});

describe('isDayKey', () => {
  it('accepts real calendar days', () => {
    for (const key of ['2026-03-07', '2028-02-29', '2000-02-29', '1999-12-31', '0050-06-01']) {
      expect(isDayKey(key), key).toBe(true);
    }
  });

  it('rejects impossible dates, other shapes and non-strings', () => {
    const misses: unknown[] = [
      '2026-02-29',
      '1900-02-29',
      '2026-02-30',
      '2026-04-31',
      '2026-13-01',
      '2026-00-10',
      '2026-01-00',
      '2026-3-7',
      '20260307',
      ' 2026-03-07',
      '2026-03-07 ',
      '2026-03-07T00:00',
      '2026/03/07',
      '',
      null,
      undefined,
      20260307,
      new Date(2026, 2, 7),
    ];
    for (const miss of misses) expect(isDayKey(miss), String(miss)).toBe(false);
  });

  it('makes the arithmetic throw a RangeError on a malformed key', () => {
    expect(() => addDays('2026-3-7', 1)).toThrow(RangeError);
    expect(() => startOfDay('2026-02-30')).toThrow(RangeError);
    expect(() => daysBetween('today', '2026-01-01')).toThrow(RangeError);
    expect(() => splitDayKey('2026-13-01')).toThrow(RangeError);
    expect(splitDayKey('2026-03-07')).toEqual({ year: 2026, month: 3, day: 7 });
  });
});

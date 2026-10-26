import { describe, expect, it } from 'vitest';
import { ageOn } from './age';
import { dayKeyOf } from './dayKey';
import { inTimeZone } from '../../test/time';

describe('ageOn', () => {
  it('adds the year on the birthday and not the day before', () => {
    expect(ageOn('1990-05-10', '2026-05-10')).toBe(36);
    expect(ageOn('1990-05-10', '2026-05-09')).toBe(35);
    expect(ageOn('1990-05-10', '2026-05-11')).toBe(36);
    expect(ageOn('1990-12-31', '2027-01-01')).toBe(36);
  });

  it('clamps a birth date in the future to 0', () => {
    expect(ageOn('2026-12-01', '2026-10-26')).toBe(0);
    expect(ageOn('2031-01-01', '2026-10-26')).toBe(0);
    expect(ageOn('2026-10-26', '2026-10-26')).toBe(0);
  });

  it('completes a 29 February year on 1 March in a common year', () => {
    expect(ageOn('2008-02-29', '2026-02-28')).toBe(17);
    expect(ageOn('2008-02-29', '2026-03-01')).toBe(18);
    expect(ageOn('2008-02-29', '2028-02-29')).toBe(20);
  });

  it('throws a RangeError on a malformed key', () => {
    expect(() => ageOn('1990-5-10', '2026-05-10')).toThrow(RangeError);
    expect(() => ageOn('1990-05-10', '2026-02-30')).toThrow(RangeError);
  });

  it('gives the same age in Asia/Tokyo for a birthday stored as a key (R01.15)', () => {
    const pairs: Array<[string, string]> = [
      ['1990-05-10', '2026-05-10'],
      ['1990-05-10', '2026-05-09'],
      ['2008-02-29', '2026-03-01'],
      ['2026-12-01', '2026-10-26'],
    ];
    const inNewYork = pairs.map(([birth, today]) => ageOn(birth, today));
    const inTokyo = inTimeZone('Asia/Tokyo', () => {
      expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe('Asia/Tokyo');
      return pairs.map(([birth, today]) => ageOn(birth, today));
    });
    expect(inTokyo).toEqual(inNewYork);
    expect(inTokyo).toEqual([36, 35, 18, 0]);
  });

  it('turns a year older at local midnight in Tokyo while UTC is still on the day before', () => {
    // 00:30 on 10 May in Tokyo is 15:30 on 9 May in UTC.
    const justAfterMidnight = Date.UTC(2026, 4, 9, 15, 30);
    const today = inTimeZone('Asia/Tokyo', () => dayKeyOf(justAfterMidnight));
    expect(today).toBe('2026-05-10');
    expect(ageOn('1990-05-10', today)).toBe(36);
    // Back in New York the same instant is still 9 May.
    expect(dayKeyOf(justAfterMidnight)).toBe('2026-05-09');
  });
});

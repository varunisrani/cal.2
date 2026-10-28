import { describe, expect, it } from 'vitest';
import { NOTICE_KINDS, SMART_KINDS, afterQuiet, isQuietAt } from './notices';

// Tests run in America/New_York.
const at = (text: string) => new Date(text).getTime();

describe('notice kinds and quiet hours (P17)', () => {
  it('has a switch for every kind but the fasting goal and the Coach’s check-ins', () => {
    expect(
      NOTICE_KINDS.filter((kind) => !(SMART_KINDS as readonly string[]).includes(kind)),
    ).toEqual(['fastGoal', 'coachCheckIn']);
    // The Coach replied has one, last (P17-03, D-16.102).
    expect(SMART_KINDS.at(-1)).toBe('coachReplied');
  });

  it('is quiet from 22:00 until 07:00', () => {
    expect(isQuietAt(at('2026-10-26T21:59:00'))).toBe(false);
    expect(isQuietAt(at('2026-10-26T22:00:00'))).toBe(true);
    expect(isQuietAt(at('2026-10-27T03:00:00'))).toBe(true);
    expect(isQuietAt(at('2026-10-27T06:59:59'))).toBe(true);
    expect(isQuietAt(at('2026-10-27T07:00:00'))).toBe(false);
  });

  it('moves a time in quiet hours to the next 07:00', () => {
    expect(afterQuiet(at('2026-10-26T12:00:00'))).toBe(at('2026-10-26T12:00:00'));
    expect(afterQuiet(at('2026-10-26T23:30:00'))).toBe(at('2026-10-27T07:00:00'));
    expect(afterQuiet(at('2026-10-27T05:10:00'))).toBe(at('2026-10-27T07:00:00'));
    // Across the end of summer time (1 November 2026 in New York): still 07:00 on the clock.
    expect(afterQuiet(at('2026-10-31T23:00:00'))).toBe(at('2026-11-01T07:00:00'));
  });
});

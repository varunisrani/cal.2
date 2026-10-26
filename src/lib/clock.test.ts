import { describe, expect, it } from 'vitest';
import { inTimeZone, useFakeTime } from '../test/time';
import { fixedClock, isKnownTimeZone, systemClock } from './clock';

describe('fixedClock', () => {
  it('returns the instant and zone it was given, every time', () => {
    const clock = fixedClock(1_760_000_000_000, 'Asia/Kolkata');
    expect(clock.now()).toBe(1_760_000_000_000);
    expect(clock.now()).toBe(1_760_000_000_000);
    expect(clock.timeZone()).toBe('Asia/Kolkata');
  });

  it('rejects a zone Intl does not know and an instant that is not finite', () => {
    expect(() => fixedClock(0, 'Mars/Olympus')).toThrow(RangeError);
    expect(() => fixedClock(0, '')).toThrow(RangeError);
    expect(() => fixedClock(Number.NaN, 'UTC')).toThrow(RangeError);
    expect(() => fixedClock(Number.POSITIVE_INFINITY, 'UTC')).toThrow(RangeError);
  });
});

describe('systemClock', () => {
  it('reads the time at call time, so fake time applies', () => {
    useFakeTime(1_700_000_000_000);
    expect(systemClock.now()).toBe(1_700_000_000_000);
  });

  it('reports the zone the process is in', () => {
    expect(systemClock.timeZone()).toBe('America/New_York');
    expect(inTimeZone('Asia/Tokyo', () => systemClock.timeZone())).toBe('Asia/Tokyo');
  });
});

describe('isKnownTimeZone', () => {
  it('accepts IANA ids and rejects unknown or empty ones', () => {
    expect(isKnownTimeZone('Europe/Berlin')).toBe(true);
    expect(isKnownTimeZone('UTC')).toBe(true);
    expect(isKnownTimeZone('Nowhere/Special')).toBe(false);
    expect(isKnownTimeZone('')).toBe(false);
  });
});

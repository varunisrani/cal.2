import { describe, expect, it, vi } from 'vitest';
import {
  advance,
  advanceAsync,
  getTimeZone,
  inTimeZone,
  runPending,
  setTimeZone,
  useFakeTime,
} from './time';

// 1970-01-01T00:00:00Z: 19:00 the day before in New York (UTC-5), 09:00 in Tokyo (UTC+9).
const EPOCH_HOUR_NEW_YORK = 19;
const EPOCH_HOUR_TOKYO = 9;

describe('useFakeTime and advance', () => {
  it('advance(1000) fires a 1 s timer without real waiting', () => {
    const start = useFakeTime(Date.UTC(2026, 9, 26, 12));
    const fired = vi.fn();
    setTimeout(fired, 1000);
    advance(999);
    expect(fired).not.toHaveBeenCalled();
    advance(1);
    expect(fired).toHaveBeenCalledOnce();
    expect(Date.now()).toBe(start + 1000);
  });

  it('accepts a Date or a date string and rejects an invalid one', () => {
    expect(useFakeTime(new Date(Date.UTC(2026, 0, 1)))).toBe(Date.UTC(2026, 0, 1));
    expect(useFakeTime('2026-03-08T12:00:00Z')).toBe(Date.UTC(2026, 2, 8, 12));
    expect(new Date().toISOString()).toBe('2026-03-08T12:00:00.000Z');
    expect(() => useFakeTime('not a date')).toThrow(RangeError);
  });

  it('runPending fires what is pending now but not the timers those schedule', () => {
    useFakeTime(0);
    const order: string[] = [];
    setTimeout(() => {
      order.push('first');
      setTimeout(() => order.push('second'), 10);
    }, 5_000);
    runPending();
    expect(order).toEqual(['first']);
    runPending();
    expect(order).toEqual(['first', 'second']);
  });

  it('advanceAsync lets a timer scheduled after a promise fire in the same step', async () => {
    useFakeTime(0);
    const fired = vi.fn();
    const later = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
    void later(100)
      .then(() => later(100))
      .then(fired);
    await advanceAsync(200);
    expect(fired).toHaveBeenCalledOnce();
  });
});

describe('inTimeZone', () => {
  it('tests run in America/New_York unless told otherwise', () => {
    expect(getTimeZone()).toBe('America/New_York');
    expect(new Date(0).getHours()).toBe(EPOCH_HOUR_NEW_YORK);
  });

  it("inTimeZone('Asia/Tokyo') changes new Date(0).getHours() and restores it afterwards", () => {
    const inside = inTimeZone('Asia/Tokyo', () => new Date(0).getHours());
    expect(inside).toBe(EPOCH_HOUR_TOKYO);
    expect(new Date(0).getHours()).toBe(EPOCH_HOUR_NEW_YORK);
    expect(getTimeZone()).toBe('America/New_York');
  });

  it('restores the zone when the function throws', () => {
    expect(() =>
      inTimeZone('Asia/Tokyo', () => {
        throw new Error('boom');
      }),
    ).toThrow('boom');
    expect(new Date(0).getHours()).toBe(EPOCH_HOUR_NEW_YORK);
  });

  it('keeps the zone until an async function settles, then restores it', async () => {
    let release = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    const running = inTimeZone('Asia/Tokyo', async () => {
      await gate;
      return new Date(0).getHours();
    });
    expect(new Date(0).getHours()).toBe(EPOCH_HOUR_TOKYO);
    release();
    await expect(running).resolves.toBe(EPOCH_HOUR_TOKYO);
    expect(new Date(0).getHours()).toBe(EPOCH_HOUR_NEW_YORK);
  });

  it('restores the zone when an async function rejects', async () => {
    await expect(
      inTimeZone('Asia/Tokyo', async () => {
        throw new Error('late boom');
      }),
    ).rejects.toThrow('late boom');
    expect(getTimeZone()).toBe('America/New_York');
  });

  it('rejects a zone Intl does not know instead of running in UTC', () => {
    expect(() => inTimeZone('Mars/Olympus', () => 1)).toThrow(RangeError);
    expect(getTimeZone()).toBe('America/New_York');
  });
});

describe('cleanup after each test (src/test/setup.ts)', () => {
  it('a test leaves fake timers on and the zone changed', () => {
    useFakeTime(0);
    setTimeZone('Asia/Tokyo');
    expect(vi.isFakeTimers()).toBe(true);
    expect(new Date(0).getHours()).toBe(EPOCH_HOUR_TOKYO);
  });

  it('the next test starts with real timers in America/New_York', () => {
    expect(vi.isFakeTimers()).toBe(false);
    expect(getTimeZone()).toBe('America/New_York');
    expect(new Date(0).getHours()).toBe(EPOCH_HOUR_NEW_YORK);
  });
});

/**
 * Time helpers for tests: Vitest fake timers with a start instant, and running code in another
 * time zone. Real waits are banned in tests; use these. `src/test/setup.ts` puts real timers and
 * the pinned zone (`test.env.TZ` in vite.config.ts) back after every test.
 */
import { vi } from 'vitest';
import { isKnownTimeZone } from '../lib/clock';

// Tests run in Node, but the app's tsconfig has no Node types: this is all we use of `process`.
declare const process: { env: Record<string, string | undefined> };

/**
 * Turns on fake timers (and a fake `Date`) starting at `at`: epoch ms, a Date, or a date string
 * (a string without an offset is read in the current zone). Returns the start as epoch ms.
 */
export function useFakeTime(at: number | Date | string): number {
  const ms = typeof at === 'number' ? at : new Date(at).getTime();
  if (!Number.isFinite(ms)) throw new RangeError(`useFakeTime: not a valid instant: ${String(at)}`);
  vi.useFakeTimers({ now: ms });
  return ms;
}

/** Moves fake time forward by `ms`, firing every timer that falls due on the way. */
export function advance(ms: number): void {
  vi.advanceTimersByTime(ms);
}

/** Like `advance`, but lets promise callbacks run between timers (for async code). */
export async function advanceAsync(ms: number): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms);
}

/** Fires the timers that are pending now; timers they schedule wait for the next call. */
export function runPending(): void {
  vi.runOnlyPendingTimers();
}

/** The zone the process is in (`process.env.TZ`), or undefined when it is not set. */
export function getTimeZone(): string | undefined {
  return process.env.TZ;
}

/** Sets `process.env.TZ`, or removes it for `undefined` (assigning undefined stores "undefined"). */
export function setTimeZone(tz: string | undefined): void {
  if (tz === undefined) delete process.env.TZ;
  else process.env.TZ = tz;
}

/**
 * Runs `fn` with the process in time zone `tz` and restores the previous zone afterwards: when
 * `fn` returns, throws, or (for an async `fn`) when its promise settles.
 */
export function inTimeZone<T>(tz: string, fn: () => T): T {
  if (!isKnownTimeZone(tz)) throw new RangeError(`inTimeZone: unknown time zone "${tz}"`);
  const before = getTimeZone();
  setTimeZone(tz);
  let out: T;
  try {
    out = fn();
  } catch (error) {
    setTimeZone(before);
    throw error;
  }
  if (out instanceof Promise) {
    // T is this promise's own type, so handing back the chained promise keeps the signature.
    return out.finally(() => setTimeZone(before)) as T;
  }
  setTimeZone(before);
  return out;
}

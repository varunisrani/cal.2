/**
 * Where "now" comes from. Services take a Clock instead of reading the wall clock, so tests can
 * pin the instant and the time zone; the domain takes plain values and never reads a clock.
 */
export interface Clock {
  /** The current instant, epoch milliseconds. */
  now(): number;
  /** The IANA time zone id that local days follow, e.g. "Europe/Berlin". */
  timeZone(): string;
}

/** The device clock. Reads at call time, so Vitest fake timers and `TZ` changes apply. */
export const systemClock: Clock = {
  now: () => Date.now(),
  timeZone: () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
};

/** True when `Intl` knows the zone id (an unknown `TZ` would silently mean UTC). */
export function isKnownTimeZone(tz: string): boolean {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** A clock stuck at one instant in one zone. Throws a RangeError for a bad instant or zone. */
export function fixedClock(ms: number, tz: string): Clock {
  if (!Number.isFinite(ms)) throw new RangeError(`fixedClock: instant must be finite, got ${ms}`);
  if (!isKnownTimeZone(tz)) throw new RangeError(`fixedClock: unknown time zone "${tz}"`);
  return { now: () => ms, timeZone: () => tz };
}

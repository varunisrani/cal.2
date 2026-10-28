// This device's notification bookkeeping (P17): which notices were posted (by their onceKey), the
// Home card's Not now, and how many backups of each kind failed in a row. Pure. Kept in the
// `notify.device` setting, device state out of backups (`LOCAL_SETTINGS`), read field by field.

/** A backup source whose failures are counted: the automatic backup, or Google Drive's copy. */
export type BackupSource = 'auto' | 'drive';

export interface FailStreak {
  /** The time of the last failure counted; null after a success. */
  readonly at: number | null;
  /** Failures in a row. */
  readonly count: number;
}

export interface DeviceState {
  /** onceKey → when it was posted. */
  readonly sent: Readonly<Record<string, number>>;
  /** The Home card is done (Not now, or Android said no). */
  readonly cardDone: boolean;
  readonly fails: Readonly<Record<BackupSource, FailStreak>>;
}

const NO_STREAK: FailStreak = { at: null, count: 0 };

export const EMPTY_DEVICE: DeviceState = {
  sent: {},
  cardDone: false,
  fails: { auto: NO_STREAK, drive: NO_STREAK },
};

/** How long a posted onceKey is remembered: longer than a week, the longest a notice waits. */
export const SENT_KEPT_MS = 14 * 24 * 60 * 60 * 1000;

type Fields = Record<string, unknown>;
const isFields = (value: unknown): value is Fields =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isInstant = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

function readStreak(raw: unknown): FailStreak {
  if (!isFields(raw)) return NO_STREAK;
  const count =
    Number.isInteger(raw.count) && (raw.count as number) > 0 ? (raw.count as number) : 0;
  return { at: isInstant(raw.at) ? raw.at : null, count };
}

/** The stored record as the device state. */
export function readDevice(stored: unknown): DeviceState {
  if (!isFields(stored)) return EMPTY_DEVICE;
  const sent: Record<string, number> = {};
  if (isFields(stored.sent)) {
    for (const [key, at] of Object.entries(stored.sent)) if (isInstant(at)) sent[key] = at;
  }
  const fails = isFields(stored.fails) ? stored.fails : {};
  return {
    sent,
    cardDone: stored.cardDone === true,
    fails: { auto: readStreak(fails.auto), drive: readStreak(fails.drive) },
  };
}

/** Records `onceKey` at `now` (forgetting keys older than 14 days); the same state when kept. */
export function claimOnce(state: DeviceState, onceKey: string, now: number): DeviceState {
  if (Object.hasOwn(state.sent, onceKey)) return state;
  const sent: Record<string, number> = {};
  for (const [key, at] of Object.entries(state.sent)) if (at > now - SENT_KEPT_MS) sent[key] = at;
  sent[onceKey] = now;
  return { ...state, sent };
}

/**
 * The streak after reading a source's stored problem: a new failure time counts one more, no
 * problem (a success) starts again from 0.
 */
export function nextStreak(streak: FailStreak, problemAt: number | null): FailStreak {
  if (problemAt === null) return streak.count === 0 && streak.at === null ? streak : NO_STREAK;
  if (problemAt === streak.at) return streak;
  return { at: problemAt, count: streak.count + 1 };
}

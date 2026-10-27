// Copy a day (02 §3.17, Proposed D-16.50): copies of chosen entries of one day, written onto
// another day. Each copy is a new entry with a new id, stamped on the target day at the current
// clock time, under the meal its original had (yesterday's breakfast copied in the evening is
// still breakfast), with everything else as it was: values, units, note, lines, product details
// and the photo ids. The photos are shared, never duplicated; the photo store keeps a photo while
// any entry names it. All copies of one call are written in one transaction, so a running fast
// refuses the whole copy before anything is written (R02.12). One copy runs at a time.

import { dayKeyOf, startOfDay, type DayKey } from '../domain/dates/dayKey';
import { stampForDay } from '../domain/dates/ranges';
import type { DiaryEntry, Fast } from '../domain/model';
import { systemClock, type Clock } from '../lib/clock';
import { newId as randomId, type IdSource } from '../lib/ids';
import { FastActiveError, type DiaryRepo } from '../data/repos/diaryRepo';

export type CopyDayResult =
  /** The copies as stored (none when nothing was asked for). */
  | { readonly kind: 'copied'; readonly entries: readonly DiaryEntry[] }
  /** A fast is running: nothing was written (the paused dialog). */
  | { readonly kind: 'fastActive'; readonly fast: Fast }
  /** Another copy was still being written: this call did nothing. */
  | { readonly kind: 'ignored' };

export interface CopyDayService {
  /**
   * Copies `entries` onto `targetDay`, all or none. Rejects only when the write fails for another
   * reason (storage); the next call may then try again.
   */
  copy(entries: readonly DiaryEntry[], targetDay: DayKey): Promise<CopyDayResult>;
}

export interface CopyDayServiceDeps {
  readonly diaryRepo: Pick<DiaryRepo, 'addMany'>;
  /** Where "now" comes from; the device clock by default. */
  readonly clock?: Clock;
  /** Ids for the copies; random UUIDs by default. */
  readonly newId?: IdSource;
}

/**
 * The copies, newest original first: the newest gets `stamp`, each older one a millisecond less
 * (never before the target day starts), so copies that share a minute keep their order.
 */
export function copiesOf(
  entries: readonly DiaryEntry[],
  stamp: number,
  newId: IdSource,
): DiaryEntry[] {
  const dayStart = startOfDay(dayKeyOf(stamp));
  return [...entries]
    .sort((a, b) => b.loggedAt - a.loggedAt)
    .map((entry, index) => {
      const loggedAt = Math.max(stamp - index, dayStart);
      return { ...entry, id: newId(), loggedAt, dayKey: dayKeyOf(loggedAt) };
    });
}

export function createCopyDayService(deps: CopyDayServiceDeps): CopyDayService {
  const { diaryRepo } = deps;
  const clock = deps.clock ?? systemClock;
  const newId = deps.newId ?? randomId;
  let busy = false;

  return {
    async copy(entries, targetDay) {
      if (busy) return { kind: 'ignored' };
      if (entries.length === 0) return { kind: 'copied', entries: [] };
      // Taken before the first await, so a call in the same tick already sees it.
      busy = true;
      try {
        const copies = copiesOf(entries, stampForDay(targetDay, clock.now()), newId);
        return { kind: 'copied', entries: await diaryRepo.addMany(copies) };
      } catch (error) {
        if (error instanceof FastActiveError) return { kind: 'fastActive', fast: error.fast };
        throw error;
      } finally {
        busy = false;
      }
    },
  };
}

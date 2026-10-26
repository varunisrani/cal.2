// Fasts, decided by the domain fasting rules inside the transaction that writes them (R05.3).
//
// Every change reads the stored list, asks src/domain/trackers/fasting.ts what to store, and
// writes that, all in one read-write transaction: no other write can land between the check and
// the write. A refusal (another fast running, an overlap, a fast that is gone or already ended)
// comes back as a value and nothing is written.
//
// A running fast blocks food logging, so one must never be left running with no way to end it
// (R05.2). Turning fasting tracking off ends every running fast in the same transaction as the
// switch, and `settleOnOpen` does the same at start-up for a running fast that arrived with
// tracking off (a restored backup, an import). Ending keeps the fast in history; only cancel and
// remove delete one.
//
// Every body handed to `transact` is an async function that awaits its helpers: Dexie keeps the
// transaction open across native awaits only inside one.

import type { DayKey } from '../../domain/dates/dayKey';
import { inDays } from '../../domain/dates/ranges';
import type { Fast } from '../../domain/model';
import {
  activeFast,
  checkEdit,
  clampGoalMin,
  endNow,
  isActive,
  startFast,
  type FastRefusal,
  type RunningFastEdits,
} from '../../domain/trackers/fasting';
import { newId, type IdSource } from '../../lib/ids';
import { err, ok, type Result } from '../../lib/result';
import { decodeFast } from '../codecs';
import { transact, type PlatewiseDb } from '../db';
import { guardKey, readAll, readOne, type Codec, type GuardOptions } from '../guard';
import { live, type LiveFeed } from '../live';
import type { TableName } from '../schema';

/** The `settings` row of the fasting tracking switch (17-naming §1.3); off when absent. */
export const FASTING_ON_KEY = 'fasting.on';

/** Why a fast could not start: the domain's reasons, or tracking is switched off. */
export type StartRefusal = FastRefusal | 'tracking-off';

/** What the editor may change on a fast; `end: null` makes it running again. */
export type FastChanges = Partial<Pick<Fast, 'start' | 'end' | 'goalMin'>>;

export interface FastRepoOptions extends GuardOptions {
  ids?: IdSource;
}

export interface FastRepo {
  /** Starts a fast at `now` with the goal clamped to 1 h – 7 days. */
  start(goalMin: number, now: number): Promise<Result<Fast, StartRefusal>>;
  /** Ends a running fast at `now` (never before its start). */
  end(id: string, now: number): Promise<Result<Fast, FastRefusal>>;
  /** Deletes a running fast, so it never shows in history; `ended` for a completed one. */
  cancel(id: string): Promise<Result<Fast, FastRefusal>>;
  /** Applies editor changes, checked against every other fast. */
  edit(id: string, changes: FastChanges): Promise<Result<Fast, FastRefusal>>;
  /** "End fast now": the edited start and goal and the end at `now`, stored as one record. */
  endNow(id: string, changes: RunningFastEdits, now: number): Promise<Result<Fast, FastRefusal>>;
  /** Deletes a fast, running or not. */
  remove(id: string): Promise<Result<Fast, FastRefusal>>;
  /** Writes the tracking switch; switching off ends every running fast. Returns those it ended. */
  setTracking(on: boolean, now: number): Promise<Fast[]>;
  /** At start-up: with tracking off, ends every running fast. Returns those it ended. */
  settleOnOpen(now: number): Promise<Fast[]>;
  /** The tracking switch: on only when stored as true. */
  trackingOn(): Promise<boolean>;
  /** Every fast, oldest start first. */
  all(): Promise<Fast[]>;
  /** The running fast, if any. */
  active(): Promise<Fast | undefined>;
  /**
   * Fasts that ended on the local days `firstKey`…`lastKey`, plus any running fast (it belongs to
   * today; `fastsOnDay` places it), oldest start first.
   */
  between(firstKey: DayKey, lastKey: DayKey): Promise<Fast[]>;
  liveAll(): LiveFeed<Fast[]>;
  liveActive(): LiveFeed<Fast | undefined>;
  liveBetween(firstKey: DayKey, lastKey: DayKey): LiveFeed<Fast[]>;
}

/** The switch value of a `settings` row, or null when the row cannot be read as one. */
const readSwitch: Codec<boolean> = (raw) => {
  if (typeof raw !== 'object' || raw === null) return null;
  const { key, value } = raw as { key?: unknown; value?: unknown };
  return typeof key === 'string' && typeof value === 'boolean' ? value : null;
};

const FAST_TABLES: readonly TableName[] = ['fasts'];
const SWITCH_TABLES: readonly TableName[] = ['fasts', 'settings'];

export function createFastRepo(db: PlatewiseDb, options: FastRepoOptions = {}): FastRepo {
  const ids = options.ids ?? newId;

  const all = async (): Promise<Fast[]> =>
    (
      await readAll(db, 'fasts', decodeFast, {
        ...options,
        select: (table) => table.orderBy('start').toArray(),
      })
    ).items;

  const active = async (): Promise<Fast | undefined> => activeFast(await all());

  const between = async (firstKey: DayKey, lastKey: DayKey): Promise<Fast[]> =>
    (await all()).filter((fast) => fast.end === null || inDays(fast.end, firstKey, lastKey));

  /** Off unless stored as true; an unreadable value reads as off (and is kept aside). */
  const trackingOn = async (): Promise<boolean> => {
    const stored = await readOne(db, 'settings', FASTING_ON_KEY, readSwitch, options);
    return stored.kind === 'ok' && stored.value;
  };

  /** Writes one fast; inside a read-write transaction over `fasts`. */
  const save = async (fast: Fast): Promise<void> => {
    // A record that would not read back would vanish from every list: refuse it (and roll back).
    if (decodeFast(fast) === null) throw new TypeError(`Refusing to store an unreadable fast`);
    await guardKey(db, 'fasts', fast.id, decodeFast, options);
    await db.fasts.put(fast);
  };

  const drop = async (fast: Fast): Promise<void> => {
    await guardKey(db, 'fasts', fast.id, decodeFast, options);
    await db.fasts.delete(fast.id);
  };

  /** Reads the list, lets `decide` judge it and stores what it returns, in one transaction. */
  const decideAndSave = <E>(
    tables: readonly TableName[],
    decide: (fasts: Fast[]) => Promise<Result<Fast, E>> | Result<Fast, E>,
  ): Promise<Result<Fast, E>> =>
    transact(db, 'rw', tables, async () => {
      const decided = await decide(await all());
      if (decided.ok) await save(decided.value);
      return decided;
    });

  /** Deletes the fast `id` when `allowed` says so, in one transaction. */
  const decideAndDrop = (
    id: string,
    allowed: (fast: Fast) => FastRefusal | null,
  ): Promise<Result<Fast, FastRefusal>> =>
    transact(db, 'rw', FAST_TABLES, async () => {
      const found = (await all()).find((fast) => fast.id === id);
      if (found === undefined) return err('missing');
      const refusal = allowed(found);
      if (refusal !== null) return err(refusal);
      await drop(found);
      return ok(found);
    });

  /** Ends every running fast at `now`; inside a transaction over `fasts`. */
  const endRunning = async (now: number): Promise<Fast[]> => {
    // No overlap check: ending only shortens a running fast, so it cannot create an overlap,
    // and a refusal here would leave the fast running with no way to end it.
    const ended = (await all()).filter(isActive).map((fast) => ({
      ...fast,
      end: Math.max(now, fast.start),
      goalMin: clampGoalMin(fast.goalMin),
    }));
    for (const fast of ended) await save(fast);
    return ended;
  };

  return {
    start(goalMin, now) {
      const id = ids();
      return decideAndSave<StartRefusal>(SWITCH_TABLES, async (fasts) =>
        (await trackingOn()) ? startFast(fasts, id, goalMin, now) : err('tracking-off'),
      );
    },

    end: (id, now) => decideAndSave(FAST_TABLES, (fasts) => endNow(fasts, id, {}, now)),

    cancel: (id) => decideAndDrop(id, (fast) => (isActive(fast) ? null : 'ended')),

    edit: (id, changes) =>
      decideAndSave(FAST_TABLES, (fasts) => {
        const found = fasts.find((fast) => fast.id === id);
        if (found === undefined) return err('missing');
        return checkEdit(fasts, {
          id,
          start: changes.start ?? found.start,
          end: changes.end === undefined ? found.end : changes.end,
          goalMin: changes.goalMin ?? found.goalMin,
        });
      }),

    endNow: (id, changes, now) =>
      decideAndSave(FAST_TABLES, (fasts) => endNow(fasts, id, changes, now)),

    remove: (id) => decideAndDrop(id, () => null),

    setTracking: (on, now) =>
      transact(db, 'rw', SWITCH_TABLES, async () => {
        await guardKey(db, 'settings', FASTING_ON_KEY, readSwitch, options);
        await db.settings.put({ key: FASTING_ON_KEY, value: on });
        return on ? [] : await endRunning(now);
      }),

    settleOnOpen: (now) =>
      transact(db, 'rw', SWITCH_TABLES, async () => {
        if (await trackingOn()) return [];
        return await endRunning(now);
      }),

    trackingOn,
    all,
    active,
    between,
    liveAll: () => live(all),
    liveActive: () => live(active),
    liveBetween: (firstKey, lastKey) => live(() => between(firstKey, lastKey)),
  };
}

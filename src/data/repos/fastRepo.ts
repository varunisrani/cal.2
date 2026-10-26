// Fasts (R05.2, R05.3). Each operation opens one read-write transaction, reads the stored fasts
// there, asks the fasting rules (`src/domain/trackers/fasting.ts`) whether the change may happen,
// and writes the one resulting row or nothing. A refusal comes back as a value, never a throw, and
// leaves every row as it was. Turning fasting tracking off ends the running fast (it stays in
// history) in the same transaction as the switch, and a running fast that arrives with tracking
// off (a restore, an import) is ended on open, so a hidden fast can never keep food logging locked.

import type { PromiseExtended } from 'dexie';
import { addDays, startOfDay, type DayKey } from '../../domain/dates/dayKey';
import type { Fast } from '../../domain/model';
import {
  activeFast,
  canStart,
  checkEdit,
  endNow,
  isActive,
  newFast,
  type FastEdits,
  type FastRefusal,
} from '../../domain/trackers/fasting';
import { systemClock, type Clock } from '../../lib/clock';
import { newId as randomId, type IdSource } from '../../lib/ids';
import { err, ok, type Result } from '../../lib/result';
import { decodeFast, type Codec } from '../codecs';
import { GUARD_TABLES, decodeRows, readAll, readOne, removeRows, writeOne } from '../guard';
import type { PlatewiseDb } from '../schema';

/** The settings row of the fasting tracking switch; its value is a plain boolean, off when absent. */
export const FASTING_ON_KEY = 'fasting.on';

interface SwitchRow {
  key: typeof FASTING_ON_KEY;
  value: boolean;
}

const decodeSwitch: Codec<SwitchRow> = (raw) => {
  if (typeof raw !== 'object' || raw === null) return null;
  const { key, value } = raw as { key?: unknown; value?: unknown };
  return key === FASTING_ON_KEY && typeof value === 'boolean' ? { key, value } : null;
};

/** The fields an edit of a stored fast may change. */
export type FastChanges = Partial<Pick<Fast, 'start' | 'end' | 'goalMin'>>;

export type FastResult = Result<Fast, FastRefusal>;

export interface FastRepoOptions {
  /** Time stamps for kept-aside rows; defaults to the device clock. */
  clock?: Clock;
  newId?: IdSource;
}

export interface FastRepo {
  /** Starts a fast at `now` (goal clamped). Refused: `active`, `overlap`. */
  start(goalMin: number, now: number): Promise<FastResult>;
  /** Ends the running fast `id` at `now`, never before its start. */
  end(id: string, now: number): Promise<FastResult>;
  /** Deletes the running fast `id`; it never shows in history. Refused for a completed fast. */
  cancel(id: string): Promise<FastResult>;
  /** Applies an edit to a stored fast (end moved up to the start, goal clamped). */
  edit(id: string, changes: FastChanges): Promise<FastResult>;
  /** Applies the editor's start and goal and ends the running fast at `now`, as one write. */
  endNow(id: string, changes: FastEdits, now: number): Promise<FastResult>;
  /** Deletes any stored fast. Refused: `missing`. */
  remove(id: string): Promise<FastResult>;
  /** Writes the tracking switch; turning it off ends the running fast in the same transaction. */
  setTracking(on: boolean, now: number): Promise<Fast[]>;
  /** At start-up: ends a running fast while tracking is off (R05.2). Returns what it ended. */
  settleOnOpen(now: number): Promise<Fast[]>;
  /** Every fast, oldest start first. */
  list(): PromiseExtended<Fast[]>;
  /** The running fast, or null. */
  active(): PromiseExtended<Fast | null>;
  /** Fasts that meet the local days `firstKey`…`lastKey` (running ones reach to now), by start. */
  between(firstKey: DayKey, lastKey: DayKey): PromiseExtended<Fast[]>;
}

function checkNow(now: number): void {
  if (!Number.isFinite(now)) throw new RangeError(`now must be a finite instant, got ${now}`);
}

export function createFastRepo(db: PlatewiseDb, options: FastRepoOptions = {}): FastRepo {
  const clock = options.clock ?? systemClock;
  const newId = options.newId ?? randomId;
  const fastTables = [db.fasts, ...GUARD_TABLES];
  const switchTables = [db.fasts, db.settings, ...GUARD_TABLES];

  const decode = (rows: readonly unknown[]) =>
    decodeRows(db, 'fasts', rows, decodeFast, clock).items;

  async function storedFasts(): Promise<Fast[]> {
    return (await readAll(db, 'fasts', decodeFast, clock)).items;
  }

  // Inside a transaction over `fastTables`: writes a checked fast, or passes a refusal through.
  async function apply(result: FastResult): Promise<FastResult> {
    if (result.ok) await writeOne(db, 'fasts', result.value, decodeFast, clock);
    return result;
  }

  // One transaction over the fasts: read them, decide, write.
  function change(decide: (fasts: Fast[]) => Promise<FastResult>): Promise<FastResult> {
    return db.transaction('rw', fastTables, async () => decide(await storedFasts()));
  }

  // Inside a transaction over `switchTables`: ends every running fast at `now`. Ending only
  // shortens a fast, so each is checked on its own: an overlap already present in restored data
  // must not keep a fast running and the diary locked.
  async function endRunning(now: number): Promise<Fast[]> {
    const ended: Fast[] = [];
    for (const fast of (await storedFasts()).filter(isActive)) {
      const result = endNow([fast], fast.id, {}, now);
      if (!result.ok) continue;
      await writeOne(db, 'fasts', result.value, decodeFast, clock);
      ended.push(result.value);
    }
    return ended;
  }

  return {
    start(goalMin, now) {
      checkNow(now);
      return change(async (fasts) => {
        const refusal = canStart(fasts, now);
        return apply(refusal === null ? ok(newFast(newId(), goalMin, now)) : err(refusal));
      });
    },

    end(id, now) {
      checkNow(now);
      return change((fasts) => apply(endNow(fasts, id, {}, now)));
    },

    cancel(id) {
      return change(async (fasts) => {
        const stored = fasts.find((fast) => fast.id === id);
        if (stored === undefined) return err('missing');
        if (!isActive(stored)) return err('notActive');
        await removeRows(db, 'fasts', [id], decodeFast, clock);
        return ok(stored);
      });
    },

    edit(id, changes) {
      return change(async (fasts) => {
        const stored = fasts.find((fast) => fast.id === id);
        if (stored === undefined) return err('missing');
        return apply(checkEdit(fasts, { ...stored, ...changes, id }));
      });
    },

    endNow(id, changes, now) {
      checkNow(now);
      return change((fasts) => apply(endNow(fasts, id, changes, now)));
    },

    remove(id) {
      return change(async (fasts) => {
        const stored = fasts.find((fast) => fast.id === id);
        if (stored === undefined) return err('missing');
        await removeRows(db, 'fasts', [id], decodeFast, clock);
        return ok(stored);
      });
    },

    setTracking(on, now) {
      checkNow(now);
      return db.transaction('rw', switchTables, async () => {
        const row: SwitchRow = { key: FASTING_ON_KEY, value: on };
        await writeOne(db, 'settings', row, decodeSwitch, clock);
        return on ? [] : endRunning(now);
      });
    },

    settleOnOpen(now) {
      checkNow(now);
      return db.transaction('rw', switchTables, async () => {
        // An unreadable switch reads as off, its default (and is kept aside by the read).
        const stored = await readOne(db, 'settings', FASTING_ON_KEY, decodeSwitch, clock);
        if (stored.kind === 'ok' && stored.value.value) return [];
        return endRunning(now);
      });
    },

    list() {
      return db.fasts.orderBy('start').toArray().then(decode);
    },

    active() {
      return db.fasts
        .toArray()
        .then(decode)
        .then((fasts) => activeFast(fasts));
    },

    between(firstKey, lastKey) {
      const from = startOfDay(firstKey);
      const until = startOfDay(addDays(lastKey, 1));
      return db.fasts
        .where('start')
        .below(until)
        .toArray()
        .then(decode)
        .then((fasts) => fasts.filter((fast) => fast.end === null || fast.end >= from));
    },
  };
}

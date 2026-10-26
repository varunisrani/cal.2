// The diary service: how screens put food in the diary and take it out (first cut; P06 adds
// edit, re-log, copy and combine).
//
// Each action is single-flight (R02.11): while a log is being written, another log is turned
// away at once with `busy`, so a double tap on Save writes one row. The fast rule lives in the
// diary repository, which refuses inside its write transaction (R02.12); here that refusal
// becomes a `fastActive` answer for the paused dialog (D-16.35). Deleting a row releases, in the
// repository's same transaction, the photos nothing else uses (R02.8). After the first entry
// this service logs, the shell's hook asks the browser to keep our storage (D-16.8).

import { dayKeyOf } from '../domain/dates/dayKey';
import type { DiaryEntry, EntrySource, MealKind, NutritionDraft } from '../domain/model';
import { newId, type IdSource } from '../lib/ids';
import type { PlatewiseDb } from '../data/db';
import * as diaryRepo from '../data/repos/diaryRepo';

/** Where, when and how the food was logged; the draft holds what it was. */
export interface LogContext {
  /** When it was eaten (epoch ms): now for today, the viewed day at the current time otherwise. */
  loggedAt: number;
  meal: MealKind;
  source: EntrySource;
  /** Photo ids in gallery order, primary first; none by default. */
  photoIds?: readonly string[];
}

export type LogOutcome =
  | { kind: 'logged'; entry: DiaryEntry }
  /** A fast is running: nothing was written (the paused dialog offers End fast and log). */
  | { kind: 'fastActive'; fastId: string }
  /** Another log was still being written; this call did nothing. */
  | { kind: 'busy' };

export type DeleteOutcome =
  | 'deleted'
  /** No readable row with that id (already deleted, or kept aside as unreadable). */
  | 'missing'
  /** The same row was already being deleted; this call did nothing. */
  | 'busy';

export interface DiaryServiceDeps {
  db: PlatewiseDb;
  /** Makes entry ids; random UUIDs by default. */
  ids?: IdSource;
  /**
   * Asks the browser to keep our storage (D-16.8). Called once, right after the first entry this
   * service logs; not awaited, and its failures are ignored (it records its own outcome).
   */
  requestPersistenceAfterFirstEntry?: () => unknown;
}

export interface DiaryService {
  /**
   * Logs the draft as a new entry. Answers `fastActive` while a fast is running and `busy` while
   * another log is in flight, writing nothing in both cases; rejects on any other failure.
   */
  logEntry(draft: NutritionDraft, ctx: LogContext): Promise<LogOutcome>;
  /** Deletes the entry and the photos only it used. */
  deleteEntry(id: string): Promise<DeleteOutcome>;
}

/** Answer of a call the gate turned away. */
const TURNED_AWAY = Symbol('turned away');

/**
 * One task at a time per key: a call whose key is still running is turned away at once. The
 * check and the claim happen in the same synchronous step, so two calls in one tick see it.
 */
function singleFlight() {
  const running = new Set<string>();
  return async function run<T>(
    key: string,
    task: () => Promise<T>,
  ): Promise<T | typeof TURNED_AWAY> {
    if (running.has(key)) return TURNED_AWAY;
    running.add(key);
    try {
      return await task();
    } finally {
      running.delete(key);
    }
  };
}

/**
 * The food values of `draft` and nothing else (a saved meal or entry passed as a draft keeps its
 * id and order to itself), with energy as whole kcal and the macros as they are.
 */
function foodOf(draft: NutritionDraft): NutritionDraft {
  const { chosenUnit, chosenCount, emoji, note, product } = draft;
  return {
    name: draft.name,
    kcal: Math.round(draft.kcal),
    protein: draft.protein,
    carbs: draft.carbs,
    fat: draft.fat,
    nutrients: { ...draft.nutrients },
    extras: { ...draft.extras },
    basis: draft.basis,
    units: [...draft.units],
    lines: [...draft.lines],
    progressive: draft.progressive,
    ...(chosenUnit === undefined ? {} : { chosenUnit }),
    ...(chosenCount === undefined ? {} : { chosenCount }),
    ...(emoji === undefined ? {} : { emoji }),
    ...(note === undefined ? {} : { note }),
    ...(product === undefined ? {} : { product }),
  };
}

const LOG_KEY = 'log';

export function createDiaryService(deps: DiaryServiceDeps): DiaryService {
  const { db } = deps;
  const ids = deps.ids ?? newId;
  const run = singleFlight();
  let persistenceAsked = false;

  /** Calls the persistence hook after the first successful log; never fails the log. */
  const afterLogged = (): void => {
    if (persistenceAsked) return;
    persistenceAsked = true;
    try {
      void Promise.resolve(deps.requestPersistenceAfterFirstEntry?.()).catch(() => undefined);
    } catch {
      // The entry is already stored; asking for persistence is best effort.
    }
  };

  const write = async (draft: NutritionDraft, ctx: LogContext): Promise<LogOutcome> => {
    const entry: DiaryEntry = {
      ...foodOf(draft),
      id: ids(),
      loggedAt: ctx.loggedAt,
      dayKey: dayKeyOf(ctx.loggedAt),
      meal: ctx.meal,
      source: ctx.source,
      photoIds: [...(ctx.photoIds ?? [])],
    };
    try {
      const stored = await diaryRepo.add(db, entry);
      afterLogged();
      return { kind: 'logged', entry: stored };
    } catch (error) {
      if (error instanceof diaryRepo.FastActiveError) {
        return { kind: 'fastActive', fastId: error.fastId };
      }
      throw error;
    }
  };

  return {
    async logEntry(draft, ctx) {
      const outcome = await run(LOG_KEY, () => write(draft, ctx));
      return outcome === TURNED_AWAY ? { kind: 'busy' } : outcome;
    },

    async deleteEntry(id) {
      // Each row has its own gate: a repeated delete of one row runs once, another row's goes on.
      const outcome = await run(`delete:${id}`, () => diaryRepo.remove(db, id));
      if (outcome === TURNED_AWAY) return 'busy';
      return outcome ? 'deleted' : 'missing';
    },
  };
}

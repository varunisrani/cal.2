// The diary service: what screens call to add food to the diary or take it out (they never reach
// the repositories). One log runs at a time, so a double tap on Save or Log writes one row
// (R02.11). The repository refuses food while a fast runs (R02.12); here that refusal becomes a
// plain answer for the "logging paused" dialog. A delete hands the photos the entry held to the
// photo store, which deletes only those no other record uses. The first entry this service logs
// calls a hook once: the composition root points it at the persistent-storage request (D-16.8).
// P06 adds edit, combine, re-log and "end fast and log" here.

import { dayKeyOf } from '../domain/dates/dayKey';
import type { DiaryEntry, EntrySource, Fast, MealKind, NutritionDraft } from '../domain/model';
import { newId as randomId, type IdSource } from '../lib/ids';
import { FastActiveError, type DiaryRepo } from '../data/repos/diaryRepo';
import type { PhotoRepo } from '../data/repos/photoRepo';

/** Where a draft goes in the diary. */
export interface LogContext {
  /** The instant the food is filed under; its local day is the diary day. */
  readonly loggedAt: number;
  readonly meal: MealKind;
  readonly source: EntrySource;
  /** Photos already stored for this entry, primary first. */
  readonly photoIds?: readonly string[];
}

export type LogResult =
  | { readonly kind: 'logged'; readonly entry: DiaryEntry }
  /** A fast is running: nothing was written (the paused dialog, P07). */
  | { readonly kind: 'fastActive'; readonly fast: Fast }
  /** Another log was still being written: this call did nothing. */
  | { readonly kind: 'ignored' };

export type DeleteResult =
  /** The entry is gone; `releasedPhotoIds` are the photos deleted with it. */
  | { readonly kind: 'deleted'; readonly releasedPhotoIds: readonly string[] }
  /** The same entry was already being deleted: this call did nothing. */
  | { readonly kind: 'ignored' };

export interface DiaryService {
  /**
   * Logs `draft` as a new entry. Rejects only when the write fails for another reason (storage);
   * the next call may then try again.
   */
  logEntry(draft: NutritionDraft, ctx: LogContext): Promise<LogResult>;
  /** Deletes an entry (nothing happens when it is already gone) and releases its photos. */
  deleteEntry(id: string): Promise<DeleteResult>;
}

export interface DiaryServiceDeps {
  readonly diaryRepo: Pick<DiaryRepo, 'add' | 'remove'>;
  readonly photoRepo: Pick<PhotoRepo, 'releaseIfUnused'>;
  /** Ids for new entries; defaults to random UUIDs. */
  readonly newId?: IdSource;
  /** Called once, after the first entry this service logs (D-16.8). Its failures are dropped. */
  readonly onFirstEntry?: () => unknown;
}

const IGNORED = { kind: 'ignored' } as const;

/** Keys of the work in flight: a second call with a busy key is turned away. */
function createGate() {
  const busy = new Set<string>();
  return async function run<T, B>(key: string, work: () => Promise<T>, whenBusy: B) {
    if (busy.has(key)) return whenBusy;
    // Taken before the first await, so a call in the same tick already sees it.
    busy.add(key);
    try {
      return await work();
    } finally {
      busy.delete(key);
    }
  };
}

/** The entry to store: the draft's values with whole kcal, a new id and the day of its instant. */
function entryFrom(draft: NutritionDraft, ctx: LogContext, id: string): DiaryEntry {
  return {
    ...draft,
    kcal: Math.round(draft.kcal),
    id,
    loggedAt: ctx.loggedAt,
    dayKey: dayKeyOf(ctx.loggedAt),
    meal: ctx.meal,
    source: ctx.source,
    photoIds: [...(ctx.photoIds ?? [])],
  };
}

export function createDiaryService(deps: DiaryServiceDeps): DiaryService {
  const { diaryRepo, photoRepo, onFirstEntry } = deps;
  const newId = deps.newId ?? randomId;
  const gate = createGate();
  let loggedOnce = false;

  function afterFirstEntry(): void {
    if (loggedOnce) return;
    loggedOnce = true;
    if (!onFirstEntry) return;
    // Best effort: a refused or failing request must never undo or fail the log.
    try {
      Promise.resolve(onFirstEntry()).catch(() => undefined);
    } catch {
      // Dropped on purpose, as above.
    }
  }

  return {
    logEntry(draft, ctx) {
      return gate(
        'log',
        async (): Promise<LogResult> => {
          let entry: DiaryEntry;
          try {
            entry = await diaryRepo.add(entryFrom(draft, ctx, newId()));
          } catch (error) {
            if (error instanceof FastActiveError) return { kind: 'fastActive', fast: error.fast };
            throw error;
          }
          afterFirstEntry();
          return { kind: 'logged', entry };
        },
        IGNORED,
      );
    },

    deleteEntry(id) {
      return gate(
        `delete:${id}`,
        async (): Promise<DeleteResult> => {
          const held = await diaryRepo.remove(id);
          let released: readonly string[] = [];
          if (held.length > 0) {
            // The entry is already gone; a failed cleanup leaves the photos for the next prune.
            released = await photoRepo.releaseIfUnused(held).catch(() => []);
          }
          return { kind: 'deleted', releasedPhotoIds: released };
        },
        IGNORED,
      );
    },
  };
}

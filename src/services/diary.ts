// The diary service: what screens call to add food to the diary or take it out (they never reach
// the repositories). One log runs at a time, so a double tap on Save or Log writes one row
// (R02.11). The repository refuses food while a fast runs (R02.12); here that refusal becomes a
// plain answer for the "logging paused" dialog. A delete hands the photos the entry held to the
// photo store, which deletes only those no other record uses. The first entry this service logs
// calls a hook once: the composition root points it at the persistent-storage request (D-16.8).
// An edit (P06-11) replaces the stored entry and then offers the photos that write dropped to the
// photo store, the same way, so a photo a saved meal or another entry still names stays (R02.8).
// The editor's Saved switch passes through here to the saved meals. P06 adds combine, re-log and
// "end fast and log" here.

import { dayKeyOf } from '../domain/dates/dayKey';
import type {
  DiaryEntry,
  EntrySource,
  Fast,
  IngredientLine,
  MealKind,
  NutritionDraft,
} from '../domain/model';
import { newId as randomId, type IdSource } from '../lib/ids';
import { FastActiveError, type DiaryRepo } from '../data/repos/diaryRepo';
import { photoIdsOf, type PhotoRepo } from '../data/repos/photoRepo';
import type { SavedMealsRepo } from '../data/repos/savedMealsRepo';

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

export type UpdateEntryResult =
  /** Stored as given; `releasedPhotoIds` are the photos the edit dropped that were deleted. */
  | {
      readonly kind: 'updated';
      readonly entry: DiaryEntry;
      readonly releasedPhotoIds: readonly string[];
    }
  /** The entry was deleted meanwhile: nothing was written, and it does not come back. */
  | { readonly kind: 'missing' }
  /** The store refused the write while a fast runs: nothing was written. */
  | { readonly kind: 'fastActive'; readonly fast: Fast }
  /** The same entry was still being written: this call did nothing. */
  | { readonly kind: 'ignored' };

export type SavedToggleResult =
  /** The entry is now in the saved list, as a copy of it as given. */
  | { readonly kind: 'saved' }
  /** Its saved copies are gone; `releasedPhotoIds` are their photos nothing else named. */
  | { readonly kind: 'unsaved'; readonly releasedPhotoIds: readonly string[] }
  /** The entry's saved state was still being changed: this call did nothing. */
  | { readonly kind: 'ignored' };

export interface DiaryService {
  /**
   * Logs `draft` as a new entry. Rejects only when the write fails for another reason (storage);
   * the next call may then try again.
   */
  logEntry(draft: NutritionDraft, ctx: LogContext): Promise<LogResult>;
  /** Deletes an entry (nothing happens when it is already gone) and releases its photos. */
  deleteEntry(id: string): Promise<DeleteResult>;
  /**
   * Replaces the stored entry with the same id by `entry` exactly as given (its day follows its
   * instant), then deletes the photos the old entry held that `entry` does not, unless something
   * else names them. Rejects only when the write fails for another reason (storage). Optional
   * only until every stand-in diary carries it; `createDiaryService` always provides it.
   */
  updateEntry?(entry: DiaryEntry): Promise<UpdateEntryResult>;
  /**
   * Saves a copy of the entry as given to the saved list, or removes its saved copies when it has
   * any (D-16.17). Present when the service has the saved meals (`createDiaryService` with
   * `savedMealsRepo`); stand-ins may leave it out.
   */
  toggleSaved?(entry: DiaryEntry): Promise<SavedToggleResult>;
}

export interface DiaryServiceDeps {
  readonly diaryRepo: Pick<DiaryRepo, 'add' | 'remove' | 'update'>;
  readonly photoRepo: Pick<PhotoRepo, 'releaseIfUnused'>;
  /** The saved list, for `toggleSaved`; without it the service has no `toggleSaved`. */
  readonly savedMealsRepo?: Pick<SavedMealsRepo, 'toggleFromEntry'>;
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
export function entryFrom(draft: NutritionDraft, ctx: LogContext, id: string): DiaryEntry {
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

/** A record with photos of its own (the first is the primary) and parts with theirs. */
export interface PhotoHolder {
  readonly photoIds: readonly string[];
  readonly lines: readonly IngredientLine[];
}

/**
 * The record without the photos in `removed`, wherever it names them: its own list and every
 * part's. The photos left keep their order, so removing the primary makes the next one primary.
 * When the record's last own photo goes, the first photo its parts still hold becomes its primary
 * (the part keeps naming it). Nutrition and parts never change. Returns the record itself when it
 * names none of `removed`.
 */
export function withoutPhotos<R extends PhotoHolder>(record: R, removed: Iterable<string>): R {
  const gone = new Set(removed);
  if (!photoIdsOf(record).some((id) => gone.has(id))) return record;
  const kept = (ids: readonly string[]) => ids.filter((id) => !gone.has(id));
  const lines = record.lines.map((line) =>
    line.photoIds.some((id) => gone.has(id)) ? { ...line, photoIds: kept(line.photoIds) } : line,
  );
  let photoIds = kept(record.photoIds);
  if (photoIds.length === 0 && record.photoIds.length > 0) {
    photoIds = lines.flatMap((line) => line.photoIds).slice(0, 1);
  }
  return { ...record, photoIds, lines };
}

export function createDiaryService(deps: DiaryServiceDeps): DiaryService {
  const { diaryRepo, photoRepo, savedMealsRepo, onFirstEntry } = deps;
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

  /** Deletes those of `ids` nothing names; the write before it already happened. */
  async function release(ids: readonly string[]): Promise<readonly string[]> {
    if (ids.length === 0) return [];
    // A failed cleanup leaves the photos for the next prune.
    return photoRepo.releaseIfUnused(ids).catch(() => []);
  }

  const service: DiaryService = {
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
          return { kind: 'deleted', releasedPhotoIds: await release(held) };
        },
        IGNORED,
      );
    },

    updateEntry(entry) {
      return gate(
        `update:${entry.id}`,
        async (): Promise<UpdateEntryResult> => {
          let result: Awaited<ReturnType<DiaryRepo['update']>>;
          try {
            result = await diaryRepo.update(entry);
          } catch (error) {
            if (error instanceof FastActiveError) return { kind: 'fastActive', fast: error.fast };
            throw error;
          }
          if (result.kind === 'missing') return result;
          // Only what this edit dropped: the photos it kept, and every other photo, stay.
          const released = await release(result.releasedPhotoIds);
          return { kind: 'updated', entry: result.entry, releasedPhotoIds: released };
        },
        IGNORED,
      );
    },
  };

  if (savedMealsRepo) {
    service.toggleSaved = (entry) =>
      gate(
        `saved:${entry.id}`,
        async (): Promise<SavedToggleResult> => {
          const toggled = await savedMealsRepo.toggleFromEntry(entry);
          if (toggled.saved) return { kind: 'saved' };
          return { kind: 'unsaved', releasedPhotoIds: await release(toggled.photoIds) };
        },
        IGNORED,
      );
  }
  return service;
}

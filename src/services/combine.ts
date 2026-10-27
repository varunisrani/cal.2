// Combining diary entries into one (02 §3.15, P06-19): Home's picked rows become one entry built
// by the domain rule (P01-11: one part per row, energy and macros summed, a nutrient or extra
// summed only when every row knows it, D-16.20, at the time and meal of the latest row), stored
// with the originals removed in one transaction (R02.24). The rows are joined in the order they
// were eaten, so the name reads "first + second + third". A running fast refuses the write before
// anything changes (R02.12); here that refusal becomes a plain answer for the paused dialog. The
// photos the originals held that the new entry does not are offered to the photo store, which
// deletes only those nothing else names. One combine runs at a time.

import { combineEntries, type CombineWords } from '../domain/food/combine';
import type { DiaryEntry, Fast } from '../domain/model';
import { FastActiveError, MissingEntriesError, type DiaryRepo } from '../data/repos/diaryRepo';
import type { PhotoRepo } from '../data/repos/photoRepo';

export type { CombineWords } from '../domain/food/combine';

export type CombineResult =
  /** The combined entry as stored; the originals are gone. */
  | { readonly kind: 'combined'; readonly entry: DiaryEntry }
  /** A fast is running: nothing was written (the paused dialog). */
  | { readonly kind: 'fastActive'; readonly fast: Fast }
  /** Some of the entries were deleted meanwhile: nothing was written. */
  | { readonly kind: 'missing' }
  /** Fewer than two different entries were given: nothing was written. */
  | { readonly kind: 'tooFew' }
  /** Another combine was still being written: this call did nothing. */
  | { readonly kind: 'ignored' };

export interface CombineService {
  /**
   * Replaces `entries` (at least two) by one combined entry, all or nothing. Rejects only when
   * the write fails for another reason (storage); the next call may then try again.
   */
  combine(entries: readonly DiaryEntry[]): Promise<CombineResult>;
}

export interface CombineServiceDeps {
  readonly diaryRepo: Pick<DiaryRepo, 'combine'>;
  readonly photoRepo: Pick<PhotoRepo, 'releaseIfUnused'>;
  /** Catalogue words for the name: the one used when no row has a name; the "N others" tail. */
  readonly words: CombineWords;
}

/**
 * The entries once each, in the order they were eaten: oldest first, and entries logged at the
 * same instant in the order given.
 */
export function inEatingOrder(entries: readonly DiaryEntry[]): DiaryEntry[] {
  const seen = new Set<string>();
  const once = entries.filter((entry) => {
    if (seen.has(entry.id)) return false;
    seen.add(entry.id);
    return true;
  });
  // Array sort is stable, so equal instants keep the order given.
  return once.sort((a, b) => a.loggedAt - b.loggedAt);
}

export function createCombineService(deps: CombineServiceDeps): CombineService {
  const { diaryRepo, photoRepo, words } = deps;
  let busy = false;

  return {
    async combine(entries) {
      if (busy) return { kind: 'ignored' };
      const ordered = inEatingOrder(entries);
      const combined = combineEntries(ordered, words);
      if (combined === null) return { kind: 'tooFew' };
      // Taken before the first await, so a call in the same tick already sees it.
      busy = true;
      try {
        const ids = ordered.map((entry) => entry.id);
        let stored: Awaited<ReturnType<DiaryRepo['combine']>>;
        try {
          stored = await diaryRepo.combine(combined, ids);
        } catch (error) {
          if (error instanceof FastActiveError) return { kind: 'fastActive', fast: error.fast };
          if (error instanceof MissingEntriesError) return { kind: 'missing' };
          throw error;
        }
        if (stored.releasedPhotoIds.length > 0) {
          // A failed cleanup leaves the photos for the next prune; the combine stands.
          await photoRepo.releaseIfUnused(stored.releasedPhotoIds).catch(() => []);
        }
        return { kind: 'combined', entry: stored.entry };
      } finally {
        busy = false;
      }
    },
  };
}

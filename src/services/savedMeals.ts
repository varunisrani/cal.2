// What screens call to change the saved list (D-16.17, P06-12): remove a saved meal and move one
// to another place. A removed meal hands its photos to the photo store, which deletes only those
// nothing else names (the entry it was copied from usually still does, R02.8). Saving an entry
// from its editor or Home row joins this service with P06-11.

import type { PhotoRepo } from '../data/repos/photoRepo';
import type { SavedMealsRepo } from '../data/repos/savedMealsRepo';

export interface SavedMealsService {
  /** Deletes the saved meal (nothing happens when it is already gone) and releases its photos. */
  remove(id: string): Promise<void>;
  /**
   * Moves the meal at position `from` of the whole saved list to position `to` (clamped to the
   * list). Positions of a filtered list are not positions here, so screens move only while the
   * whole list shows (R02.7).
   */
  move(from: number, to: number): Promise<void>;
}

export interface SavedMealsServiceDeps {
  readonly savedMealsRepo: Pick<SavedMealsRepo, 'remove' | 'move'>;
  readonly photoRepo: Pick<PhotoRepo, 'releaseIfUnused'>;
}

export function createSavedMealsService(deps: SavedMealsServiceDeps): SavedMealsService {
  const { savedMealsRepo, photoRepo } = deps;
  return {
    async remove(id) {
      const held = await savedMealsRepo.remove(id);
      if (held.length === 0) return;
      // The meal is already gone; a failed cleanup leaves the photos for the next prune.
      await photoRepo.releaseIfUnused(held).catch(() => []);
    },

    async move(from, to) {
      await savedMealsRepo.move(from, to);
    },
  };
}

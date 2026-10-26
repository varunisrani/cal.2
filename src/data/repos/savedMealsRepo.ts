// Saved meals (D-16.17): frozen copies of diary entries, each with its own id, kept in the order
// the person chose. A copy remembers which entry it was made from (`originEntryId`) and nothing
// else about it: editing or deleting that entry later never changes the copy. Saving is a toggle
// on an entry, and two foods that share a name and calories are two separate saved meals.
//
// Photos: a saved meal lists photo ids like an entry does, and the photo store counts it as an
// owner. Removing saved meals here never deletes photos; `remove` and an unsaving toggle hand the
// removed meals back so the caller can release their photos through the photo store once the
// change has committed.

import type { DiaryEntry, NutritionDraft, SavedMeal } from '../../domain/model';
import type { Clock } from '../../lib/clock';
import { newId as randomId, type IdSource } from '../../lib/ids';
import { decodeDraft, decodeSavedMeal } from '../codecs';
import { transact, type PlatewiseDb } from '../db';
import { readAll, readOne, type GuardOptions } from '../guard';
import { live, type LiveFeed } from '../live';

export interface SavedMealsOptions {
  /** Ids for new saved meals; random UUIDs by default. */
  newId?: IdSource;
  /** Stamps the quarantine copies of unreadable rows; the device clock by default. */
  clock?: Clock;
}

export type ToggleResult =
  /** The entry was not saved: a copy now sits at the end of the list. */
  | { kind: 'saved'; meal: SavedMeal }
  /** The entry was saved: every saved meal made from it is gone (their photos may be unused). */
  | { kind: 'removed'; meals: SavedMeal[] };

export interface SavedMealsRepo {
  /** Readable saved meals in the person's order. Unreadable rows are left out and kept aside. */
  list(): Promise<SavedMeal[]>;
  /** `list()`, pushed again after every committed change. */
  feed(): LiveFeed<SavedMeal[]>;
  /** Unsaves the entry when a saved meal was made from it, else saves a copy at the end. */
  toggleFromEntry(entry: DiaryEntry): Promise<ToggleResult>;
  /** True when a readable saved meal was made from this entry. */
  isSaved(entryId: string): Promise<boolean>;
  /** Removes one saved meal; null when no readable saved meal has that id. */
  remove(id: string): Promise<SavedMeal | null>;
  /**
   * Takes the meal at position `from` out and puts it back at `to`, clamped to the list. Returns
   * false (and changes nothing) when `from` is not a position in the list or `to` is not a number.
   */
  move(from: number, to: number): Promise<boolean>;
}

/** Ascending `order`; equal orders (a missing order reads as 0) by id, so the list never shuffles. */
function inListOrder(a: SavedMeal, b: SavedMeal): number {
  if (a.order !== b.order) return a.order - b.order;
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
}

export function savedMealsRepo(db: PlatewiseDb, options: SavedMealsOptions = {}): SavedMealsRepo {
  const makeId = options.newId ?? randomId;
  const guard: GuardOptions = { clock: options.clock };

  // Sorted in memory rather than through the `order` index: a row without a numeric order is
  // missing from that index but still belongs in the list.
  async function readList(): Promise<SavedMeal[]> {
    const { items } = await readAll(db, 'savedMeals', decodeSavedMeal, guard);
    return items.sort(inListOrder);
  }

  async function madeFrom(entryId: string): Promise<SavedMeal[]> {
    const { items } = await readAll(db, 'savedMeals', decodeSavedMeal, {
      ...guard,
      select: (table) => table.where('originEntryId').equals(entryId).toArray(),
    });
    return items;
  }

  /**
   * The food values of `entry`: exactly the draft fields, freshly copied (nothing shared with the
   * entry), without what belongs to the entry itself (its id, time, day, meal and barcode key).
   */
  function foodOf(entry: DiaryEntry): NutritionDraft {
    const food = decodeDraft(entry);
    if (!food) throw new TypeError('Refusing to save an entry whose values would not read back');
    return food;
  }

  /** A new saved meal holding `food` from `entry`, placed after `last`. */
  function copyOf(entry: DiaryEntry, food: NutritionDraft, last: SavedMeal | undefined): SavedMeal {
    const copy = decodeSavedMeal({
      ...food,
      id: makeId(),
      order: last ? last.order + 1 : 0,
      originEntryId: entry.id,
      source: entry.source,
      photoIds: [...entry.photoIds],
    });
    if (!copy) throw new TypeError('Refusing to store a saved meal that would not read back');
    return copy;
  }

  return {
    list: readList,

    feed: () => live(readList),

    async toggleFromEntry(entry) {
      // Read before the transaction, so a bad entry fails without touching the table.
      const food = foodOf(entry);
      return transact(db, 'rw', ['savedMeals'], async (): Promise<ToggleResult> => {
        const earlier = await madeFrom(entry.id);
        if (earlier.length > 0) {
          await db.savedMeals.bulkDelete(earlier.map((meal) => meal.id));
          return { kind: 'removed', meals: earlier };
        }
        const meal = copyOf(entry, food, (await readList()).at(-1));
        // `add`, never `put`: a new saved meal never replaces a stored row.
        await db.savedMeals.add(meal);
        return { kind: 'saved', meal };
      });
    },

    async isSaved(entryId) {
      return (await madeFrom(entryId)).length > 0;
    },

    remove(id) {
      return transact(db, 'rw', ['savedMeals'], async () => {
        const found = await readOne(db, 'savedMeals', id, decodeSavedMeal, guard);
        // An unreadable row is not in the list the person sees; it stays where it is.
        if (found.kind !== 'ok') return null;
        await db.savedMeals.delete(id);
        return found.value;
      });
    },

    async move(from, to) {
      if (!Number.isInteger(from) || Number.isNaN(to)) return false;
      return transact(db, 'rw', ['savedMeals'], async () => {
        const meals = await readList();
        const [moving] = from >= 0 ? meals.splice(from, 1) : [];
        if (!moving) return false;
        const target = Math.min(Math.max(Math.trunc(to), 0), meals.length);
        meals.splice(target, 0, moving);
        // Renumber densely, writing only the rows whose position number changes.
        const renumbered = meals.flatMap((meal, index) =>
          meal.order === index ? [] : [{ ...meal, order: index }],
        );
        if (renumbered.length > 0) await db.savedMeals.bulkPut(renumbered);
        return target !== from;
      });
    },
  };
}

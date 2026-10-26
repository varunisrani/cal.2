// Saved meals (D-16.17): snapshots of logged entries that the person keeps for reuse. Each one is a
// copy with its own id and a position in the person's list, so two different foods that share a
// name and calories can both be saved. The copy remembers the entry it came from
// (`originEntryId`) for the heart on that entry, and nothing else of the entry's diary life: its
// time, day and meal are left behind, and later edits or the deletion of the entry never reach it.
// The copy names the entry's photos; the photo repository counts saved meals as owners, so those
// photos outlive the entry, and the ids handed back when a saved meal goes are only released when
// nothing else uses them.
//
// Every change is one read-write transaction. An unreadable saved row is dropped from reads and
// kept aside by the guard; toggles and moves work on the readable list and never touch it.

import type { PromiseExtended } from 'dexie';
import type { DiaryEntry, SavedMeal } from '../../domain/model';
import { systemClock, type Clock } from '../../lib/clock';
import { newId as randomId, type IdSource } from '../../lib/ids';
import { decodeSavedMeal } from '../codecs';
import { GUARD_TABLES, decodeRows, removeRows, writeOne } from '../guard';
import type { PlatewiseDb } from '../schema';
import { photoIdsOf } from './photoRepo';

/**
 * Either the new copy, or (when the entry's copies were removed) the photos they named, for
 * `photoRepo.releaseIfUnused`.
 */
export type ToggleResult = { saved: true; meal: SavedMeal } | { saved: false; photoIds: string[] };

export interface SavedMealsRepo {
  /** The readable saved meals in the person's order. */
  list(): PromiseExtended<SavedMeal[]>;
  /**
   * Removes the saved copies of this entry when there are any, else appends a new copy of it at
   * the end of the list.
   */
  toggleFromEntry(entry: DiaryEntry): Promise<ToggleResult>;
  /** True when a readable saved meal was copied from this entry. */
  isSaved(entryId: string): PromiseExtended<boolean>;
  /** Deletes a saved meal; returns its photos (empty when nothing was deleted). */
  remove(id: string): Promise<string[]>;
  /**
   * Takes the meal at position `from` out of the list and puts it back at `to`, clamped to the
   * list; returns the list in its new order. A `from` outside the list changes nothing.
   */
  move(from: number, to: number): Promise<SavedMeal[]>;
}

export interface SavedMealsRepoOptions {
  /** Time for quarantine copies; defaults to the device clock. */
  clock?: Clock;
  /** Ids for new saved meals; defaults to random UUIDs. */
  newId?: IdSource;
}

/** By position, then by id, so equal positions (after a restore) never swap places. */
function inOrder(meals: SavedMeal[]): SavedMeal[] {
  return meals.sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * The saved copy of an entry, read through the codec so it holds only saved-meal fields (its id
 * and position are set when it is stored). Throws a TypeError for an entry the codec cannot read.
 */
function snapshotOf(entry: DiaryEntry): SavedMeal {
  const meal = decodeSavedMeal({ ...entry, order: 0, originEntryId: entry.id });
  if (!meal) throw new TypeError(`Refusing to save entry "${entry.id}": it cannot be read back`);
  return meal;
}

export function createSavedMealsRepo(
  db: PlatewiseDb,
  options: SavedMealsRepoOptions = {},
): SavedMealsRepo {
  const clock = options.clock ?? systemClock;
  const newId = options.newId ?? randomId;

  /** One read-write transaction over the saved meals and the guard's tables. */
  function change<T>(work: () => Promise<T>): Promise<T> {
    return db.transaction('rw', ['savedMeals', ...GUARD_TABLES], work);
  }

  function decoded(rows: readonly unknown[]): SavedMeal[] {
    return decodeRows(db, 'savedMeals', rows, decodeSavedMeal, clock).items;
  }

  async function storedList(): Promise<SavedMeal[]> {
    return inOrder(decoded(await db.savedMeals.toArray()));
  }

  return {
    list: () => db.savedMeals.toArray().then((rows) => inOrder(decoded(rows))),

    async toggleFromEntry(entry) {
      const copy = snapshotOf(entry);
      return change(async (): Promise<ToggleResult> => {
        const meals = await storedList();
        const copies = meals.filter((meal) => meal.originEntryId === entry.id);
        if (copies.length > 0) {
          const ids = copies.map((meal) => meal.id);
          await removeRows(db, 'savedMeals', ids, decodeSavedMeal, clock);
          return { saved: false, photoIds: [...new Set(copies.flatMap(photoIdsOf))] };
        }
        const last = meals.reduce((highest, meal) => Math.max(highest, meal.order), -1);
        const meal: SavedMeal = { ...copy, id: newId(), order: last + 1 };
        await writeOne(db, 'savedMeals', meal, decodeSavedMeal, clock);
        return { saved: true, meal };
      });
    },

    isSaved: (entryId) =>
      db.savedMeals
        .where('originEntryId')
        .equals(entryId)
        .toArray()
        .then((rows) => decoded(rows).length > 0),

    remove: (id) =>
      change(async () => {
        const stored: unknown = await db.savedMeals.get(id);
        if (stored === undefined) return [];
        // An unreadable row is kept aside by the guard before it goes.
        await removeRows(db, 'savedMeals', [id], decodeSavedMeal, clock);
        const meal = decodeSavedMeal(stored);
        return meal ? photoIdsOf(meal) : [];
      }),

    move: (from, to) =>
      change(async () => {
        const meals = await storedList();
        if (!Number.isInteger(from) || from < 0 || from >= meals.length || Number.isNaN(to)) {
          return meals;
        }
        const [moved] = meals.splice(from, 1);
        if (moved === undefined) return meals;
        const target = Math.min(Math.max(Math.trunc(to), 0), meals.length);
        meals.splice(target, 0, moved);
        const reordered: SavedMeal[] = [];
        for (const [index, meal] of meals.entries()) {
          if (meal.order === index) {
            reordered.push(meal);
            continue;
          }
          const renumbered = { ...meal, order: index };
          await writeOne(db, 'savedMeals', renumbered, decodeSavedMeal, clock);
          reordered.push(renumbered);
        }
        return reordered;
      }),
  };
}

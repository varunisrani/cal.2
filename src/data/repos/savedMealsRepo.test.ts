import { describe, expect, it } from 'vitest';
import type { DiaryEntry } from '../../domain/model';
import { withIdSequence } from '../../lib/ids';
import { freshDbOptions, openTestDb } from '../../test/db';
import { factories } from '../../test/factories';
import { ready, watch } from '../../test/live';
import type { PlatewiseDb } from '../db';
import { hasUnreadableData } from '../guard';
import { savedMealsRepo, type ToggleResult } from './savedMealsRepo';

const make = factories();

function repoFor(db: PlatewiseDb) {
  return savedMealsRepo(db, { newId: withIdSequence('kept'), clock: make.clock });
}

/** Saves `entries` one after another and returns the repository. */
async function savedFrom(db: PlatewiseDb, entries: DiaryEntry[]) {
  const repo = repoFor(db);
  for (const entry of entries) await repo.toggleFromEntry(entry);
  return repo;
}

function savedMeal(result: ToggleResult) {
  if (result.kind !== 'saved') throw new Error(`expected a saved meal, got ${result.kind}`);
  return result.meal;
}

const names = (meals: { name: string }[]) => meals.map((meal) => meal.name);

describe('toggleFromEntry', () => {
  it('returns to an empty list when toggled twice', async () => {
    const db = await openTestDb();
    const repo = repoFor(db);
    const entry = make.entry();

    expect((await repo.toggleFromEntry(entry)).kind).toBe('saved');
    expect(await repo.isSaved(entry.id)).toBe(true);
    expect(await repo.list()).toHaveLength(1);

    const second = await repo.toggleFromEntry(entry);
    expect(second.kind).toBe('removed');
    expect(await repo.isSaved(entry.id)).toBe(false);
    expect(await repo.list()).toEqual([]);
    expect(await db.savedMeals.count()).toBe(0);
  });

  it('saves two foods with the same name and calories separately (ACC-D17-1, D-16.17)', async () => {
    const db = await openTestDb();
    const plain = make.entry({ name: 'Porridge', kcal: 300, protein: 9 });
    const loaded = make.entry({ name: 'Porridge', kcal: 300, protein: 21, note: 'with whey' });
    const repo = await savedFrom(db, [plain, loaded]);

    const both = await repo.list();
    expect(both.map((meal) => meal.originEntryId)).toEqual([plain.id, loaded.id]);
    expect(new Set(both.map((meal) => meal.id)).size).toBe(2);
    expect(both.map((meal) => meal.protein)).toEqual([9, 21]);

    // Unsaving one leaves the other: the reference's name + kcal key removed both.
    expect((await repo.toggleFromEntry(plain)).kind).toBe('removed');
    expect(await repo.isSaved(plain.id)).toBe(false);
    expect(await repo.isSaved(loaded.id)).toBe(true);
    expect((await repo.list()).map((meal) => meal.note)).toEqual(['with whey']);
  });

  it('appends a copy with its own id after the last saved meal', async () => {
    const db = await openTestDb();
    const repo = await savedFrom(db, [make.entry({ name: 'Toast' }), make.entry({ name: 'Eggs' })]);
    const entry = make.entry({
      name: 'Curry',
      meal: 'dinner',
      source: 'photo',
      photoIds: ['photo-7', 'photo-8'],
      emoji: '🍛',
    });

    const meal = savedMeal(await repo.toggleFromEntry(entry));

    expect(meal.id).toBe('kept-3');
    expect(meal.id).not.toBe(entry.id);
    expect(meal.order).toBe(2);
    expect(meal).toMatchObject({
      name: 'Curry',
      originEntryId: entry.id,
      source: 'photo',
      photoIds: ['photo-7', 'photo-8'],
      emoji: '🍛',
      kcal: entry.kcal,
      basis: entry.basis,
      units: entry.units,
      nutrients: entry.nutrients,
    });
    // Nothing that belongs to the entry itself is carried.
    for (const field of ['loggedAt', 'dayKey', 'meal', 'barcodeKey']) {
      expect(meal).not.toHaveProperty(field);
    }
    expect(await db.savedMeals.get(meal.id)).toEqual(meal);
    expect(names(await repo.list())).toEqual(['Toast', 'Eggs', 'Curry']);
  });

  it('removes every saved meal made from the entry', async () => {
    const db = await openTestDb();
    const entry = make.entry();
    // Two copies of one entry can only come from a restored backup.
    await db.savedMeals.bulkAdd([
      make.savedMeal({ originEntryId: entry.id }),
      make.savedMeal({ originEntryId: entry.id }),
      make.savedMeal({ name: 'Other', originEntryId: 'entry-other' }),
    ]);
    const repo = repoFor(db);

    const result = await repo.toggleFromEntry(entry);
    expect(result.kind === 'removed' && result.meals.map((meal) => meal.originEntryId)).toEqual([
      entry.id,
      entry.id,
    ]);
    expect(names(await repo.list())).toEqual(['Other']);
  });

  it('refuses an entry whose food values cannot be read and writes nothing', async () => {
    const db = await openTestDb();
    const repo = repoFor(db);
    const broken = { ...make.entry(), kcal: Number.NaN };
    await expect(repo.toggleFromEntry(broken)).rejects.toBeInstanceOf(TypeError);
    expect(await db.savedMeals.count()).toBe(0);
  });
});

describe('saved meals', () => {
  it('keeps the snapshot when the original entry is edited or deleted', async () => {
    const db = await openTestDb();
    const entry = make.entry({ name: 'Ramen', kcal: 540, lines: [], photoIds: ['photo-1'] });
    await db.entries.add(entry);
    const repo = repoFor(db);
    const saved = savedMeal(await repo.toggleFromEntry(entry));

    // Edit the original row, and the object the caller still holds.
    await db.entries.put({ ...entry, name: 'Ramen, large', kcal: 810, photoIds: [] });
    (entry.nutrients as Record<string, number>).fibre = 99;
    (entry.photoIds as string[]).push('photo-2');

    expect(await repo.list()).toEqual([saved]);
    expect(saved).toMatchObject({ name: 'Ramen', kcal: 540, photoIds: ['photo-1'] });
    expect(saved.nutrients.fibre).toBe(11);
    expect(await repo.isSaved(entry.id)).toBe(true);

    await db.entries.delete(entry.id);
    expect(await repo.list()).toEqual([saved]);
  });

  it('reorders across a reload', async () => {
    const options = freshDbOptions();
    const db = await openTestDb(options);
    const entries = ['A', 'B', 'C'].map((name) => make.entry({ name }));
    await (await savedFrom(db, entries)).move(2, 0);

    db.close();
    const reloaded = await openTestDb(options);
    expect(names(await repoFor(reloaded).list())).toEqual(['C', 'A', 'B']);
  });

  it('reads a missing order as 0 and keeps equal orders in a stable order', async () => {
    const db = await openTestDb();
    const { order: _dropped, ...unordered } = make.savedMeal({ id: 'saved-b', name: 'Late' });
    await db
      .table('savedMeals')
      .bulkPut([
        unordered,
        make.savedMeal({ id: 'saved-a', name: 'Early', order: 0 }),
        make.savedMeal({ id: 'saved-c', name: 'Second', order: 1 }),
      ]);
    const repo = repoFor(db);
    expect(names(await repo.list())).toEqual(['Early', 'Late', 'Second']);

    // A move renumbers every row, so the tie is gone.
    await repo.move(0, 2);
    expect((await repo.list()).map((meal) => [meal.name, meal.order])).toEqual([
      ['Late', 0],
      ['Second', 1],
      ['Early', 2],
    ]);
  });

  it('leaves an unreadable row out, keeps it aside and never touches it', async () => {
    const db = await openTestDb();
    const damaged = { id: 'saved-broken', name: 'Stew', kcal: 'lots', order: 0 };
    const entry = make.entry({ id: 'entry-stew' });
    await db.table('savedMeals').put({ ...damaged, originEntryId: entry.id });
    const repo = await savedFrom(db, [make.entry({ name: 'A' }), make.entry({ name: 'B' })]);

    expect(names(await repo.list())).toEqual(['A', 'B']);
    expect(await hasUnreadableData(db)).toBe(true);
    expect((await db.quarantine.toArray()).map((copy) => copy.key)).toEqual(['saved-broken']);

    // The person cannot see it, so the entry reads as not saved and saving makes a fresh copy.
    expect(await repo.isSaved(entry.id)).toBe(false);
    expect((await repo.toggleFromEntry(entry)).kind).toBe('saved');
    await repo.move(0, 9);
    expect(await repo.remove('saved-broken')).toBeNull();

    expect(names(await repo.list())).toEqual(['B', 'Lentil soup', 'A']);
    expect(await db.table('savedMeals').get('saved-broken')).toEqual({
      ...damaged,
      originEntryId: entry.id,
    });
    expect(await db.quarantine.count()).toBe(1);
  });

  it('pushes the new list to a live feed after a toggle', async () => {
    const db = await openTestDb();
    const repo = repoFor(db);
    const seen = watch(repo.feed());
    await seen.until(ready((meals) => meals.length === 0));

    await repo.toggleFromEntry(make.entry({ name: 'Bagel' }));
    await seen.until(ready((meals) => names(meals).join() === 'Bagel'));
  });
});

describe('move', () => {
  it('lands last when moved from 0 to 9 in a list of three', async () => {
    const db = await openTestDb();
    const entries = ['A', 'B', 'C'].map((name) => make.entry({ name }));
    const repo = await savedFrom(db, entries);

    expect(await repo.move(0, 9)).toBe(true);
    const list = await repo.list();
    expect(names(list)).toEqual(['B', 'C', 'A']);
    expect(list.map((meal) => meal.order)).toEqual([0, 1, 2]);
  });

  it('moves down and up by one like the row buttons', async () => {
    const db = await openTestDb();
    const repo = await savedFrom(
      db,
      ['A', 'B', 'C', 'D'].map((name) => make.entry({ name })),
    );
    await repo.move(1, 2);
    expect(names(await repo.list())).toEqual(['A', 'C', 'B', 'D']);
    await repo.move(3, 2);
    expect(names(await repo.list())).toEqual(['A', 'C', 'D', 'B']);
  });

  it('lands first for a negative target and changes nothing for an index outside the list', async () => {
    const db = await openTestDb();
    const repo = await savedFrom(
      db,
      ['A', 'B', 'C'].map((name) => make.entry({ name })),
    );
    expect(await repo.move(2, -4)).toBe(true);
    expect(names(await repo.list())).toEqual(['C', 'A', 'B']);

    const before = await db.savedMeals.toArray();
    for (const [from, to] of [
      [3, 0],
      [-1, 0],
      [0.5, 2],
      [0, Number.NaN],
    ] as const) {
      expect(await repo.move(from, to)).toBe(false);
    }
    expect(await repo.move(1, 1)).toBe(false);
    expect(await db.savedMeals.toArray()).toEqual(before);
  });
});

describe('remove', () => {
  it('returns the removed meal with its photo ids', async () => {
    const db = await openTestDb();
    const repo = await savedFrom(db, [
      make.entry({ name: 'Salad', photoIds: ['photo-3'] }),
      make.entry({ name: 'Soup' }),
    ]);
    const [salad] = await repo.list();

    const removed = await repo.remove(salad?.id ?? '');
    expect(removed).toEqual(salad);
    expect(removed?.photoIds).toEqual(['photo-3']);
    expect(names(await repo.list())).toEqual(['Soup']);
    expect(await repo.remove('saved-unknown')).toBeNull();
  });
});

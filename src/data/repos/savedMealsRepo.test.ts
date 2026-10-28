import { describe, expect, it } from 'vitest';
import type { DiaryEntry, SavedMeal } from '../../domain/model';
import { fixedClock } from '../../lib/clock';
import { withIdSequence } from '../../lib/ids';
import { storableBlob } from '../../test/blobs';
import { countRuns, openTestDb } from '../../test/db';
import { FACTORY_NOW, makeEntry, makeLine, makeSavedMeal } from '../../test/factories';
import { settleQuarantine } from '../guard';
import { live } from '../live';
import { createDiaryRepo } from './diaryRepo';
import { createPhotoRepo } from './photoRepo';
import { createSavedMealsRepo } from './savedMealsRepo';

const clock = fixedClock(FACTORY_NOW, 'America/New_York');

async function setUp() {
  const opened = await openTestDb();
  const saved = createSavedMealsRepo(opened.db, { clock, newId: withIdSequence('saved') });
  return { ...opened, saved };
}

/** What a saved copy of `entry` holds: its food values, none of its diary fields. */
function copyOf(entry: DiaryEntry, id: string, order: number): SavedMeal {
  const { loggedAt: _at, dayKey: _day, meal: _meal, ...food } = entry;
  return { ...food, id, order, originEntryId: entry.id };
}

function names(meals: readonly SavedMeal[]): string[] {
  return meals.map((meal) => meal.name);
}

/** Three entries saved in the order A, B, C. */
async function savedThree(saved: ReturnType<typeof createSavedMealsRepo>) {
  const entries = ['A', 'B', 'C'].map((name) => makeEntry({ name }));
  for (const entry of entries) await saved.toggleFromEntry(entry);
  return entries;
}

describe('toggleFromEntry', () => {
  it('returns to empty when toggled twice, handing back the photos of the copy', async () => {
    const { db, saved } = await setUp();
    const entry = makeEntry({ photoIds: ['p1'], lines: [makeLine({ photoIds: ['p2', 'p1'] })] });

    expect(await saved.toggleFromEntry(entry)).toEqual({
      saved: true,
      meal: copyOf(entry, 'saved-1', 0),
    });
    expect(await saved.list()).toEqual([copyOf(entry, 'saved-1', 0)]);
    expect(await saved.isSaved(entry.id)).toBe(true);

    expect(await saved.toggleFromEntry(entry)).toEqual({ saved: false, photoIds: ['p1', 'p2'] });
    expect(await saved.list()).toEqual([]);
    expect(await saved.isSaved(entry.id)).toBe(false);
    expect(await db.savedMeals.count()).toBe(0);
    db.close();
  });

  it("keeps the entry's price on the saved copy (D-16.107)", async () => {
    const { db, saved } = await setUp();
    const entry = makeEntry({ name: 'Paneer roll', price: { amount: 120, currency: 'INR' } });

    await saved.toggleFromEntry(entry);
    const [meal] = await saved.list();
    expect(meal?.price).toEqual({ amount: 120, currency: 'INR' });
    db.close();
  });

  it('saves two different foods with the same name and calories separately (ACC-D17-1, D-16.17)', async () => {
    const { db, saved } = await setUp();
    const homemade = makeEntry({ name: 'Greek salad', kcal: 350, protein: 9, fat: 28 });
    const takeaway = makeEntry({ name: 'Greek salad', kcal: 350, protein: 14, fat: 22 });

    await saved.toggleFromEntry(homemade);
    await saved.toggleFromEntry(takeaway);
    expect(await saved.list()).toEqual([
      copyOf(homemade, 'saved-1', 0),
      copyOf(takeaway, 'saved-2', 1),
    ]);
    expect(await saved.isSaved(homemade.id)).toBe(true);
    expect(await saved.isSaved(takeaway.id)).toBe(true);

    // Taking one off keeps the other.
    await saved.toggleFromEntry(homemade);
    expect(await saved.list()).toEqual([copyOf(takeaway, 'saved-2', 1)]);
    expect(await saved.isSaved(homemade.id)).toBe(false);
    expect(await saved.isSaved(takeaway.id)).toBe(true);
    db.close();
  });

  it('keeps the snapshot when the original entry is edited, then deleted (D-16.17)', async () => {
    const { db, saved } = await setUp();
    const diary = createDiaryRepo(db, { clock });
    const entry = await diary.add(makeEntry({ name: 'Overnight oats', kcal: 380 }));
    await saved.toggleFromEntry(entry);

    await diary.update({ ...entry, name: 'Overnight oats with honey', kcal: 450, protein: 2 });
    expect(await saved.list()).toEqual([copyOf(entry, 'saved-1', 0)]);

    await diary.remove(entry.id);
    expect(await saved.list()).toEqual([copyOf(entry, 'saved-1', 0)]);
    db.close();
  });

  it('keeps the photos a saved meal names after its entry is deleted, and releases them once it goes (R02.8)', async () => {
    const { db, saved } = await setUp();
    const diary = createDiaryRepo(db, { clock });
    const photos = createPhotoRepo(db, { clock, newId: withIdSequence('photo') });
    const photo = await photos.put(await storableBlob(16), { width: 4, height: 4 });
    const entry = await diary.add(makeEntry({ photoIds: [photo] }));
    const result = await saved.toggleFromEntry(entry);
    if (!result.saved) throw new Error('expected a saved copy');

    expect(await photos.releaseIfUnused(await diary.remove(entry.id))).toEqual([]);
    expect(await photos.get(photo)).not.toBeNull();

    expect(await saved.remove(result.meal.id)).toEqual([photo]);
    expect(await photos.releaseIfUnused([photo])).toEqual([photo]);
    expect(await photos.get(photo)).toBeNull();
    db.close();
  });

  it('appends a new copy after the highest stored position', async () => {
    const { db, saved } = await setUp();
    const older = makeSavedMeal({ id: 'older', order: 5 });
    await db.savedMeals.put(older);
    const entry = makeEntry();

    expect(await saved.toggleFromEntry(entry)).toEqual({
      saved: true,
      meal: copyOf(entry, 'saved-1', 6),
    });
    expect(await saved.list()).toEqual([older, copyOf(entry, 'saved-1', 6)]);
    db.close();
  });

  it('refuses an entry it cannot read back and stores nothing', async () => {
    const { db, saved } = await setUp();
    const unreadable = { ...makeEntry(), kcal: Number.NaN };

    await expect(saved.toggleFromEntry(unreadable)).rejects.toBeInstanceOf(TypeError);
    expect(await db.savedMeals.count()).toBe(0);
    db.close();
  });
});

describe('move', () => {
  it('puts the meal last when moved from 0 to 9 in a list of 3', async () => {
    const { db, saved } = await setUp();
    await savedThree(saved);

    const moved = await saved.move(0, 9);
    expect(names(moved)).toEqual(['B', 'C', 'A']);
    expect(moved.map((meal) => meal.order)).toEqual([0, 1, 2]);
    expect(await saved.list()).toEqual(moved);
    db.close();
  });

  it('puts the meal first for a negative target, and changes nothing for a position outside the list', async () => {
    const { db, saved } = await setUp();
    await savedThree(saved);

    expect(names(await saved.move(2, -4))).toEqual(['C', 'A', 'B']);
    const before = await saved.list();
    for (const [from, to] of [
      [3, 0],
      [-1, 0],
      [0.5, 2],
      [0, Number.NaN],
    ] as const) {
      expect(await saved.move(from, to)).toEqual(before);
    }
    expect(await saved.list()).toEqual(before);
    db.close();
  });

  it('closes the gaps a remove leaves, and keeps the new order after a reopen', async () => {
    const { db, factory, name, saved } = await setUp();
    await savedThree(saved);
    const [, middle] = await saved.list();
    await saved.remove(middle?.id ?? '');
    expect((await saved.list()).map((meal) => meal.order)).toEqual([0, 2]);

    expect(names(await saved.move(1, 0))).toEqual(['C', 'A']);
    db.close();

    const reopened = await openTestDb({ indexedDB: factory, name });
    const list = await createSavedMealsRepo(reopened.db, { clock }).list();
    expect(names(list)).toEqual(['C', 'A']);
    expect(list.map((meal) => meal.order)).toEqual([0, 1]);
    reopened.db.close();
  });

  it('lists meals stored at the same position by id, so they never swap places', async () => {
    const { db, saved } = await setUp();
    const second = makeSavedMeal({ id: 'b', order: 0, name: 'second' });
    const first = makeSavedMeal({ id: 'a', order: 0, name: 'first' });
    await db.savedMeals.bulkPut([second, first]);

    expect(await saved.list()).toEqual([first, second]);
    expect(await saved.move(0, 1)).toEqual([
      { ...second, order: 0 },
      { ...first, order: 1 },
    ]);
    db.close();
  });
});

describe('isSaved and remove', () => {
  it('deletes one saved meal, returns its photos, and does nothing for an id not stored', async () => {
    const { db, saved } = await setUp();
    const entries = await savedThree(saved);
    const [first] = await saved.list();
    await db.savedMeals.update(first?.id ?? '', { photoIds: ['p9'] });

    expect(await saved.remove(first?.id ?? '')).toEqual(['p9']);
    expect(names(await saved.list())).toEqual(['B', 'C']);
    expect(await saved.isSaved(entries[0]?.id ?? '')).toBe(false);
    expect(await saved.isSaved(entries[1]?.id ?? '')).toBe(true);

    expect(await saved.remove('not-stored')).toEqual([]);
    expect(names(await saved.list())).toEqual(['B', 'C']);
    db.close();
  });
});

describe('unreadable saved rows', () => {
  it('skips an unreadable row, keeps it aside, and never touches it on toggle or move (R06.1)', async () => {
    const { db, saved } = await setUp();
    const entry = makeEntry();
    const broken = { id: 'broken', order: 0, originEntryId: entry.id, name: 'no numbers' };
    await db.savedMeals.put(broken as never);

    expect(await saved.list()).toEqual([]);
    expect(await saved.isSaved(entry.id)).toBe(false);
    // The heart reads "not saved", so the toggle saves a readable copy next to it.
    expect(await saved.toggleFromEntry(entry)).toEqual({
      saved: true,
      meal: copyOf(entry, 'saved-1', 0),
    });
    await saved.toggleFromEntry(makeEntry({ name: 'B' }));
    expect(names(await saved.move(0, 1))).toEqual(['B', entry.name]);
    await settleQuarantine(db);

    expect(await db.savedMeals.get('broken')).toEqual(broken);
    expect(await db.quarantine.toArray()).toEqual([
      expect.objectContaining({ table: 'savedMeals', key: 'broken', raw: broken }),
    ]);
    db.close();
  });

  it('keeps an unreadable row aside before remove deletes it', async () => {
    const { db, saved } = await setUp();
    const broken = { id: 'broken', order: 0, name: 'no numbers' };
    await db.savedMeals.put(broken as never);

    expect(await saved.remove('broken')).toEqual([]);
    expect(await db.savedMeals.count()).toBe(0);
    expect(await db.quarantine.toArray()).toEqual([
      expect.objectContaining({ table: 'savedMeals', key: 'broken', raw: broken }),
    ]);
    db.close();
  });
});

describe('list', () => {
  it('follows a toggle through a live query (R06.3)', async () => {
    const { db, saved } = await setUp();
    const counted = countRuns(() => saved.list());
    const source = live(counted.query);
    const stop = source.subscribe(() => undefined);
    await counted.untilRuns(1);
    expect(source.getSnapshot()).toEqual({ status: 'ready', value: [] });

    const entry = makeEntry();
    await saved.toggleFromEntry(entry);
    await counted.untilRuns(2);

    expect(source.getSnapshot()).toEqual({
      status: 'ready',
      value: [copyOf(entry, 'saved-1', 0)],
    });
    stop();
    counted.close();
    db.close();
  });
});

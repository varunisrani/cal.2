import { afterEach, describe, expect, it } from 'vitest';
import { createDiaryRepo } from '../data/repos/diaryRepo';
import { createPhotoRepo, type PhotoRepo } from '../data/repos/photoRepo';
import { createSavedMealsRepo } from '../data/repos/savedMealsRepo';
import type { PlatewiseDb } from '../data/schema';
import { storableBlob } from '../test/blobs';
import { openTestDb } from '../test/db';
import { makeEntry, makeSavedMeal } from '../test/factories';
import { createSavedMealsService } from './savedMeals';

const opened: PlatewiseDb[] = [];
afterEach(() => {
  for (const db of opened.splice(0)) db.close();
});

async function setUp() {
  const { db } = await openTestDb();
  opened.push(db);
  const savedMealsRepo = createSavedMealsRepo(db);
  const photoRepo = createPhotoRepo(db);
  const service = createSavedMealsService({ savedMealsRepo, photoRepo });
  return { db, savedMealsRepo, photoRepo, service };
}

function storePhoto(photoRepo: PhotoRepo, size: number): Promise<string> {
  return storableBlob(size).then((blob) => photoRepo.put(blob, { width: 800, height: 600 }));
}

describe('createSavedMealsService', () => {
  it('removes a saved meal and lets go of a photo nothing else names', async () => {
    const { db, savedMealsRepo, photoRepo, service } = await setUp();
    const own = await storePhoto(photoRepo, 1_000);
    const shared = await storePhoto(photoRepo, 2_000);
    await createDiaryRepo(db).add(makeEntry({ photoIds: [shared] }));
    await db.savedMeals.add(makeSavedMeal({ id: 's1', photoIds: [own, shared] }));

    await service.remove('s1');

    expect(await savedMealsRepo.list()).toEqual([]);
    expect(await photoRepo.get(own)).toBeNull();
    expect((await photoRepo.get(shared))?.id).toBe(shared);
  });

  it('does nothing for a meal that is already gone', async () => {
    const { service } = await setUp();
    await expect(service.remove('missing')).resolves.toBeUndefined();
  });

  it('moves a meal by its place in the whole list', async () => {
    const { db, savedMealsRepo, service } = await setUp();
    await db.savedMeals.bulkAdd([
      makeSavedMeal({ id: 'a', order: 0 }),
      makeSavedMeal({ id: 'b', order: 1 }),
      makeSavedMeal({ id: 'c', order: 2 }),
    ]);

    await service.move(2, 1);

    expect((await savedMealsRepo.list()).map((meal) => meal.id)).toEqual(['a', 'c', 'b']);
  });
});

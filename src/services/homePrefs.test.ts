import { afterEach, describe, expect, it } from 'vitest';
import { createSettingsRepo, InvalidSettingError } from '../data/repos/settingsRepo';
import type { PillarKey } from '../domain/nutrients/catalogue';
import { openTestDb } from '../test/db';
import { createHomePrefsService } from './homePrefs';

const closers: Array<() => void> = [];
afterEach(() => {
  for (const close of closers.splice(0)) close();
});

async function setUp() {
  const { db, bus } = await openTestDb();
  closers.push(() => db.close());
  const settingsRepo = createSettingsRepo(db, { locale: 'en-US', bus });
  return { settingsRepo, service: createHomePrefsService({ settingsRepo }) };
}

describe('setPillars', () => {
  it('stores the pillars in the order they were picked', async () => {
    const h = await setUp();

    const stored = await h.service.setPillars(['sodium', 'protein', 'vitaminD']);

    expect(stored).toEqual(['sodium', 'protein', 'vitaminD']);
    expect(await h.settingsRepo.get('home.pillars')).toEqual(['sodium', 'protein', 'vitaminD']);
  });

  it('refuses an empty choice and keeps what was stored', async () => {
    const h = await setUp();
    await h.service.setPillars(['iron']);

    await expect(h.service.setPillars([])).rejects.toBeInstanceOf(InvalidSettingError);
    // Water is Home's own pillar, never one to choose.
    await expect(h.service.setPillars(['water' as PillarKey])).rejects.toBeInstanceOf(
      InvalidSettingError,
    );
    expect(await h.settingsRepo.get('home.pillars')).toEqual(['iron']);
  });
});

describe('setSort', () => {
  it('stores how the diary forms its sections', async () => {
    const h = await setUp();
    expect(await h.settingsRepo.get('home.sort')).toBe('byMeal');

    await h.service.setSort('newestFirst');

    expect(await h.settingsRepo.get('home.sort')).toBe('newestFirst');
  });
});

describe('setSugarLine (D-16.98)', () => {
  it('stores whether Home shows the Sugar line, on until turned off', async () => {
    const h = await setUp();
    expect(await h.settingsRepo.get('home.sugarLine')).toBe(true);

    await h.service.setSugarLine(false);
    expect(await h.settingsRepo.get('home.sugarLine')).toBe(false);

    await h.service.setSugarLine(true);
    expect(await h.settingsRepo.get('home.sugarLine')).toBe(true);
  });
});

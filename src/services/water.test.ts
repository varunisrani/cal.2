import { afterEach, describe, expect, it } from 'vitest';
import { createSettingsRepo, InvalidSettingError } from '../data/repos/settingsRepo';
import { createWaterRepo } from '../data/repos/waterRepo';
import { fixedClock } from '../lib/clock';
import { openTestDb } from '../test/db';
import { FACTORY_NOW } from '../test/factories';
import { createWaterService } from './water';

const HOUR = 60 * 60 * 1000;

const closers: Array<() => void> = [];
afterEach(() => {
  for (const close of closers.splice(0)) close();
});

async function setUp() {
  const { db, bus } = await openTestDb();
  closers.push(() => db.close());
  const settingsRepo = createSettingsRepo(db, { locale: 'en-US', bus });
  const waterRepo = createWaterRepo(db);
  // Monday 26 October 2026, 12:30 in New York.
  const service = createWaterService({
    waterRepo,
    settingsRepo,
    clock: fixedClock(FACTORY_NOW, 'America/New_York'),
  });
  return { settingsRepo, waterRepo, service };
}

describe('logWater', () => {
  it('stamps a log for today now', async () => {
    const h = await setUp();

    const log = await h.service.logWater(500, '2026-10-26');

    expect(log).toEqual({ id: expect.any(String), at: FACTORY_NOW, dayKey: '2026-10-26', ml: 500 });
    expect(await h.waterRepo.byDay('2026-10-26')).toEqual([log]);
  });

  it('puts a log for an earlier day on that day at the current clock time', async () => {
    const h = await setUp();

    const log = await h.service.logWater(250, '2026-10-20');

    expect(log.dayKey).toBe('2026-10-20');
    expect(log.at).toBe(FACTORY_NOW - 6 * 24 * HOUR);
    expect(await h.waterRepo.byDay('2026-10-26')).toEqual([]);
  });

  it('takes a day after today as today', async () => {
    const h = await setUp();

    const log = await h.service.logWater(750, '2026-10-27');

    expect(log).toMatchObject({ at: FACTORY_NOW, dayKey: '2026-10-26' });
  });

  it('refuses more than 5 000 ml, nothing, and part of a ml, storing nothing (ACC-H3-1, D-16.39)', async () => {
    const h = await setUp();

    for (const ml of [6_000, 5_001, 0, -250, 2.5, Number.NaN]) {
      await expect(h.service.logWater(ml, '2026-10-26')).rejects.toBeInstanceOf(RangeError);
    }
    await expect(h.service.logWater(250, '26 Oct')).rejects.toBeInstanceOf(RangeError);
    expect(await h.waterRepo.byDay('2026-10-26')).toEqual([]);

    await h.service.logWater(5_000, '2026-10-26');
    expect((await h.waterRepo.byDay('2026-10-26')).map((log) => log.ml)).toEqual([5_000]);
  });
});

describe('deleteLog', () => {
  it('deletes one log and keeps the others; a log already gone does nothing', async () => {
    const h = await setUp();
    const first = await h.service.logWater(250, '2026-10-26');
    const second = await h.service.logWater(500, '2026-10-26');

    await h.service.deleteLog(first.id);
    await h.service.deleteLog(first.id);

    expect(await h.waterRepo.byDay('2026-10-26')).toEqual([second]);
  });
});

describe('settings', () => {
  it('turns the water reminder off with tracking, keeping its time and the logs', async () => {
    const h = await setUp();
    await h.service.setTracking(true);
    await h.settingsRepo.set('remind.water', { on: true, at: '15:30' });
    await h.service.logWater(500, '2026-10-26');

    await h.service.setTracking(false);

    expect(await h.settingsRepo.get('water.on')).toBe(false);
    expect(await h.settingsRepo.get('remind.water')).toEqual({ on: false, at: '15:30' });
    expect(await h.waterRepo.byDay('2026-10-26')).toHaveLength(1);
  });

  it('leaves the reminder alone when tracking goes on', async () => {
    const h = await setUp();

    await h.service.setTracking(true);

    expect(await h.settingsRepo.get('water.on')).toBe(true);
    expect(await h.settingsRepo.get('remind.water')).toEqual({ on: false, at: '14:00' });
  });

  it('stores the goal and the unit', async () => {
    const h = await setUp();

    await h.service.setGoal(2_070);
    await h.service.setUnit('flOz');

    expect(await h.settingsRepo.get('water.goalMl')).toBe(2_070);
    expect(await h.settingsRepo.get('water.unit')).toBe('flOz');
  });

  it('stores three quick-add amounts smallest first and refuses any other list', async () => {
    const h = await setUp();

    expect(await h.service.setQuickAdd([750, 237, 500])).toEqual([237, 500, 750]);
    expect(await h.settingsRepo.get('water.quickAddMl')).toEqual([237, 500, 750]);

    await expect(h.service.setQuickAdd([250, 500])).rejects.toBeInstanceOf(InvalidSettingError);
    await expect(h.service.setQuickAdd([250, 500, 5_001])).rejects.toBeInstanceOf(
      InvalidSettingError,
    );
    expect(await h.settingsRepo.get('water.quickAddMl')).toEqual([237, 500, 750]);
  });
});

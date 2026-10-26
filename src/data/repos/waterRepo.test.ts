import { describe, expect, it } from 'vitest';
import { withIdSequence } from '../../lib/ids';
import { openTestDb } from '../../test/db';
import { FACTORY_NOW, factories } from '../../test/factories';
import { ready, watch } from '../../test/live';
import { inTimeZone } from '../../test/time';
import { createWaterRepo } from './waterRepo';

const make = factories();
const clock = make.clock;
const NOW = FACTORY_NOW;

async function setup() {
  const db = await openTestDb();
  const repo = createWaterRepo(db, { ids: withIdSequence('drink'), clock });
  return { db, repo };
}

/** Local wall-clock time in the test zone (New York). */
function local(year: number, month: number, day: number, hour = 12, minute = 0): number {
  return new Date(year, month - 1, day, hour, minute).getTime();
}

describe('add', () => {
  it('stores whole ml under the local day of the time it was drunk', async () => {
    const { db, repo } = await setup();
    // 23:30 in New York is already the next day in UTC.
    const lateEvening = local(2026, 10, 26, 23, 30);

    const log = await repo.add({ at: lateEvening, ml: 250.4 });

    expect(log).toEqual({ id: 'drink-1', at: lateEvening, dayKey: '2026-10-26', ml: 250 });
    expect(await db.water.toArray()).toEqual([log]);
  });

  it('files the same instant under the day of the zone the device is in', async () => {
    const { repo } = await setup();
    const instant = Date.UTC(2026, 9, 26, 16, 30);

    const log = await inTimeZone('Asia/Tokyo', () => repo.add({ at: instant, ml: 300 }));

    expect(log.dayKey).toBe('2026-10-27');
  });

  it('takes 1 to 5 000 ml, rounding a trace up to 1 ml (D-16.39)', async () => {
    const { repo } = await setup();

    expect((await repo.add({ at: NOW, ml: 0.4 })).ml).toBe(1);
    expect((await repo.add({ at: NOW, ml: 5000 })).ml).toBe(5000);
  });

  it('refuses an amount outside 1–5 000 ml or a time that is not an instant, and stores nothing', async () => {
    const { db, repo } = await setup();

    for (const ml of [0, -250, 5001, 99_999, Number.NaN, Number.POSITIVE_INFINITY]) {
      await expect(repo.add({ at: NOW, ml })).rejects.toThrow(RangeError);
    }
    await expect(repo.add({ at: Number.NaN, ml: 250 })).rejects.toThrow(RangeError);

    expect(await db.water.count()).toBe(0);
  });
});

describe('remove', () => {
  it('deletes one log and answers false for an id that is not stored', async () => {
    const { db, repo } = await setup();
    const kept = await repo.add({ at: NOW, ml: 250 });
    const gone = await repo.add({ at: NOW + 60_000, ml: 500 });

    expect(await repo.remove(gone.id)).toBe(true);
    expect(await repo.remove('nothing-here')).toBe(false);

    expect(await db.water.toArray()).toEqual([kept]);
  });

  it('keeps an unreadable log aside before deleting it', async () => {
    const { db, repo } = await setup();
    const broken = { id: 'drink-broken', at: NOW, ml: 'a glass' };
    await db.table('water').put(broken);

    expect(await repo.remove('drink-broken')).toBe(true);

    expect(await db.water.count()).toBe(0);
    expect((await db.quarantine.toArray()).map((row) => row.raw)).toEqual([broken]);
  });
});

describe('byDay', () => {
  it('lists one local day newest first across midnight in New York', async () => {
    const { db, repo } = await setup();
    const times = [
      local(2026, 10, 26, 8, 0),
      local(2026, 10, 25, 23, 59),
      local(2026, 10, 26, 23, 59),
      local(2026, 10, 27, 0, 0),
      local(2026, 10, 26, 0, 0),
    ];
    for (const at of times) await repo.add({ at, ml: 250 });
    await db.table('water').put({ id: 'drink-broken', at: NOW, dayKey: '2026-10-26', ml: 0 });

    const day = await repo.byDay('2026-10-26');

    expect(day.map((log) => log.at)).toEqual([
      local(2026, 10, 26, 23, 59),
      local(2026, 10, 26, 8, 0),
      local(2026, 10, 26, 0, 0),
    ]);
  });

  it('pushes an add and a delete to a live day feed', async () => {
    const { repo } = await setup();
    const day = watch(repo.liveDay('2026-10-26'));
    await day.until(ready((logs) => logs.length === 0));

    const log = await repo.add({ at: NOW, ml: 330 });
    await day.until(ready((logs) => logs.length === 1 && logs[0]?.ml === 330));

    await repo.remove(log.id);
    await day.until(ready((logs) => logs.length === 0));
  });
});

import { describe, expect, it } from 'vitest';
import { fixedClock } from '../../lib/clock';
import { withIdSequence } from '../../lib/ids';
import { countRuns, openTestDb } from '../../test/db';
import { FACTORY_NOW, makeWater } from '../../test/factories';
import { settleQuarantine } from '../guard';
import { live } from '../live';
import { createWaterRepo } from './waterRepo';

const clock = fixedClock(FACTORY_NOW, 'America/New_York');

async function setup() {
  const { db } = await openTestDb();
  const repo = createWaterRepo(db, { clock, newId: withIdSequence('water') });
  return { db, repo };
}

describe('add', () => {
  it('files a log under the local day of its instant and lists a day newest first', async () => {
    const { db, repo } = await setup();
    const lateOn25 = Date.parse('2026-10-25T23:30:00-04:00');
    const justAfterMidnight = Date.parse('2026-10-26T00:15:00-04:00');
    const morning = Date.parse('2026-10-26T08:00:00-04:00');

    expect(await repo.add({ at: lateOn25, ml: 250 })).toEqual({
      id: 'water-1',
      at: lateOn25,
      dayKey: '2026-10-25',
      ml: 250,
    });
    await repo.add({ at: justAfterMidnight, ml: 500 });
    await repo.add({ at: morning, ml: 750 });

    expect((await repo.byDay('2026-10-26')).map((log) => [log.ml, log.dayKey])).toEqual([
      [750, '2026-10-26'],
      [500, '2026-10-26'],
    ]);
    expect((await repo.byDay('2026-10-25')).map((log) => log.ml)).toEqual([250]);
    expect(await repo.byDay('2026-10-27')).toEqual([]);
    db.close();
  });

  it('accepts 1 ml and leaves the 5 000 ml cap to the entry sheets', async () => {
    const { db, repo } = await setup();
    await repo.add({ at: FACTORY_NOW, ml: 1 });
    await repo.add({ at: FACTORY_NOW, ml: 6_000 });
    expect(await db.water.count()).toBe(2);
    db.close();
  });

  it.each([
    ['0 ml', { at: FACTORY_NOW, ml: 0 }],
    ['half a millilitre', { at: FACTORY_NOW, ml: 0.5 }],
    ['a negative amount', { at: FACTORY_NOW, ml: -250 }],
    ['an amount that is not a number', { at: FACTORY_NOW, ml: Number.NaN }],
    ['an instant that is not finite', { at: Number.NaN, ml: 250 }],
  ])('refuses %s and stores nothing', async (_label, log) => {
    const { db, repo } = await setup();
    await expect(repo.add(log)).rejects.toThrow(RangeError);
    expect(await db.water.count()).toBe(0);
    db.close();
  });
});

describe('remove', () => {
  it('deletes one log and does nothing for an id that is not stored', async () => {
    const { db, repo } = await setup();
    const kept = await repo.add({ at: FACTORY_NOW, ml: 250 });
    const removed = await repo.add({ at: FACTORY_NOW + 60_000, ml: 500 });

    await repo.remove(removed.id);
    await repo.remove('gone');

    expect(await db.water.toArray()).toEqual([kept]);
    db.close();
  });
});

describe('byDay', () => {
  it('drops an unreadable log from the day and keeps it (R06.1)', async () => {
    const { db, repo } = await setup();
    const good = makeWater({ id: 'good' });
    const broken = { id: 'broken', at: FACTORY_NOW, dayKey: good.dayKey, ml: 'a glass' };
    await db.water.bulkPut([good, broken as never]);

    expect(await repo.byDay(good.dayKey)).toEqual([good]);
    await settleQuarantine(db);

    expect(await db.water.get('broken')).toEqual(broken);
    expect((await db.quarantine.toArray()).map((row) => row.raw)).toEqual([broken]);
    db.close();
  });

  it('follows an add through a live query (R06.3)', async () => {
    const { db, repo } = await setup();
    const counted = countRuns(() => repo.byDay('2026-10-26'));
    const source = live(counted.query);
    const stop = source.subscribe(() => undefined);
    await counted.untilRuns(1);
    expect(source.getSnapshot()).toEqual({ status: 'ready', value: [] });

    const log = await repo.add({ at: FACTORY_NOW, ml: 500 });
    await counted.untilRuns(2);

    expect(source.getSnapshot()).toEqual({ status: 'ready', value: [log] });
    stop();
    counted.close();
    db.close();
  });
});

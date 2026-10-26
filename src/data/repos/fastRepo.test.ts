import { describe, expect, it } from 'vitest';
import type { Fast } from '../../domain/model';
import { activeFast } from '../../domain/trackers/fasting';
import { withIdSequence } from '../../lib/ids';
import { err, ok } from '../../lib/result';
import { openTestDb } from '../../test/db';
import { FACTORY_NOW, factories } from '../../test/factories';
import { ready, watch } from '../../test/live';
import type { PlatewiseDb } from '../db';
import { FASTING_ON_KEY, createFastRepo } from './fastRepo';
import { createWaterRepo } from './waterRepo';

const make = factories();
const clock = make.clock;
const HOUR = 3_600_000;
const NOW = FACTORY_NOW;

/**
 * A database holding `stored` fasts and a fast repository. Tracking is on unless `tracking` says
 * otherwise (`null`: the switch was never stored).
 */
async function setup(stored: Fast[] = [], tracking: boolean | null = true) {
  const db = await openTestDb();
  if (tracking !== null) await db.settings.put({ key: FASTING_ON_KEY, value: tracking });
  // Straight into the table, as an earlier session or a restored backup would have left them.
  await db.fasts.bulkPut(stored);
  const repo = createFastRepo(db, { ids: withIdSequence('new-fast'), clock });
  return { db, repo };
}

/** A completed fast from `fromH` to `toH` hours after NOW (negative: before). */
function completed(fromH: number, toH: number, goalMin = 960): Fast {
  return make.fast({ start: NOW + fromH * HOUR, end: NOW + toH * HOUR, goalMin });
}

/** A fast running since `fromH` hours after NOW. */
function running(fromH: number, goalMin = 960): Fast {
  return make.fast({ start: NOW + fromH * HOUR, end: null, goalMin });
}

async function storedFasts(db: PlatewiseDb): Promise<Fast[]> {
  return db.fasts.orderBy('start').toArray();
}

/** Local wall-clock time in the test zone (New York). */
function local(year: number, month: number, day: number, hour = 12, minute = 0): number {
  return new Date(year, month - 1, day, hour, minute).getTime();
}

describe('start', () => {
  it('starts a fast now with the goal clamped to 1 hour – 7 days', async () => {
    const { db, repo } = await setup();
    const expected: Fast = { id: 'new-fast-1', start: NOW, end: null, goalMin: 60 };

    expect(await repo.start(30, NOW)).toEqual(ok(expected));
    expect(await storedFasts(db)).toEqual([expected]);
  });

  it('refuses a second start while a fast runs and stores nothing (R05.3)', async () => {
    const first = running(-2);
    const { db, repo } = await setup([first]);

    expect(await repo.start(720, NOW)).toEqual(err('active'));

    expect(await storedFasts(db)).toEqual([first]);
  });

  it('lets only one of two starts made at the same moment through (R05.3)', async () => {
    const { db, repo } = await setup();

    const results = await Promise.all([repo.start(960, NOW), repo.start(960, NOW)]);

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toEqual([err('active')]);
    expect(await db.fasts.count()).toBe(1);
  });

  it('refuses a start that would overlap a stored fast', async () => {
    const later = completed(1, 5);
    const { db, repo } = await setup([later]);

    expect(await repo.start(960, NOW)).toEqual(err('overlap'));
    expect(await storedFasts(db)).toEqual([later]);
  });

  it('starts right where the previous fast ended (intervals are half-open)', async () => {
    const before = completed(-16, 0);
    const { repo } = await setup([before]);

    expect((await repo.start(960, NOW)).ok).toBe(true);
    expect(await repo.all()).toHaveLength(2);
  });

  it('refuses to start while fasting tracking is off, and stores nothing', async () => {
    const off = await setup([], false);
    expect(await off.repo.start(960, NOW)).toEqual(err('tracking-off'));
    expect(await off.db.fasts.count()).toBe(0);

    const neverSet = await setup([], null);
    expect(await neverSet.repo.start(960, NOW)).toEqual(err('tracking-off'));
    expect(await neverSet.db.fasts.count()).toBe(0);
  });
});

describe('end', () => {
  it('ends a running fast now and keeps it in history', async () => {
    const fast = running(-17);
    const { db, repo } = await setup([fast]);

    expect(await repo.end(fast.id, NOW)).toEqual(ok({ ...fast, end: NOW }));
    expect(await storedFasts(db)).toEqual([{ ...fast, end: NOW }]);
    expect(await repo.active()).toBeUndefined();
  });

  it('never stores an end before the start', async () => {
    const fast = running(0);
    const { db, repo } = await setup([fast]);

    await repo.end(fast.id, NOW - HOUR);

    expect(await storedFasts(db)).toEqual([{ ...fast, end: fast.start }]);
  });

  it('refuses a fast that already ended or is gone', async () => {
    const done = completed(-20, -4);
    const { db, repo } = await setup([done]);

    expect(await repo.end(done.id, NOW)).toEqual(err('ended'));
    expect(await repo.end('gone', NOW)).toEqual(err('missing'));
    expect(await storedFasts(db)).toEqual([done]);
  });
});

describe('edit', () => {
  it('refuses an edit that overlaps another fast and leaves both unchanged (R05.3)', async () => {
    const earlier = completed(-40, -24);
    const later = completed(-20, -4);
    const { db, repo } = await setup([earlier, later]);

    expect(await repo.edit(later.id, { start: NOW - 30 * HOUR })).toEqual(err('overlap'));

    expect(await storedFasts(db)).toEqual([earlier, later]);
  });

  it('stores an edit, pulling an end before the start up to the start and clamping the goal', async () => {
    const fast = completed(-20, -4);
    const { db, repo } = await setup([fast]);
    const expected: Fast = { ...fast, end: fast.start, goalMin: 10_080 };

    expect(await repo.edit(fast.id, { end: NOW - 22 * HOUR, goalMin: 20_000 })).toEqual(
      ok(expected),
    );
    expect(await storedFasts(db)).toEqual([expected]);
  });

  it('keeps a running fast running when only its start and goal change', async () => {
    const fast = running(-6);
    const { repo } = await setup([fast]);

    await repo.edit(fast.id, { start: NOW - 8 * HOUR, goalMin: 18 * 60 });

    expect(await repo.active()).toEqual({ ...fast, start: NOW - 8 * HOUR, goalMin: 1080 });
  });

  it('refuses to reopen a completed fast while another runs', async () => {
    const done = completed(-30, -20);
    const now = running(-2);
    const { db, repo } = await setup([done, now]);

    expect(await repo.edit(done.id, { end: null })).toEqual(err('active'));
    expect(await storedFasts(db)).toEqual([done, now]);
  });

  it('refuses an edit of a fast that is gone', async () => {
    const { db, repo } = await setup();

    expect(await repo.edit('gone', { goalMin: 600 })).toEqual(err('missing'));
    expect(await db.fasts.count()).toBe(0);
  });

  it('refuses a change that would not read back, and stores nothing', async () => {
    const fast = completed(-20, -4);
    const { db, repo } = await setup([fast]);

    await expect(repo.edit(fast.id, { start: Number.NaN })).rejects.toThrow(TypeError);
    expect(await storedFasts(db)).toEqual([fast]);
  });
});

describe('endNow', () => {
  it('applies the edited start and goal and ends the fast in one step (ACC-H8-1, R05.3)', async () => {
    const fast = running(-10);
    const { db, repo } = await setup([fast]);
    const expected: Fast = { id: fast.id, start: NOW - 14 * HOUR, end: NOW, goalMin: 1080 };

    const result = await repo.endNow(fast.id, { start: NOW - 14 * HOUR, goalMin: 1080 }, NOW);

    expect(result).toEqual(ok(expected));
    expect(await storedFasts(db)).toEqual([expected]);
    expect(await repo.active()).toBeUndefined();
  });

  it('changes nothing when the edited start would overlap: the fast keeps its start and keeps running (R05.3)', async () => {
    const earlier = completed(-30, -16);
    const fast = running(-10);
    const { db, repo } = await setup([earlier, fast]);

    expect(await repo.endNow(fast.id, { start: NOW - 20 * HOUR }, NOW)).toEqual(err('overlap'));

    expect(await storedFasts(db)).toEqual([earlier, fast]);
  });

  it('changes nothing when the ended fast could not be stored', async () => {
    const fast = running(-10);
    const { db, repo } = await setup([fast]);

    await expect(repo.endNow(fast.id, { goalMin: 600 }, Number.NaN)).rejects.toThrow(TypeError);

    expect(await storedFasts(db)).toEqual([fast]);
  });

  it('refuses a fast that already ended or is gone', async () => {
    const done = completed(-20, -4);
    const { repo } = await setup([done]);

    expect(await repo.endNow(done.id, {}, NOW)).toEqual(err('ended'));
    expect(await repo.endNow('gone', {}, NOW)).toEqual(err('missing'));
  });
});

describe('cancel and remove', () => {
  it('cancel deletes the running fast so it is not in history', async () => {
    const done = completed(-30, -14);
    const { repo } = await setup([done]);
    const started = await repo.start(960, NOW);
    if (!started.ok) throw new Error('the fast should have started');

    expect(await repo.cancel(started.value.id)).toEqual(started);

    expect(await repo.all()).toEqual([done]);
  });

  it('cancel refuses a completed fast and keeps it', async () => {
    const done = completed(-20, -4);
    const { repo } = await setup([done]);

    expect(await repo.cancel(done.id)).toEqual(err('ended'));
    expect(await repo.cancel('gone')).toEqual(err('missing'));
    expect(await repo.all()).toEqual([done]);
  });

  it('remove deletes a completed fast', async () => {
    const first = completed(-40, -24);
    const second = completed(-20, -4);
    const { repo } = await setup([first, second]);

    expect(await repo.remove(first.id)).toEqual(ok(first));
    expect(await repo.remove(first.id)).toEqual(err('missing'));

    expect(await repo.all()).toEqual([second]);
  });
});

describe('tracking switch', () => {
  it('switching off ends the running fast, keeps it in history and keeps water logs (ACC-H10-1, R05.2)', async () => {
    const fast = running(-8);
    const { db, repo } = await setup([fast]);
    const water = createWaterRepo(db, { ids: withIdSequence('drink'), clock });
    const drink = await water.add({ at: NOW - 6 * HOUR, ml: 500 });

    const ended = await repo.setTracking(false, NOW);

    expect(ended).toEqual([{ ...fast, end: NOW }]);
    expect(await repo.all()).toEqual([{ ...fast, end: NOW }]);
    expect(await repo.trackingOn()).toBe(false);
    // Nothing runs any more, so the diary's fast check lets food through again.
    expect(activeFast(await repo.all())).toBeUndefined();
    expect(await water.byDay(drink.dayKey)).toEqual([drink]);
  });

  it('switching off ends every running fast, even two left by damaged data', async () => {
    const one = running(-9);
    const two = running(-3);
    const { repo } = await setup([one, two]);

    await repo.setTracking(false, NOW);

    expect(await repo.all()).toEqual([
      { ...one, end: NOW },
      { ...two, end: NOW },
    ]);
  });

  it('switching on only writes the switch', async () => {
    const done = completed(-20, -4);
    const { repo } = await setup([done], false);

    expect(await repo.setTracking(true, NOW)).toEqual([]);

    expect(await repo.trackingOn()).toBe(true);
    expect(await repo.all()).toEqual([done]);
  });

  it('keeps an unreadable switch aside before writing over it', async () => {
    const { db, repo } = await setup([], null);
    const broken = { key: FASTING_ON_KEY, value: 'yes please' };
    await db.settings.put(broken);

    expect(await repo.trackingOn()).toBe(false);
    await repo.setTracking(true, NOW);

    expect(await repo.trackingOn()).toBe(true);
    expect((await db.quarantine.toArray()).map((row) => row.raw)).toEqual([broken]);
  });
});

describe('settleOnOpen', () => {
  it('ends a restored running fast when tracking is off (R05.2)', async () => {
    const restored = running(-30);
    const { repo } = await setup([restored], false);

    expect(await repo.settleOnOpen(NOW)).toEqual([{ ...restored, end: NOW }]);

    expect(await repo.active()).toBeUndefined();
    expect(await repo.all()).toEqual([{ ...restored, end: NOW }]);
  });

  it('ends a running fast when the switch was never stored (tracking is off by default)', async () => {
    const restored = running(-5);
    const { repo } = await setup([restored], null);

    await repo.settleOnOpen(NOW);

    expect(await repo.active()).toBeUndefined();
  });

  it('leaves a running fast alone when tracking is on', async () => {
    const fast = running(-5);
    const { db, repo } = await setup([fast], true);

    expect(await repo.settleOnOpen(NOW)).toEqual([]);

    expect(await storedFasts(db)).toEqual([fast]);
  });
});

describe('reads', () => {
  it('between lists fasts that ended on those days, plus the running one', async () => {
    const endedBefore = make.fast({
      start: local(2026, 10, 19, 6),
      end: local(2026, 10, 19, 23, 59),
    });
    const crossesIn = make.fast({ start: local(2026, 10, 19, 20), end: local(2026, 10, 20, 0, 0) });
    const lateOnLastDay = make.fast({
      start: local(2026, 10, 22, 8),
      end: local(2026, 10, 22, 23, 30),
    });
    const now = make.fast({ start: local(2026, 10, 25, 20), end: null });
    const { repo } = await setup([now, lateOnLastDay, endedBefore, crossesIn]);

    const found = await repo.between('2026-10-20', '2026-10-22');

    expect(found.map((fast) => fast.id)).toEqual([crossesIn.id, lateOnLastDay.id, now.id]);
  });

  it('leaves unreadable fasts out of reads and checks', async () => {
    const fast = completed(-20, -4);
    const { db, repo } = await setup([fast]);
    await db
      .table('fasts')
      .put({ id: 'fast-broken', start: NOW - 2 * HOUR, end: 'soon', goalMin: 960 });

    expect(await repo.all()).toEqual([fast]);
    expect((await repo.start(960, NOW)).ok).toBe(true);
    expect(await db.table('fasts').get('fast-broken')).toMatchObject({ end: 'soon' });
  });

  it('pushes a start and an end to a live active-fast feed', async () => {
    const { repo } = await setup();
    const current = watch(repo.liveActive());
    await current.until(ready((fast) => fast === undefined));

    const started = await repo.start(960, NOW);
    if (!started.ok) throw new Error('the fast should have started');
    await current.until(ready((fast) => fast?.id === started.value.id));

    await repo.end(started.value.id, NOW + HOUR);
    await current.until(ready((fast) => fast === undefined));
  });
});

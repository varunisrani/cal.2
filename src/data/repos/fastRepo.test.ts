import { describe, expect, it } from 'vitest';
import { fixedClock } from '../../lib/clock';
import { withIdSequence } from '../../lib/ids';
import { err, ok } from '../../lib/result';
import { countRuns, openTestDb } from '../../test/db';
import { FACTORY_NOW, makeFast, makeWater } from '../../test/factories';
import { settleQuarantine } from '../guard';
import { live } from '../live';
import type { PlatewiseDb } from '../schema';
import { FASTING_ON_KEY, createFastRepo } from './fastRepo';

const HOUR = 3_600_000;
const NOW = FACTORY_NOW;
const clock = fixedClock(NOW, 'America/New_York');

async function setup() {
  const { db } = await openTestDb();
  const repo = createFastRepo(db, { clock, newId: withIdSequence('fast') });
  return { db, repo };
}

async function trackingSwitch(db: PlatewiseDb) {
  return db.settings.get(FASTING_ON_KEY);
}

/** Makes every write over an existing fast on this connection fail, like a full disk would. */
function breakFastWrites(db: PlatewiseDb): void {
  db.fasts.hook('updating', () => {
    throw new DOMException('The quota has been exceeded', 'QuotaExceededError');
  });
}

describe('start (R05.3)', () => {
  it('starts a running fast with a clamped goal, and refuses a second start writing nothing (R05.3)', async () => {
    const { db, repo } = await setup();

    const first = await repo.start(30, NOW - 2 * HOUR);
    expect(first).toEqual(ok({ id: 'fast-1', start: NOW - 2 * HOUR, end: null, goalMin: 60 }));

    expect(await repo.start(960, NOW)).toEqual(err('active'));
    expect(await db.fasts.count()).toBe(1);
    db.close();
  });

  it('refuses a start before a stored fast ends (R05.3)', async () => {
    const { db, repo } = await setup();
    await db.fasts.put(makeFast({ id: 'later', start: NOW - 4 * HOUR, end: NOW + HOUR }));

    expect(await repo.start(960, NOW)).toEqual(err('overlap'));
    expect(await db.fasts.count()).toBe(1);
    db.close();
  });

  it('allows a start exactly when the last fast ended', async () => {
    const { db, repo } = await setup();
    await db.fasts.put(makeFast({ start: NOW - 16 * HOUR, end: NOW }));

    expect((await repo.start(960, NOW)).ok).toBe(true);
    db.close();
  });

  it('makes one fast from two starts at the same moment: the check runs inside the write (R05.3)', async () => {
    const { db, repo } = await setup();

    const results = await Promise.all([repo.start(960, NOW), repo.start(960, NOW)]);

    expect(results.map((result) => result.ok).sort()).toEqual([false, true]);
    expect(results).toContainEqual(err('active'));
    expect(await db.fasts.count()).toBe(1);
    db.close();
  });
});

describe('end', () => {
  it('ends the running fast at now, and refuses one that has already ended', async () => {
    const { db, repo } = await setup();
    await db.fasts.put(makeFast({ id: 'f', start: NOW - 17 * HOUR, end: null }));

    expect(await repo.end('f', NOW)).toEqual(
      ok({ id: 'f', start: NOW - 17 * HOUR, end: NOW, goalMin: 960 }),
    );
    expect(await repo.end('f', NOW + HOUR)).toEqual(err('notActive'));
    expect((await db.fasts.get('f'))?.end).toBe(NOW);
    expect(await repo.end('gone', NOW)).toEqual(err('missing'));
    db.close();
  });

  it('never ends before the start, even with a clock behind it', async () => {
    const { db, repo } = await setup();
    await db.fasts.put(makeFast({ id: 'f', start: NOW, end: null }));

    expect(await repo.end('f', NOW - HOUR)).toEqual(ok(expect.objectContaining({ end: NOW })));
    db.close();
  });
});

describe('cancel', () => {
  it('deletes the running fast so it never shows in history', async () => {
    const { db, repo } = await setup();
    const started = await repo.start(960, NOW);
    if (!started.ok) throw new Error('the start was refused');

    expect(await repo.cancel(started.value.id)).toEqual(ok(started.value));
    expect(await repo.list()).toEqual([]);
    db.close();
  });

  it('keeps a fast that has already ended, and refuses one that is not stored', async () => {
    const { db, repo } = await setup();
    const done = makeFast({ id: 'done' });
    await db.fasts.put(done);

    expect(await repo.cancel('done')).toEqual(err('notActive'));
    expect(await repo.cancel('gone')).toEqual(err('missing'));
    expect(await repo.list()).toEqual([done]);
    db.close();
  });
});

describe('edit (R05.3)', () => {
  const earlier = makeFast({ id: 'earlier', start: NOW - 40 * HOUR, end: NOW - 24 * HOUR });
  const later = makeFast({ id: 'later', start: NOW - 20 * HOUR, end: NOW - 4 * HOUR });

  it('refuses an edit into another fast and changes nothing (R05.3)', async () => {
    const { db, repo } = await setup();
    await db.fasts.bulkPut([earlier, later]);

    expect(await repo.edit('later', { start: NOW - 30 * HOUR })).toEqual(err('overlap'));
    expect(await repo.list()).toEqual([earlier, later]);
    db.close();
  });

  it('moves an end before the start up to the start and clamps the goal (R05.3)', async () => {
    const { db, repo } = await setup();
    await db.fasts.bulkPut([earlier, later]);

    const edited = await repo.edit('later', { end: NOW - 21 * HOUR, goalMin: 20_000 });

    const expected = { ...later, end: later.start, goalMin: 10_080 };
    expect(edited).toEqual(ok(expected));
    expect(await db.fasts.get('later')).toEqual(expected);
    db.close();
  });

  it('refuses reopening a completed fast while another runs, and a fast that is not stored (R05.3)', async () => {
    const { db, repo } = await setup();
    await db.fasts.bulkPut([earlier, makeFast({ id: 'running', start: NOW - HOUR, end: null })]);

    expect(await repo.edit('earlier', { end: null })).toEqual(err('active'));
    expect(await repo.edit('gone', { goalMin: 600 })).toEqual(err('missing'));
    expect((await db.fasts.get('earlier'))?.end).toBe(earlier.end);
    db.close();
  });
});

describe('endNow (R05.3)', () => {
  it('applies the edited start and ends the fast in one step (ACC-H8-1, R05.3)', async () => {
    const { db, repo } = await setup();
    await db.fasts.put(makeFast({ id: 'f', start: NOW - 10 * HOUR, end: null, goalMin: 960 }));

    const ended = await repo.endNow('f', { start: NOW - 12 * HOUR, goalMin: 14 * 60 }, NOW);

    const expected = { id: 'f', start: NOW - 12 * HOUR, end: NOW, goalMin: 840 };
    expect(ended).toEqual(ok(expected));
    expect(await repo.list()).toEqual([expected]);
    expect(await repo.active()).toBeNull();
    db.close();
  });

  it('applies neither the start nor the end when the edited start overlaps another fast (R05.3)', async () => {
    const { db, repo } = await setup();
    const done = makeFast({ id: 'done', start: NOW - 30 * HOUR, end: NOW - 14 * HOUR });
    const running = makeFast({ id: 'running', start: NOW - 10 * HOUR, end: null });
    await db.fasts.bulkPut([done, running]);

    expect(await repo.endNow('running', { start: NOW - 15 * HOUR }, NOW)).toEqual(err('overlap'));
    expect(await repo.list()).toEqual([done, running]);
    db.close();
  });

  it('refuses a fast that has already ended', async () => {
    const { db, repo } = await setup();
    await db.fasts.put(makeFast({ id: 'done' }));
    expect(await repo.endNow('done', { goalMin: 600 }, NOW)).toEqual(err('notActive'));
    db.close();
  });
});

describe('remove', () => {
  it('deletes a completed fast, and refuses one that is not stored', async () => {
    const { db, repo } = await setup();
    const done = makeFast({ id: 'done' });
    await db.fasts.put(done);

    expect(await repo.remove('done')).toEqual(ok(done));
    expect(await repo.remove('done')).toEqual(err('missing'));
    expect(await db.fasts.count()).toBe(0);
    db.close();
  });
});

describe('setTracking (R05.2)', () => {
  it('switching fasting off ends the running fast, keeps it and the water logs, and leaves no fast to block food (ACC-H10-1, R05.2)', async () => {
    const { db, repo } = await setup();
    const water = makeWater({ at: NOW - 6 * HOUR, ml: 500 });
    await db.water.put(water);
    await repo.setTracking(true, NOW - 9 * HOUR);
    const started = await repo.start(960, NOW - 8 * HOUR);
    if (!started.ok) throw new Error('the start was refused');

    const ended = await repo.setTracking(false, NOW);

    const completed = { ...started.value, end: NOW };
    expect(ended).toEqual([completed]);
    expect(await repo.list()).toEqual([completed]);
    // The food check (P02-06) reads the stored fasts for a running one: there is none.
    expect(await repo.active()).toBeNull();
    expect(await db.water.toArray()).toEqual([water]);
    expect(await trackingSwitch(db)).toEqual({ key: FASTING_ON_KEY, value: false });
    db.close();
  });

  it('switching fasting on writes the switch and leaves a running fast running', async () => {
    const { db, repo } = await setup();
    await db.fasts.put(makeFast({ id: 'running', start: NOW - HOUR, end: null }));

    expect(await repo.setTracking(true, NOW)).toEqual([]);

    expect((await repo.active())?.id).toBe('running');
    expect(await trackingSwitch(db)).toEqual({ key: FASTING_ON_KEY, value: true });
    db.close();
  });

  it('keeps the switch as it was when ending the fast fails: one transaction (R05.2)', async () => {
    const { db, repo } = await setup();
    await repo.setTracking(true, NOW - 2 * HOUR);
    await db.fasts.put(makeFast({ id: 'running', start: NOW - HOUR, end: null }));
    breakFastWrites(db);

    await expect(repo.setTracking(false, NOW)).rejects.toThrow(/quota/);

    expect(await trackingSwitch(db)).toEqual({ key: FASTING_ON_KEY, value: true });
    expect((await db.fasts.get('running'))?.end).toBeNull();
    db.close();
  });

  it('keeps a switch value that cannot be read aside before writing over it (R06.1)', async () => {
    const { db, repo } = await setup();
    const unreadable = { key: FASTING_ON_KEY, value: 'yes' };
    await db.settings.put(unreadable);

    await repo.setTracking(false, NOW);

    expect(await trackingSwitch(db)).toEqual({ key: FASTING_ON_KEY, value: false });
    expect((await db.quarantine.toArray()).map((row) => [row.table, row.raw])).toEqual([
      ['settings', unreadable],
    ]);
    db.close();
  });
});

describe('settleOnOpen (R05.2)', () => {
  it.each([
    ['off', { key: FASTING_ON_KEY, value: false }],
    ['never set', null],
    ['unreadable', { key: FASTING_ON_KEY, value: 1 }],
  ])('ends a restored running fast while tracking is %s (R05.2)', async (_label, row) => {
    const { db, repo } = await setup();
    if (row) await db.settings.put(row);
    await db.fasts.put(makeFast({ id: 'restored', start: NOW - 30 * HOUR, end: null }));

    const ended = await repo.settleOnOpen(NOW);
    await settleQuarantine(db);

    expect(ended.map((fast) => [fast.id, fast.end])).toEqual([['restored', NOW]]);
    expect(await repo.active()).toBeNull();
    expect(await db.fasts.count()).toBe(1);
    db.close();
  });

  it('leaves a running fast running while tracking is on', async () => {
    const { db, repo } = await setup();
    await db.settings.put({ key: FASTING_ON_KEY, value: true });
    await db.fasts.put(makeFast({ id: 'running', start: NOW - HOUR, end: null }));

    expect(await repo.settleOnOpen(NOW)).toEqual([]);
    expect((await repo.active())?.id).toBe('running');
    db.close();
  });

  it('ends two running fasts from damaged data, though they overlap each other (R05.2)', async () => {
    const { db, repo } = await setup();
    await db.fasts.bulkPut([
      makeFast({ id: 'one', start: NOW - 20 * HOUR, end: null }),
      makeFast({ id: 'two', start: NOW - 5 * HOUR, end: null }),
    ]);

    const ended = await repo.settleOnOpen(NOW);

    expect(ended.map((fast) => fast.id).sort()).toEqual(['one', 'two']);
    expect((await repo.list()).map((fast) => fast.end)).toEqual([NOW, NOW]);
    db.close();
  });
});

describe('reads', () => {
  const at = (text: string) => Date.parse(`${text}-04:00`);

  it('lists the fasts that meet a day window, the running one included, by start', async () => {
    const { db, repo } = await setup();
    const before = makeFast({
      id: 'before',
      start: at('2026-10-24T06:00'),
      end: at('2026-10-24T22:00'),
    });
    const atMidnight = makeFast({
      id: 'atMidnight',
      start: at('2026-10-24T08:00'),
      end: at('2026-10-25T00:00'),
    });
    const inside = makeFast({
      id: 'inside',
      start: at('2026-10-25T08:00'),
      end: at('2026-10-25T20:00'),
    });
    const running = makeFast({ id: 'running', start: at('2026-10-26T08:00'), end: null });
    await db.fasts.bulkPut([running, inside, before, atMidnight]);

    expect((await repo.between('2026-10-25', '2026-10-26')).map((fast) => fast.id)).toEqual([
      'atMidnight',
      'inside',
      'running',
    ]);
    expect((await repo.between('2026-10-23', '2026-10-23')).map((fast) => fast.id)).toEqual([]);
    expect((await repo.list()).map((fast) => fast.id)).toEqual([
      'before',
      'atMidnight',
      'inside',
      'running',
    ]);
    expect((await repo.active())?.id).toBe('running');
    db.close();
  });

  it('finds the running fast again after the database is reopened', async () => {
    const { db, factory, name } = await openTestDb();
    const options = { clock, newId: withIdSequence('fast') };
    await createFastRepo(db, options).start(960, NOW - 3 * HOUR);
    db.close();

    const reopened = await openTestDb({ indexedDB: factory, name });
    const repo = createFastRepo(reopened.db, options);

    expect(await repo.active()).toEqual({
      id: 'fast-1',
      start: NOW - 3 * HOUR,
      end: null,
      goalMin: 960,
    });
    expect(await repo.end('fast-1', NOW)).toEqual(
      ok({ id: 'fast-1', start: NOW - 3 * HOUR, end: NOW, goalMin: 960 }),
    );
    reopened.db.close();
  });

  it('follows a start and an end through a live query (R06.3)', async () => {
    const { db, repo } = await setup();
    const counted = countRuns(() => repo.active());
    const source = live(counted.query);
    const stop = source.subscribe(() => undefined);
    await counted.untilRuns(1);
    expect(source.getSnapshot()).toEqual({ status: 'ready', value: null });

    await repo.start(960, NOW);
    await counted.untilRuns(2);
    expect(source.getSnapshot()).toEqual({
      status: 'ready',
      value: { id: 'fast-1', start: NOW, end: null, goalMin: 960 },
    });

    await repo.end('fast-1', NOW + HOUR);
    await counted.untilRuns(3);
    expect(source.getSnapshot()).toEqual({ status: 'ready', value: null });
    stop();
    counted.close();
    db.close();
  });

  it('drops an unreadable fast from reads and keeps it (R06.1)', async () => {
    const { db, repo } = await setup();
    const broken = { id: 'broken', start: NOW - HOUR, end: 'soon' };
    await db.fasts.bulkPut([makeFast({ id: 'ok' }), broken as never]);

    expect((await repo.list()).map((fast) => fast.id)).toEqual(['ok']);
    expect(await repo.active()).toBeNull();
    await settleQuarantine(db);

    expect(await db.fasts.get('broken')).toEqual(broken);
    expect(await db.quarantine.count()).toBe(1);
    db.close();
  });
});

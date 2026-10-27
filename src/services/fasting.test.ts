import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDiaryRepo } from '../data/repos/diaryRepo';
import { createFastRepo } from '../data/repos/fastRepo';
import { createSettingsRepo } from '../data/repos/settingsRepo';
import { fixedClock } from '../lib/clock';
import { withIdSequence } from '../lib/ids';
import { err, ok } from '../lib/result';
import { openTestDb } from '../test/db';
import { FACTORY_NOW, makeDraft, makeEntry, makeFast, makeWater } from '../test/factories';
import type { LogContext } from './diary';
import { createFastingService, type FastingDeps } from './fasting';

const HOUR = 3_600_000;
const NOW = FACTORY_NOW;
const LUNCH: LogContext = { loggedAt: NOW, meal: 'lunch', source: 'manual' };

const closers: Array<() => void> = [];
afterEach(() => {
  for (const close of closers.splice(0)) close();
});

async function setUp(extra: Partial<FastingDeps> = {}) {
  const { db, bus } = await openTestDb();
  closers.push(() => db.close());
  const fastRepo = createFastRepo(db, { newId: withIdSequence('fast') });
  const diaryRepo = createDiaryRepo(db);
  const settingsRepo = createSettingsRepo(db, { locale: 'en-US', bus });
  // Monday 26 October 2026, 12:30 in New York.
  const service = createFastingService({
    fastRepo,
    diaryRepo,
    settingsRepo,
    clock: fixedClock(NOW, 'America/New_York'),
    newId: withIdSequence('entry'),
    ...extra,
  });
  return { db, fastRepo, diaryRepo, settingsRepo, service };
}

describe('fasts', () => {
  it('starts a fast now with its goal held to 1 h – 7 days, and refuses a second one', async () => {
    const h = await setUp();

    expect(await h.service.start(20_000)).toEqual(
      ok({ id: 'fast-1', start: NOW, end: null, goalMin: 10_080 }),
    );
    expect(await h.service.start(960)).toEqual(err('active'));
    expect(await h.fastRepo.list()).toHaveLength(1);
  });

  it('ends the running fast now, and cancels a running one so it leaves no history', async () => {
    const h = await setUp();
    await h.db.fasts.put(makeFast({ id: 'a', start: NOW - 5 * HOUR, end: null }));

    expect(await h.service.end('a')).toEqual(
      ok({ id: 'a', start: NOW - 5 * HOUR, end: NOW, goalMin: 960 }),
    );
    expect(await h.service.cancel('a')).toEqual(err('notActive'));

    await h.db.fasts.put(makeFast({ id: 'b', start: NOW, end: null }));
    expect((await h.service.cancel('b')).ok).toBe(true);
    expect((await h.fastRepo.list()).map((fast) => fast.id)).toEqual(['a']);
  });

  it('keeps a running fast running through an edit, and deletes a finished one', async () => {
    const h = await setUp();
    await h.db.fasts.put(makeFast({ id: 'done', start: NOW - 30 * HOUR, end: NOW - 14 * HOUR }));
    await h.db.fasts.put(makeFast({ id: 'running', start: NOW - 2 * HOUR, end: null }));

    expect(await h.service.edit('running', { start: NOW - 3 * HOUR, goalMin: 720 })).toEqual(
      ok({ id: 'running', start: NOW - 3 * HOUR, end: null, goalMin: 720 }),
    );
    expect((await h.service.remove('done')).ok).toBe(true);
    expect(await h.fastRepo.list()).toEqual([
      { id: 'running', start: NOW - 3 * HOUR, end: null, goalMin: 720 },
    ]);
  });

  it('ends a running fast with the edited start and goal in one write, or not at all (R05.3)', async () => {
    const h = await setUp();
    const before = makeFast({ id: 'before', start: NOW - 30 * HOUR, end: NOW - 10 * HOUR });
    await h.db.fasts.bulkPut([
      before,
      makeFast({ id: 'running', start: NOW - 4 * HOUR, end: null }),
    ]);

    expect(await h.service.endNow('running', { start: NOW - 12 * HOUR })).toEqual(err('overlap'));
    expect(await h.db.fasts.get('running')).toMatchObject({ start: NOW - 4 * HOUR, end: null });

    expect(await h.service.endNow('running', { start: NOW - 6 * HOUR, goalMin: 300 })).toEqual(
      ok({ id: 'running', start: NOW - 6 * HOUR, end: NOW, goalMin: 300 }),
    );
  });
});

describe('settings', () => {
  it('ends the running fast when fasting is switched off, keeping it and the water logs (R05.2)', async () => {
    const h = await setUp();
    const water = makeWater({ at: NOW - HOUR, ml: 500 });
    await h.db.water.put(water);
    await h.service.setTracking(true);
    const started = await h.service.start(960);
    if (!started.ok) throw new Error('the start was refused');

    const ended = await h.service.setTracking(false);

    expect(ended).toEqual([{ ...started.value, end: NOW }]);
    expect(await h.settingsRepo.get('fasting.on')).toBe(false);
    expect(await h.fastRepo.active()).toBeNull();
    expect(await h.db.water.toArray()).toEqual([water]);
  });

  it('stores the default goal held to 1 h – 7 days', async () => {
    const h = await setUp();

    expect(await h.service.setDefaultGoal(20 * 60)).toBe(1_200);
    expect(await h.service.setDefaultGoal(10)).toBe(60);
    expect(await h.settingsRepo.get('fasting.defaultGoalMin')).toBe(60);
  });
});

describe('endFastAndLog (D-16.35)', () => {
  it('ends the running fast now and stores the food, in one step (ACC-D27-1)', async () => {
    const h = await setUp();
    await h.db.fasts.put(makeFast({ id: 'running', start: NOW - 8 * HOUR, end: null }));

    const result = await h.service.endFastAndLog(
      makeDraft({ name: 'Omelette', kcal: 320.4 }),
      LUNCH,
    );

    expect(result).toMatchObject({
      kind: 'logged',
      entry: { id: 'entry-1', name: 'Omelette', kcal: 320, loggedAt: NOW, meal: 'lunch' },
      endedFast: { id: 'running', start: NOW - 8 * HOUR, end: NOW },
    });
    expect(await h.fastRepo.active()).toBeNull();
    expect((await h.diaryRepo.byDay('2026-10-26')).map((entry) => entry.name)).toEqual([
      'Omelette',
    ]);
  });

  it('stores neither when the food cannot be written: the fast keeps running', async () => {
    // An id already in use makes the entry write fail inside the transaction.
    const h = await setUp({ newId: () => 'taken' });
    await h.db.entries.put({ ...makeEntry({ id: 'taken' }), dayKey: '2026-10-25' });
    await h.db.fasts.put(makeFast({ id: 'running', start: NOW - 8 * HOUR, end: null }));

    await expect(h.service.endFastAndLog(makeDraft(), LUNCH)).rejects.toThrow();

    expect((await h.fastRepo.active())?.id).toBe('running');
    expect(await h.db.entries.count()).toBe(1);
  });

  it('writes once for two rapid calls, and asks for persistence after the first entry only', async () => {
    const onFirstEntry = vi.fn();
    const h = await setUp({ onFirstEntry });
    await h.db.fasts.put(makeFast({ id: 'running', start: NOW - 8 * HOUR, end: null }));

    const [first, second] = await Promise.all([
      h.service.endFastAndLog(makeDraft(), LUNCH),
      h.service.endFastAndLog(makeDraft(), LUNCH),
    ]);
    await h.service.endFastAndLog(makeDraft(), LUNCH);

    expect(first.kind).toBe('logged');
    expect(second).toEqual({ kind: 'ignored' });
    expect(await h.db.entries.count()).toBe(2);
    expect(onFirstEntry).toHaveBeenCalledTimes(1);
  });
});

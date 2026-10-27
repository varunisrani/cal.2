import { describe, expect, it } from 'vitest';
import { fixedClock } from '../../lib/clock';
import { openTestDb } from '../../test/db';
import { FACTORY_NOW, makeProfileRow, makeWeighIn } from '../../test/factories';
import { hasUnreadableData, settleQuarantine } from '../guard';
import { PROFILE_KEY, type ActivityRow } from '../schema';
import {
  HEALTH_META_KEYS,
  createHealthRepo,
  importedWeighInId,
  isEmptyDay,
  isImportedWeighIn,
} from './healthRepo';

const DAY = 86_400_000;
const clock = fixedClock(FACTORY_NOW, 'America/New_York');

async function setup() {
  const { db } = await openTestDb();
  return { db, repo: createHealthRepo(db, { clock }) };
}

/** A day of activity with nothing in it unless overridden. */
function day(key: string, overrides: Partial<ActivityRow> = {}): ActivityRow {
  return {
    day: key,
    steps: null,
    activeKcal: null,
    totalKcal: null,
    distanceM: null,
    sessions: [],
    syncedAt: FACTORY_NOW,
    ...overrides,
  };
}

describe('putDays', () => {
  it('stores new days and reads them back oldest first between two day keys', async () => {
    const { db, repo } = await setup();
    const written = await repo.putDays([
      day('2026-10-25', { steps: 8_200, activeKcal: 410.5 }),
      day('2026-10-24', { steps: 3_100, distanceM: 2_400 }),
    ]);
    expect(written).toBe(2);
    expect((await repo.between('2026-10-24', '2026-10-26')).map((row) => row.day)).toEqual([
      '2026-10-24',
      '2026-10-25',
    ]);
    expect(await repo.between('2026-10-25', '2026-10-25')).toEqual([
      day('2026-10-25', { steps: 8_200, activeKcal: 410.5 }),
    ]);
    db.close();
  });

  it('writes nothing for the same values again, whatever the sync time', async () => {
    const { db, repo } = await setup();
    await repo.putDays([day('2026-10-25', { steps: 8_200 })]);
    const again = await repo.putDays([
      day('2026-10-25', { steps: 8_200, syncedAt: FACTORY_NOW + DAY }),
    ]);
    expect(again).toBe(0);
    expect((await db.activity.get('2026-10-25'))?.syncedAt).toBe(FACTORY_NOW);
    db.close();
  });

  it('replaces a day whose values changed, and empties a stored day Health Connect no longer has', async () => {
    const { db, repo } = await setup();
    await repo.putDays([day('2026-10-24', { steps: 100 }), day('2026-10-25', { steps: 200 })]);
    const later = FACTORY_NOW + DAY;
    const written = await repo.putDays([
      day('2026-10-24', { syncedAt: later }),
      day('2026-10-25', { steps: 250, syncedAt: later }),
    ]);
    expect(written).toBe(2);
    expect(await repo.between('2026-10-24', '2026-10-25')).toEqual([
      day('2026-10-24', { syncedAt: later }),
      day('2026-10-25', { steps: 250, syncedAt: later }),
    ]);
    db.close();
  });

  it('stores no row for an empty day that was never stored', async () => {
    const { db, repo } = await setup();
    expect(await repo.putDays([day('2026-10-20')])).toBe(0);
    expect(await db.activity.count()).toBe(0);
    expect(isEmptyDay(day('2026-10-20'))).toBe(true);
    expect(isEmptyDay(day('2026-10-20', { steps: 0 }))).toBe(false);
    db.close();
  });

  it('keeps a damaged row aside and leaves it out of the days read', async () => {
    const { db, repo } = await setup();
    await db.activity.put({ day: '2026-10-23' } as ActivityRow);
    await repo.putDays([day('2026-10-24', { steps: 5 })]);
    expect((await repo.between('2026-10-20', '2026-10-26')).map((row) => row.day)).toEqual([
      '2026-10-24',
    ]);
    await settleQuarantine(db);
    expect(await hasUnreadableData(db)).toBe(true);
    db.close();
  });

  it('reads a workout list without its unreadable workouts, and unknown numbers as null', async () => {
    const { db, repo } = await setup();
    await db.activity.put({
      ...day('2026-10-24'),
      steps: -3,
      sessions: [
        { id: 's1', start: 1, end: 2, type: 'running', title: '', activeKcal: 'x', source: 'a' },
        { id: 's2', start: 5, end: 1, type: 'running', title: null, activeKcal: 1, source: 'a' },
      ],
    } as unknown as ActivityRow);
    expect(await repo.between('2026-10-24', '2026-10-24')).toEqual([
      day('2026-10-24', {
        sessions: [
          {
            id: 's1',
            start: 1,
            end: 2,
            type: 'running',
            title: null,
            activeKcal: null,
            source: 'a',
          },
        ],
      }),
    ]);
    db.close();
  });
});

describe('importWeighIns (R07.22)', () => {
  const at = FACTORY_NOW - 2 * DAY;

  it('adds readings under their import ids and moves the profile weight to the newest', async () => {
    const { db, repo } = await setup();
    await db.profile.put(makeProfileRow({ weightKg: 64 }));
    await db.weighIns.put(makeWeighIn({ id: 'typed', at: at - DAY, kg: 64 }));

    const outcome = await repo.importWeighIns([
      { id: importedWeighInId('hc-1'), at, kg: 63.4 },
      { id: importedWeighInId('hc-2'), at: at - 3 * DAY, kg: 64.8 },
    ]);

    expect(outcome).toEqual({ added: 2, replaced: 0, skipped: 0 });
    expect((await db.weighIns.toArray()).map((w) => w.id).sort()).toEqual([
      'health-hc-1',
      'health-hc-2',
      'typed',
    ]);
    expect((await db.profile.get(PROFILE_KEY))?.weightKg).toBe(63.4);
    db.close();
  });

  it('never doubles a reading read again, and replaces one whose value changed', async () => {
    const { db, repo } = await setup();
    const id = importedWeighInId('hc-1');
    await repo.importWeighIns([{ id, at, kg: 63.4 }]);
    expect(await repo.importWeighIns([{ id, at, kg: 63.4 }])).toEqual({
      added: 0,
      replaced: 0,
      skipped: 0,
    });
    expect(await repo.importWeighIns([{ id, at, kg: 63.1 }])).toEqual({
      added: 0,
      replaced: 1,
      skipped: 0,
    });
    expect(await db.weighIns.toArray()).toEqual([{ id, at, kg: 63.1 }]);
    db.close();
  });

  it('never brings back a reading the person deleted here', async () => {
    const { db, repo } = await setup();
    const id = importedWeighInId('hc-1');
    await repo.importWeighIns([{ id, at, kg: 63.4 }]);
    await db.weighIns.delete(id);

    expect(await repo.importWeighIns([{ id, at, kg: 63.4 }])).toEqual({
      added: 0,
      replaced: 0,
      skipped: 1,
    });
    expect(await db.weighIns.count()).toBe(0);
    expect((await db.meta.get(HEALTH_META_KEYS.imported))?.value).toEqual([id]);
    db.close();
  });

  it('leaves out readings that are not imports or cannot be read', async () => {
    const { db, repo } = await setup();
    const outcome = await repo.importWeighIns([
      { id: 'typed', at, kg: 70 },
      { id: importedWeighInId('hc-1'), at, kg: 0 },
      { id: importedWeighInId('hc-2'), at: Number.NaN, kg: 70 },
    ]);
    expect(outcome).toEqual({ added: 0, replaced: 0, skipped: 0 });
    expect(await db.weighIns.count()).toBe(0);
    expect(isImportedWeighIn('health-x')).toBe(true);
    expect(isImportedWeighIn('typed')).toBe(false);
    db.close();
  });

  it('leaves a missing profile alone', async () => {
    const { db, repo } = await setup();
    await repo.importWeighIns([{ id: importedWeighInId('hc-1'), at, kg: 63.4 }]);
    expect(await db.profile.count()).toBe(0);
    db.close();
  });
});

describe('the device state', () => {
  it('records sends, forgets ids and reads the ledger back', async () => {
    const { db, repo } = await setup();
    expect(await repo.sent()).toEqual({});
    await repo.updateSent({
      set: {
        a: { kind: 'nutrition', day: '2026-10-25', sig: 's1' },
        b: { kind: 'weight', day: '2026-10-24', sig: 's2' },
      },
    });
    await repo.updateSent({
      set: { a: { kind: 'nutrition', day: '2026-10-25', sig: 's3' } },
      remove: ['b'],
    });
    expect(await repo.sent()).toEqual({ a: { kind: 'nutrition', day: '2026-10-25', sig: 's3' } });
    db.close();
  });

  it('reads a damaged ledger as empty and keeps it aside', async () => {
    const { db, repo } = await setup();
    await db.meta.put({ key: HEALTH_META_KEYS.sent, value: { a: { kind: 'fax' } } });
    expect(await repo.sent()).toEqual({});
    await settleQuarantine(db);
    expect(await hasUnreadableData(db)).toBe(true);
    db.close();
  });

  it('keeps the last sync time', async () => {
    const { db, repo } = await setup();
    expect(await repo.lastSyncAt()).toBeNull();
    await repo.setLastSyncAt(FACTORY_NOW);
    expect(await repo.lastSyncAt()).toBe(FACTORY_NOW);
    db.close();
  });
});

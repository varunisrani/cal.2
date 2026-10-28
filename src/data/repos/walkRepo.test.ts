import { describe, expect, it } from 'vitest';
import { fixedClock } from '../../lib/clock';
import { openTestDb } from '../../test/db';
import { FACTORY_NOW, makeWalk } from '../../test/factories';
import { settleQuarantine } from '../guard';
import { createWalkRepo } from './walkRepo';

const DAY = 86_400_000;
const clock = fixedClock(FACTORY_NOW, 'America/New_York');

async function setup() {
  const { db } = await openTestDb();
  return { db, repo: createWalkRepo(db, { clock }) };
}

describe('walkRepo (P15-02)', () => {
  it('stores a walk and reads it back', async () => {
    const { db, repo } = await setup();
    const walk = makeWalk();
    await repo.put(walk);
    expect(await repo.get(walk.id)).toEqual(walk);
    expect(await repo.get('missing')).toBeNull();
    db.close();
  });

  it('lists every walk newest first, and the walks of some local days oldest first', async () => {
    const { db, repo } = await setup();
    const older = makeWalk({ startedAt: FACTORY_NOW - 2 * DAY });
    const today = makeWalk({ startedAt: FACTORY_NOW });
    const yesterday = makeWalk({ startedAt: FACTORY_NOW - DAY });
    for (const walk of [today, older, yesterday]) await repo.put(walk);
    expect((await repo.list()).map((walk) => walk.id)).toEqual([today.id, yesterday.id, older.id]);
    expect((await repo.between('2026-10-25', '2026-10-26')).map((walk) => walk.id)).toEqual([
      yesterday.id,
      today.id,
    ]);
    expect(await repo.between('2026-10-27', '2026-10-30')).toEqual([]);
    db.close();
  });

  it('refuses a walk that ends before it starts', async () => {
    const { db, repo } = await setup();
    await expect(repo.put(makeWalk({ endedAt: FACTORY_NOW - 1 }))).rejects.toThrow(RangeError);
    db.close();
  });

  it('removes a walk and marks one written to Health Connect', async () => {
    const { db, repo } = await setup();
    const walk = makeWalk();
    await repo.put(walk);
    expect(await repo.markWritten(walk.id)).toBe(true);
    expect((await repo.get(walk.id))?.writtenToHealth).toBe(true);
    await repo.remove(walk.id);
    expect(await repo.get(walk.id)).toBeNull();
    expect(await repo.markWritten(walk.id)).toBe(false);
    await repo.remove('missing');
    db.close();
  });

  it('leaves an unreadable row out of every read and keeps it aside, never deleting it', async () => {
    const { db, repo } = await setup();
    await repo.put(makeWalk({ id: 'good' }));
    await db.walks.put({ ...makeWalk({ id: 'bad' }), endedAt: 'soon' } as never);
    expect((await repo.list()).map((walk) => walk.id)).toEqual(['good']);
    expect(await repo.get('bad')).toBeNull();
    await settleQuarantine(db);
    expect(await db.walks.count()).toBe(2);
    expect((await db.quarantine.toArray()).map((row) => [row.table, row.key])).toEqual([
      ['walks', 'bad'],
    ]);
    db.close();
  });
});

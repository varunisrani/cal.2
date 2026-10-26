import { describe, expect, it, onTestFinished, vi } from 'vitest';
import type { Profile } from '../../domain/model';
import { openTestDb } from '../../test/db';
import { FACTORY_NOW, factories } from '../../test/factories';
import { ready, watch } from '../../test/live';
import { inTimeZone } from '../../test/time';
import type { PlatewiseDb } from '../db';
import { WriteBlockedError, hasUnreadableData, keptAside } from '../guard';
import {
  ProfileMissingError,
  ProfileUnreadableError,
  createProfileRepo,
  type ProfileRead,
} from './profileRepo';

const make = factories();
const clock = make.clock;

/** A stored profile that cannot be read: the birth date is not a day. */
const damaged = { id: 'me', sex: 'female', birthDate: 'last spring', heightCm: 168, weightKg: 64 };

async function putDamaged(db: PlatewiseDb): Promise<void> {
  await db.table('profile').put(damaged);
}

async function quarantined(db: PlatewiseDb) {
  return (await db.quarantine.toArray()).map(({ table, key, at, raw }) => ({
    table,
    key,
    at,
    raw,
  }));
}

describe('profile: reading', () => {
  it('answers missing when no profile was saved, and keeps nothing aside', async () => {
    const db = await openTestDb();
    const repo = createProfileRepo(db, { clock });
    expect(await repo.get()).toEqual({ kind: 'missing' });
    expect(await db.quarantine.count()).toBe(0);
    expect(await hasUnreadableData(db)).toBe(false);
  });

  it('answers corrupt for a record that cannot be read, never missing, and keeps it aside (R01.17)', async () => {
    const db = await openTestDb();
    await putDamaged(db);
    const repo = createProfileRepo(db, { clock });

    expect(await repo.get()).toEqual({ kind: 'corrupt', raw: damaged });
    await repo.get();

    expect(await quarantined(db)).toEqual([
      { table: 'profile', key: 'me', at: FACTORY_NOW, raw: damaged },
    ]);
    expect(await hasUnreadableData(db)).toBe(true);
    expect(await db.table('profile').get('me')).toEqual(damaged);
  });
});

describe('profile: saving', () => {
  it('saves a profile and reads the same record back', async () => {
    const db = await openTestDb();
    const repo = createProfileRepo(db);
    const profile = make.profile({
      goal: 'lose',
      weeklyKg: 0.5,
      goalWeightKg: 60,
      bodyFat: 0.24,
      saved: { kcal: 1_800 },
      lockedMacros: ['protein'],
    });

    await repo.save(profile);

    expect(await repo.get()).toEqual({ kind: 'ok', value: profile });
    expect(await db.profile.get('me')).toEqual({ ...profile, id: 'me' });
  });

  it('stores the normal form: optional fields left undefined are absent', async () => {
    const db = await openTestDb();
    const repo = createProfileRepo(db);
    await repo.save({ ...make.profile(), bodyFat: undefined, weeklyKg: undefined });
    const row = await db.profile.get('me');
    expect(row && 'bodyFat' in row).toBe(false);
    expect(row && 'weeklyKg' in row).toBe(false);
  });

  it('keeps a corrupt stored profile aside before saving over it (R01.17)', async () => {
    const db = await openTestDb();
    await putDamaged(db);
    const repo = createProfileRepo(db, { clock });
    const profile = make.profile({ weightKg: 66 });

    await repo.save(profile);

    expect(await quarantined(db)).toEqual([
      { table: 'profile', key: 'me', at: FACTORY_NOW, raw: damaged },
    ]);
    expect(await repo.get()).toEqual({ kind: 'ok', value: profile });
  });

  it('refuses the save and leaves the stored bytes when they cannot be kept aside (R01.17)', async () => {
    const db = await openTestDb();
    await putDamaged(db);
    const diskFull = () => {
      throw new Error('quota exceeded');
    };
    db.quarantine.hook('creating', diskFull);
    onTestFinished(() => db.quarantine.hook('creating').unsubscribe(diskFull));
    const repo = createProfileRepo(db);

    await expect(repo.save(make.profile())).rejects.toBeInstanceOf(WriteBlockedError);

    expect(await db.table('profile').get('me')).toEqual(damaged);
    expect(await db.quarantine.count()).toBe(0);
  });

  it('stores the birth date as a day key that reads the same day in any zone', async () => {
    const db = await openTestDb();
    const repo = createProfileRepo(db);
    await repo.save(make.profile({ birthDate: '1991-04-12' }));

    const inTokyo = await inTimeZone('Asia/Tokyo', () => repo.get());

    expect(inTokyo).toMatchObject({ kind: 'ok', value: { birthDate: '1991-04-12' } });
    expect((await db.profile.get('me'))?.birthDate).toBe('1991-04-12');
  });

  it('refuses a birth date given as an instant, and writes nothing', async () => {
    const db = await openTestDb();
    const repo = createProfileRepo(db);
    const save = repo.save(make.profile({ birthDate: '1991-04-12T04:00:00.000Z' }));
    await expect(save).rejects.toBeInstanceOf(TypeError);
    expect(await db.profile.count()).toBe(0);
  });
});

describe('profile: updating', () => {
  it('changes the stored profile and returns what it stored', async () => {
    const db = await openTestDb();
    const repo = createProfileRepo(db);
    await repo.save(make.profile());

    const updated = await repo.update((profile) => ({ ...profile, weightKg: 62.5 }));

    expect(updated).toEqual(make.profile({ weightKg: 62.5 }));
    expect(await repo.get()).toEqual({ kind: 'ok', value: updated });
  });

  it('rejects on a corrupt profile, never runs the change and leaves the record (R01.17)', async () => {
    const db = await openTestDb();
    await putDamaged(db);
    const repo = createProfileRepo(db, { clock });
    const change = vi.fn((profile: Profile) => profile);

    const updating = repo.update(change);

    await expect(updating).rejects.toBeInstanceOf(ProfileUnreadableError);
    await expect(updating).rejects.toMatchObject({ raw: damaged });
    expect(change).not.toHaveBeenCalled();
    expect(await db.table('profile').get('me')).toEqual(damaged);
    // Kept aside on the way, so the banner can say some data could not be read.
    expect((await quarantined(db)).map((copy) => copy.raw)).toEqual([damaged]);
  });

  it('rejects when there is no profile, and writes nothing', async () => {
    const db = await openTestDb();
    const repo = createProfileRepo(db);
    await expect(repo.update((profile) => profile)).rejects.toBeInstanceOf(ProfileMissingError);
    expect(await db.profile.count()).toBe(0);
  });

  it('keeps both changes when two updates run at the same time', async () => {
    const db = await openTestDb();
    const repo = createProfileRepo(db);
    await repo.save(make.profile());

    await Promise.all([
      repo.update((profile) => ({ ...profile, weightKg: 70 })),
      repo.update((profile) => ({ ...profile, activity: 'active' })),
    ]);

    expect(await repo.get()).toEqual({
      kind: 'ok',
      value: make.profile({ weightKg: 70, activity: 'active' }),
    });
  });

  it('writes nothing when the changed profile would not read back', async () => {
    const db = await openTestDb();
    const repo = createProfileRepo(db);
    await repo.save(make.profile());

    const updating = repo.update((profile) => ({ ...profile, weightKg: 0 }));

    await expect(updating).rejects.toBeInstanceOf(TypeError);
    expect(await repo.get()).toEqual({ kind: 'ok', value: make.profile() });
  });
});

describe('profile: live', () => {
  it('stays loading until the first read, then answers missing, then follows a save (R05.12)', async () => {
    const db = await openTestDb();
    const repo = createProfileRepo(db);
    expect(repo.feed.current()).toEqual({ status: 'loading' });
    const feed = watch(repo.feed);

    await feed.until(ready((read: ProfileRead) => read.kind === 'missing'));
    await repo.save(make.profile());
    await feed.until(ready((read: ProfileRead) => read.kind === 'ok'));
    await repo.update((profile) => ({ ...profile, heightCm: 170 }));
    await feed.until(
      ready((read: ProfileRead) => read.kind === 'ok' && read.value.heightCm === 170),
    );

    expect(feed.values().map((read) => read.kind)).toEqual(['missing', 'ok', 'ok']);
  });

  it('shows an unreadable profile as corrupt, never as missing (R01.17)', async () => {
    const db = await openTestDb();
    await putDamaged(db);
    const repo = createProfileRepo(db);
    const feed = watch(repo.feed);

    await feed.until(ready());
    await keptAside();

    expect(feed.values()).toEqual([{ kind: 'corrupt', raw: damaged }]);
    expect(await db.quarantine.count()).toBe(1);
  });
});

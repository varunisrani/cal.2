import { afterEach, describe, expect, it } from 'vitest';
import type { Profile } from '../../domain/model';
import { fixedClock } from '../../lib/clock';
import { openTestDb } from '../../test/db';
import { FACTORY_NOW, makeProfile } from '../../test/factories';
import { inTimeZone } from '../../test/time';
import { WriteBlockedError, hasUnreadableData, settleQuarantine } from '../guard';
import { live, type LiveState } from '../live';
import { PROFILE_KEY, type PlatewiseDb } from '../schema';
import { ProfileUnavailableError, createProfileRepo, type ProfileRead } from './profileRepo';

const clock = fixedClock(FACTORY_NOW, 'America/New_York');
const stops: Array<() => void> = [];

afterEach(() => {
  for (const stop of stops.splice(0)) stop();
});

/** A stored profile the codec cannot read: the height is text. */
const unreadable = { id: PROFILE_KEY, sex: 'female', birthDate: '1994-03-14', heightCm: 'tall' };

/** Puts a raw value straight into `profile`, as damaged storage or another app version would. */
async function plant(db: PlatewiseDb, raw: unknown): Promise<void> {
  await db.table('profile').put(raw);
}

/** Makes every add to `quarantine` on this connection fail, like a full disk would. */
function breakQuarantine(db: PlatewiseDb): void {
  db.quarantine.hook('creating', () => {
    throw new DOMException('The quota has been exceeded', 'QuotaExceededError');
  });
}

async function stored(db: PlatewiseDb): Promise<unknown> {
  return db.table('profile').get(PROFILE_KEY);
}

async function finish(db: PlatewiseDb): Promise<void> {
  await settleQuarantine(db);
  db.close();
}

describe('get', () => {
  it('answers missing when no profile is stored', async () => {
    const { db } = await openTestDb();
    const profiles = createProfileRepo(db, { clock });
    expect(await profiles.get()).toEqual({ kind: 'missing' });
    await finish(db);
  });

  it('reads back exactly the profile saved, optional parts absent staying absent', async () => {
    const { db } = await openTestDb();
    const profiles = createProfileRepo(db, { clock });
    const profile = makeProfile();
    await profiles.save(profile);

    const read = await profiles.get();
    expect(read).toEqual({ kind: 'ok', value: profile });
    expect(read.kind === 'ok' && 'bodyFat' in read.value).toBe(false);
    expect(await stored(db)).toEqual({ ...profile, id: PROFILE_KEY });
    await finish(db);
  });

  it('calls an unreadable profile corrupt, never missing, and keeps it aside (R01.17)', async () => {
    const { db } = await openTestDb();
    await plant(db, unreadable);
    const profiles = createProfileRepo(db, { clock });

    expect(await profiles.get()).toEqual({ kind: 'corrupt', raw: unreadable });
    await settleQuarantine(db);
    expect(await stored(db)).toEqual(unreadable);
    expect(await db.quarantine.toArray()).toEqual([
      expect.objectContaining({
        table: 'profile',
        key: PROFILE_KEY,
        at: FACTORY_NOW,
        raw: unreadable,
      }),
    ]);
    expect(await hasUnreadableData(db)).toBe(true);
    await finish(db);
  });
});

describe('save', () => {
  it('keeps an unreadable profile aside, then stores the new one (R01.17)', async () => {
    const { db } = await openTestDb();
    await plant(db, unreadable);
    const profiles = createProfileRepo(db, { clock });
    const profile = makeProfile({ weightKg: 66 });

    await profiles.save(profile);
    expect(await db.quarantine.toArray()).toEqual([
      expect.objectContaining({ table: 'profile', key: PROFILE_KEY, raw: unreadable }),
    ]);
    expect(await profiles.get()).toEqual({ kind: 'ok', value: profile });
    await finish(db);
  });

  it('refuses to save over an unreadable profile that cannot be kept aside (R01.17)', async () => {
    const { db } = await openTestDb();
    await plant(db, unreadable);
    breakQuarantine(db);
    const profiles = createProfileRepo(db, { clock });

    await expect(profiles.save(makeProfile())).rejects.toBeInstanceOf(WriteBlockedError);
    expect(await stored(db)).toEqual(unreadable);
    expect(await db.quarantine.count()).toBe(0);
    await finish(db);
  });

  it('refuses a birth date that is an instant, storing nothing (R01.15)', async () => {
    const { db } = await openTestDb();
    const profiles = createProfileRepo(db, { clock });
    const instant = makeProfile({ birthDate: '1994-03-14T00:00:00.000Z' });

    await expect(profiles.save(instant)).rejects.toBeInstanceOf(TypeError);
    expect(await profiles.get()).toEqual({ kind: 'missing' });
    await finish(db);
  });

  it('keeps a birth date as the same day key in any zone (R01.15)', async () => {
    const { db } = await openTestDb();
    const profiles = createProfileRepo(db, { clock });
    await inTimeZone('Asia/Tokyo', () => profiles.save(makeProfile({ birthDate: '1990-01-31' })));

    const birthDate = async (): Promise<string | undefined> => {
      const read = await profiles.get();
      return read.kind === 'ok' ? read.value.birthDate : undefined;
    };
    expect(await inTimeZone('Pacific/Honolulu', birthDate)).toBe('1990-01-31');
    expect(await inTimeZone('Asia/Tokyo', birthDate)).toBe('1990-01-31');
    expect(await stored(db)).toMatchObject({ birthDate: '1990-01-31' });
    await finish(db);
  });
});

describe('update', () => {
  it('changes the stored profile in one step and recomputes nothing (R01.12)', async () => {
    const { db } = await openTestDb();
    const profiles = createProfileRepo(db, { clock });
    const before = makeProfile({
      saved: { kcal: 1_800, protein: 120 },
      caloriesLocked: true,
      lockedMacros: ['protein'],
    });
    await profiles.save(before);

    const after = await profiles.update((current) => ({
      ...current,
      weightKg: 70,
      activity: 'active',
    }));
    expect(after).toEqual({ ...before, weightKg: 70, activity: 'active' });
    expect(await profiles.get()).toEqual({ kind: 'ok', value: after });
    await finish(db);
  });

  it('keeps both changes when two updates run at once (R06.2)', async () => {
    const { db } = await openTestDb();
    const profiles = createProfileRepo(db, { clock });
    await profiles.save(makeProfile({ weightKg: 64, activity: 'light' }));

    await Promise.all([
      profiles.update((current) => ({ ...current, weightKg: 63 })),
      profiles.update((current) => ({ ...current, activity: 'hard' })),
    ]);
    expect(await profiles.get()).toEqual({
      kind: 'ok',
      value: makeProfile({ weightKg: 63, activity: 'hard' }),
    });
    await finish(db);
  });

  it('refuses to run on an unreadable profile, leaving it as it was and kept aside (R01.17)', async () => {
    const { db } = await openTestDb();
    await plant(db, unreadable);
    const profiles = createProfileRepo(db, { clock });
    let called = false;

    const refused = profiles.update((current) => {
      called = true;
      return current;
    });
    await expect(refused).rejects.toBeInstanceOf(ProfileUnavailableError);
    await expect(refused).rejects.toMatchObject({ reason: 'corrupt' });
    expect(called).toBe(false);
    expect(await stored(db)).toEqual(unreadable);
    expect(await db.quarantine.toArray()).toEqual([
      expect.objectContaining({ table: 'profile', key: PROFILE_KEY, raw: unreadable }),
    ]);
    await finish(db);
  });

  it('refuses to run on an unreadable profile even when it cannot be kept aside', async () => {
    const { db } = await openTestDb();
    await plant(db, unreadable);
    breakQuarantine(db);
    const profiles = createProfileRepo(db, { clock });

    await expect(profiles.update((current) => current)).rejects.toMatchObject({
      name: 'ProfileUnavailableError',
      reason: 'corrupt',
    });
    expect(await stored(db)).toEqual(unreadable);
    await finish(db);
  });

  it('refuses to run when no profile is stored, instead of starting from defaults', async () => {
    const { db } = await openTestDb();
    const profiles = createProfileRepo(db, { clock });

    await expect(profiles.update((current) => current)).rejects.toMatchObject({
      name: 'ProfileUnavailableError',
      reason: 'missing',
    });
    expect(await db.profile.count()).toBe(0);
    await finish(db);
  });

  it('refuses a change that cannot be read back and keeps the stored profile', async () => {
    const { db } = await openTestDb();
    const profiles = createProfileRepo(db, { clock });
    const profile = makeProfile();
    await profiles.save(profile);

    await expect(
      profiles.update((current) => ({ ...current, birthDate: 'not a day' })),
    ).rejects.toBeInstanceOf(TypeError);
    expect(await profiles.get()).toEqual({ kind: 'ok', value: profile });
    await finish(db);
  });
});

describe('live reads', () => {
  it('follows a saved change like any table', async () => {
    const { db } = await openTestDb();
    const profiles = createProfileRepo(db, { clock });
    await profiles.save(makeProfile({ weightKg: 64 }));

    const source = live(() => profiles.get());
    const weights: number[] = [];
    let waiting: { kg: number; resolve: () => void } | null = null;
    const onChange = (state: LiveState<ProfileRead>) => {
      if (state.status !== 'ready' || state.value.kind !== 'ok') return;
      const { weightKg } = state.value.value;
      weights.push(weightKg);
      if (waiting && weightKg === waiting.kg) waiting.resolve();
    };
    const until = (kg: number) =>
      new Promise<void>((resolve) => {
        waiting = { kg, resolve };
        onChange(source.getSnapshot());
      });
    stops.push(source.subscribe(() => onChange(source.getSnapshot())));

    await until(64);
    await profiles.update((current: Profile) => ({ ...current, weightKg: 65.5 }));
    await until(65.5);
    expect(weights.at(0)).toBe(64);
    expect(weights.at(-1)).toBe(65.5);
    await finish(db);
  });
});

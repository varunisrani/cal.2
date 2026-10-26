// The profile: one row (`profile`, key `me`) holding the person's body data and goal choice.
//
// Reading it answers missing, ok or corrupt, and corrupt never passes for missing: that would send
// the person back to onboarding and let the next save write over their only copy (R01.17). A save
// keeps an unreadable stored record aside first, in the same transaction; an update refuses to
// start from anything but a readable record. Birth dates are day keys, so the stored day never
// moves with the time zone (R01.15). The live feed starts loading and only then answers, so a
// screen can wait instead of showing fallback goals (R05.12).

import { decodeProfile } from '../codecs';
import { transact, type PlatewiseDb } from '../db';
import { readOne, writeOne, type GuardOptions, type ReadOneResult } from '../guard';
import { live, type LiveFeed } from '../live';
import type { Profile } from '../../domain/model';
import type { ProfileRow } from '../schema';

/** The key of the one profile row. */
export const PROFILE_KEY = 'me';

/** What reading the profile can answer. */
export type ProfileRead = ReadOneResult<Profile>;

/** An update found no profile to change (onboarding has not saved one yet). */
export class ProfileMissingError extends Error {
  override readonly name = 'ProfileMissingError';

  constructor() {
    super('There is no profile to update');
  }
}

/** An update found a profile that cannot be read; it was kept aside and left as it is. */
export class ProfileUnreadableError extends Error {
  override readonly name = 'ProfileUnreadableError';

  constructor(readonly raw: unknown) {
    super('The stored profile cannot be read, so it was not updated');
  }
}

export interface ProfileRepo {
  get(): Promise<ProfileRead>;
  /**
   * Stores `profile` as the one profile, in the codec's normal form. Rejects with a TypeError for
   * a record that would not read back (a birth date that is not a day key, a weight of 0), and
   * with WriteBlockedError when an unreadable stored profile could not be kept aside.
   */
  save(profile: Profile): Promise<void>;
  /**
   * Reads the profile, applies `change` and stores the result in one transaction; returns what
   * was stored. Rejects with ProfileMissingError or ProfileUnreadableError without writing.
   * `change` must not await anything: the transaction ends with the first outside wait.
   */
  update(change: (current: Profile) => Profile): Promise<Profile>;
  /** The profile, live: loading until the first read, then missing, ok or corrupt. */
  readonly feed: LiveFeed<ProfileRead>;
}

/** `profile` as every reader will see it; a TypeError when it would not read back. */
function normalForm(profile: Profile): Profile {
  const normal = decodeProfile(profile);
  if (normal === null) throw new TypeError('Refusing to store a profile that would not read back');
  return normal;
}

function rowOf(profile: Profile): ProfileRow {
  return { ...profile, id: PROFILE_KEY };
}

export function createProfileRepo(db: PlatewiseDb, options: GuardOptions = {}): ProfileRepo {
  const get = (): Promise<ProfileRead> =>
    readOne(db, 'profile', PROFILE_KEY, decodeProfile, options);

  async function save(profile: Profile): Promise<void> {
    await writeOne(db, 'profile', rowOf(normalForm(profile)), decodeProfile, options);
  }

  async function update(change: (current: Profile) => Profile): Promise<Profile> {
    const outcome = await transact(db, 'rw', ['profile'], async (): Promise<ProfileRead> => {
      // A corrupt record is kept aside inside this transaction, which then commits unchanged.
      const found = await get();
      if (found.kind !== 'ok') return found;
      const next = normalForm(change(found.value));
      await db.profile.put(rowOf(next));
      return { kind: 'ok', value: next };
    });
    if (outcome.kind === 'missing') throw new ProfileMissingError();
    if (outcome.kind === 'corrupt') throw new ProfileUnreadableError(outcome.raw);
    return outcome.value;
  }

  return { get, save, update, feed: live(get) };
}

// The one profile record (`profile` row `me`). Reading tells "nothing stored yet" apart from "stored
// but unreadable", so damaged data never sends the person back through onboarding, and an
// unreadable profile is kept aside before anything replaces it (R01.17). The repository stores
// exactly the profile it is given: edits never recompute targets (R01.12). Birth dates are local
// day keys; a profile whose birth date is anything else cannot be read back and is refused.

import { systemClock, type Clock } from '../../lib/clock';
import type { Profile } from '../../domain/model';
import { decodeProfile } from '../codecs';
import { keepAside, readOne, writeOne, type ReadOneResult } from '../guard';
import { PROFILE_KEY, type ProfileRow, type PlatewiseDb } from '../schema';

/** `missing` before onboarding, `ok` with the profile, or `corrupt` with the stored raw value. */
export type ProfileRead = ReadOneResult<Profile>;

/** Why `update` refused to run: no profile is stored, or the stored one cannot be read. */
export class ProfileUnavailableError extends Error {
  override readonly name = 'ProfileUnavailableError';
  readonly reason: 'missing' | 'corrupt';

  constructor(reason: 'missing' | 'corrupt') {
    super(
      reason === 'missing'
        ? 'Refused: there is no stored profile to change'
        : 'Refused: the stored profile cannot be read, so it is not changed',
    );
    this.reason = reason;
  }
}

export interface ProfileRepo {
  get(): Promise<ProfileRead>;
  /**
   * Stores `profile` as it is. An unreadable stored profile is kept aside first, in the same
   * transaction; rejects with `WriteBlockedError` when that copy fails (nothing is written) and
   * with a TypeError for a profile that cannot be read back (a birth date that is not a day key).
   */
  save(profile: Profile): Promise<void>;
  /**
   * Reads the stored profile, applies `change` and stores the result in one transaction; resolves
   * with the stored profile. Rejects with `ProfileUnavailableError` when nothing is stored or the
   * stored profile cannot be read, and changes nothing. `change` must be synchronous.
   */
  update(change: (current: Profile) => Profile): Promise<Profile>;
}

export interface ProfileRepoOptions {
  /** The time quarantine copies are stamped with. */
  clock?: Clock;
}

function rowOf(profile: Profile): ProfileRow {
  return { ...profile, id: PROFILE_KEY };
}

export function createProfileRepo(db: PlatewiseDb, options: ProfileRepoOptions = {}): ProfileRepo {
  const clock = options.clock ?? systemClock;

  return {
    get() {
      return readOne(db, 'profile', PROFILE_KEY, decodeProfile, clock);
    },

    save(profile) {
      return writeOne(db, 'profile', rowOf(profile), decodeProfile, clock);
    },

    async update(change) {
      const outcome = await db.transaction('rw', db.profile, async () => {
        const stored: unknown = await db.profile.get(PROFILE_KEY);
        if (stored === undefined) return { kind: 'missing' } as const;
        const current = decodeProfile(stored);
        if (current === null) return { kind: 'corrupt', raw: stored } as const;
        const next = change(current);
        const row = rowOf(next);
        if (decodeProfile(row) === null) {
          throw new TypeError('Refusing to store a profile that cannot be read back');
        }
        await db.profile.put(row);
        return { kind: 'ok', value: next } as const;
      });
      if (outcome.kind === 'ok') return outcome.value;
      if (outcome.kind === 'corrupt') {
        // Copied in its own transaction: one inside the refused update would be rolled back with
        // it. A failed copy loses nothing, because the stored value stays where it is.
        await keepAside(db, 'profile', PROFILE_KEY, outcome.raw, clock).catch(() => undefined);
      }
      throw new ProfileUnavailableError(outcome.kind);
    },
  };
}

// Real repositories on a fake IndexedDB for the Coach session and snapshot tests, with the clock
// at the snapshot fixtures' "now" (Monday 26 October 2026, 12:30 in New York).

import { createBodyFatRepo } from '../../../data/repos/bodyFatRepo';
import { createCoachRepo } from '../../../data/repos/coachRepo';
import { createDiaryRepo } from '../../../data/repos/diaryRepo';
import { createFastRepo } from '../../../data/repos/fastRepo';
import { createProfileRepo } from '../../../data/repos/profileRepo';
import { createSettingsRepo } from '../../../data/repos/settingsRepo';
import { createWaterRepo } from '../../../data/repos/waterRepo';
import { createWeightRepo } from '../../../data/repos/weightRepo';
import type { PlatewiseDb } from '../../../data/schema';
import { fixedClock } from '../../../lib/clock';
import { withIdSequence } from '../../../lib/ids';
import { openTestDb } from '../../../test/db';
import type { SnapshotSources } from '../snapshot';
import { SNAPSHOT_NOW } from './snapshot';

export const STORES_ZONE = 'America/New_York';

export async function openCoachStores() {
  const { db, bus } = await openTestDb();
  const clock = fixedClock(SNAPSHOT_NOW, STORES_ZONE);
  const sources = {
    profileRepo: createProfileRepo(db, { clock }),
    settingsRepo: createSettingsRepo(db, { locale: 'en-US', clock, bus }),
    diaryRepo: createDiaryRepo(db, { clock }),
    weightRepo: createWeightRepo(db, { clock, newId: withIdSequence('weigh'), bus }),
    bodyFatRepo: createBodyFatRepo(db, { clock, newId: withIdSequence('fat') }),
    fastRepo: createFastRepo(db, { clock, newId: withIdSequence('fast') }),
    waterRepo: createWaterRepo(db, { clock, newId: withIdSequence('water') }),
    clock,
  } satisfies SnapshotSources;
  const coachRepo = createCoachRepo(db, { clock, newId: withIdSequence('message') });
  return { db, sources, coachRepo, ...sources };
}

export type CoachStores = Awaited<ReturnType<typeof openCoachStores>>;

/** Closes every database a test opened. */
export function closeAll(dbs: PlatewiseDb[]): void {
  for (const db of dbs.splice(0)) db.close();
}

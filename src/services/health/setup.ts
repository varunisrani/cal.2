// Builds the health parts of the Android app (P11-03) from the composition root's repositories:
// the activity repository, the native plugin, the write-back watch and the service. Fetched only
// through `load.ts`, inside the Android app.

import type { LiveSource } from '../../data/live';
import type { DiaryRepo } from '../../data/repos/diaryRepo';
import { createHealthRepo } from '../../data/repos/healthRepo';
import type { SettingsRepo } from '../../data/repos/settingsRepo';
import type { WeightRepo } from '../../data/repos/weightRepo';
import type { PlatewiseDb } from '../../data/schema';
import type { Clock } from '../../lib/clock';
import type { PageVisibility } from '../reminders/engine';
import type { HealthConnectPlugin } from './contract';
import type { HealthParts } from './load';
import { nativeHealthPlugin } from './native';
import { createHealthService } from './service';
import { storedHealthWatch } from './watch';

/** What the composition root already has. */
export interface HealthBase {
  readonly db: PlatewiseDb;
  readonly settingsRepo: SettingsRepo;
  readonly diaryRepo: DiaryRepo;
  readonly weightRepo: WeightRepo;
  readonly clock: Clock;
  readonly visibility: PageVisibility;
  /** `live` from src/data/live.ts, for the write-back watch (see `storedHealthWatch`). */
  readonly live: <T>(query: () => Promise<T>) => LiveSource<T>;
}

/** The parts over `base`; the plugin is the native one unless a test passes its own. */
export function setUpHealth(
  base: HealthBase,
  plugin: HealthConnectPlugin = nativeHealthPlugin(),
): HealthParts {
  const { db, settingsRepo, diaryRepo, weightRepo, clock, visibility, live } = base;
  const healthRepo = createHealthRepo(db, { clock });
  const service = createHealthService({
    plugin,
    healthRepo,
    settingsRepo,
    diaryRepo,
    weightRepo,
    clock,
    visibility,
    watch: storedHealthWatch({ diaryRepo, weightRepo, clock, live }),
  });
  return { service, activityRepo: healthRepo };
}

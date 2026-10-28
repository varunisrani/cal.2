// Builds the walk parts of the Android app (P15-02) from the composition root's repositories: the
// walks repository, the Health Connect link when Health Connect is there, and the service over the
// tracker plugin. Fetched only through `load.ts`.

import type { ProfileRepo } from '../../data/repos/profileRepo';
import type { SettingsRepo } from '../../data/repos/settingsRepo';
import { createWalkRepo } from '../../data/repos/walkRepo';
import type { PlatewiseDb } from '../../data/schema';
import type { Clock } from '../../lib/clock';
import type { HealthConnectPlugin } from '../health/contract';
import type { PageVisibility } from '../reminders/engine';
import type { WalkTrackerPlugin } from './contract';
import { healthWalkLink } from './healthLink';
import type { WalkParts } from './load';
import { createWalkService } from './service';

/** What the composition root already has. */
export interface WalksBase {
  readonly db: PlatewiseDb;
  readonly profileRepo: Pick<ProfileRepo, 'get'>;
  readonly settingsRepo: Pick<SettingsRepo, 'loaded' | 'snapshot'>;
  readonly clock: Clock;
  readonly visibility: PageVisibility;
  /** Health Connect's plugin, when the app has it (P11). */
  readonly healthPlugin?: Pick<HealthConnectPlugin, 'writeWalk' | 'readHeartRate'>;
}

/** The parts over `base` with the given tracker (the native one, or a test's). */
export function setUpWalks(base: WalksBase, plugin: WalkTrackerPlugin): WalkParts {
  const walkRepo = createWalkRepo(base.db, { clock: base.clock });
  const service = createWalkService({
    plugin,
    walkRepo,
    profileRepo: base.profileRepo,
    health: base.healthPlugin
      ? healthWalkLink({ plugin: base.healthPlugin, settingsRepo: base.settingsRepo })
      : undefined,
    clock: base.clock,
    visibility: base.visibility,
  });
  return { service, walkRepo };
}

/** The parts over the Android app's own tracker. */
export async function setUpNativeWalks(base: WalksBase): Promise<WalkParts> {
  const { nativeWalkPlugin } = await import('./native');
  return setUpWalks(base, nativeWalkPlugin());
}

// Health Connect at start-up (P11-03): on the Android app only. The platform is checked before
// anything is fetched, so the web build never downloads the health service, its repository, the
// native adapter or Capacitor's core: they all sit behind the one dynamic import below, in chunks
// only the Android app asks for.

import type { HealthRepo } from '../../data/repos/healthRepo';
import { isHealthAvailable } from './platform';
import type { HealthBase } from './setup';
import type { HealthService } from './service';

export type { HealthBase } from './setup';

/** What the composition root hands out: the service, and the activity copy for the read hooks. */
export interface HealthParts {
  readonly service: HealthService;
  readonly activityRepo: Pick<HealthRepo, 'between'>;
}

/** Fetches the module that builds the parts; tests pass their own to see whether it was fetched. */
export type HealthSetupModule = () => Promise<{ setUpHealth(base: HealthBase): HealthParts }>;

const APP_SETUP: HealthSetupModule = () => import('./setup');

/** The health parts, or undefined outside the Android app (nothing is fetched then). */
export async function loadHealth(
  base: HealthBase,
  setup: HealthSetupModule = APP_SETUP,
  available: () => boolean = isHealthAvailable,
): Promise<HealthParts | undefined> {
  if (!available()) return undefined;
  const { setUpHealth } = await setup();
  return setUpHealth(base);
}

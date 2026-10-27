// Test helper: the fasting screens over a fresh test database, with the real fasting service and
// the screen harness's repositories, router, toasts and providers. The clock is the harness's:
// Monday 26 October 2026, 12:30 in New York.

import type { ReactNode } from 'react';
import type { Fast } from '../../../domain/model';
import { ServicesProvider } from '../../../services/context';
import { createFastingService, type FastingService } from '../../../services/fasting';
import { openHarness, type HarnessOptions } from '../../../test/screenHarness';

export interface FastingSetup {
  /** Fasting tracking; off by default, as in the app. */
  readonly on?: boolean;
  /** The default goal in minutes. */
  readonly defaultGoalMin?: number;
  /** Fasts stored before the screen opens, as they are. */
  readonly fasts?: readonly Fast[];
  /** The address the harness opens on. */
  readonly hash?: string;
  /** Changes what the read hooks see (a held or failing read). */
  readonly sources?: HarnessOptions['sources'];
  /** Wraps the real fasting service (a failing write). */
  readonly wrap?: (real: FastingService) => FastingService;
}

export async function openFasting({
  on,
  defaultGoalMin,
  fasts = [],
  hash = '#/settings/tracking',
  sources,
  wrap,
}: FastingSetup = {}) {
  const h = await openHarness({ hash, sources });
  const { settingsRepo, fastRepo, diaryRepo } = h.repos;
  if (on !== undefined) await settingsRepo.set('fasting.on', on);
  if (defaultGoalMin !== undefined)
    await settingsRepo.set('fasting.defaultGoalMin', defaultGoalMin);
  if (fasts.length > 0) await h.db.fasts.bulkPut([...fasts]);
  const real = createFastingService({ fastRepo, diaryRepo, settingsRepo, clock: h.clock });
  const fasting = wrap ? wrap(real) : real;
  const services = { ...h.services, fasting };

  /** Renders `ui` in the harness's providers with the fasting service. */
  const mount = (ui: ReactNode) =>
    h.mount(<ServicesProvider services={services}>{ui}</ServicesProvider>);

  /** Every stored fast, oldest start first. */
  const storedFasts = (): Promise<Fast[]> => fastRepo.list();

  return { ...h, fasting, services, mount, storedFasts };
}

export type FastingHarness = Awaited<ReturnType<typeof openFasting>>;

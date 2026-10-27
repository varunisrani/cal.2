// Test helper: the Progress tab over a fresh test database, with the real progress service and
// the screen harness's repositories, router (on #/progress) and providers. The clock is the
// harness's: Monday 26 October 2026, 12:30 in New York.

import type { ReactNode } from 'react';
import type { DataSources } from '../../../data/DataProvider';
import type { Profile } from '../../../domain/model';
import type { WeightDisplayUnit } from '../../../domain/units/body';
import { ServicesProvider } from '../../../services/context';
import { createProgressService } from '../../../services/progress';
import { makeProfile } from '../../../test/factories';
import { openHarness } from '../../../test/screenHarness';

export interface ProgressSetup {
  /** The stored profile; null stores none. A lose profile of 64 kg aiming at 60 kg by default. */
  readonly profile?: Profile | null;
  readonly weight?: WeightDisplayUnit;
  /** Weigh-ins added through the weight repository, so the profile follows the newest. */
  readonly weighIns?: ReadonlyArray<{ readonly at: number; readonly kg: number }>;
  /** Body-fat readings (fractions) added through their repository. */
  readonly bodyFat?: ReadonlyArray<{ readonly at: number; readonly fraction: number }>;
  /** Changes what the read hooks see (a held or failing read). */
  readonly sources?: (real: DataSources) => DataSources;
}

export async function openProgress({
  profile = makeProfile(),
  weight = 'kg',
  weighIns = [],
  bodyFat = [],
  sources,
}: ProgressSetup = {}) {
  const h = await openHarness({ hash: '#/progress', sources });
  const { profileRepo, settingsRepo, weightRepo, bodyFatRepo } = h.repos;
  if (profile) await profileRepo.save(profile);
  await settingsRepo.set('units.weight', weight);
  for (const reading of weighIns) await weightRepo.addWeighIn(reading);
  for (const reading of bodyFat) await bodyFatRepo.addReading(reading);
  const progress = createProgressService({ weightRepo, bodyFatRepo, settingsRepo, clock: h.clock });
  const services = { ...h.services, progress };

  /** Renders `ui` in the harness's providers with the progress service. */
  const mount = (ui: ReactNode) =>
    h.mount(<ServicesProvider services={services}>{ui}</ServicesProvider>);

  /** The stored profile; throws when there is none. */
  const stored = async (): Promise<Profile> => {
    const read = await profileRepo.get();
    if (read.kind !== 'ok') throw new Error(`no stored profile: ${read.kind}`);
    return read.value;
  };

  return { ...h, progress, mount, stored };
}

export type ProgressHarness = Awaited<ReturnType<typeof openProgress>>;

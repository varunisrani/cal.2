// Test helper: Personal info over a fresh test database, with the real profile edits service and
// the screen harness's repositories, router and providers.

import type { ReactNode } from 'react';
import type { Profile } from '../../../../domain/model';
import type { HeightDisplayUnit, WeightDisplayUnit } from '../../../../domain/units/body';
import { ServicesProvider } from '../../../../services/context';
import { createProfileEditsService } from '../../../../services/profileEdits';
import { openHarness } from '../../../../test/screenHarness';

export interface ProfileSetup {
  /** The stored profile; null stores none. */
  readonly profile: Profile | null;
  readonly weight?: WeightDisplayUnit;
  readonly height?: HeightDisplayUnit;
  /** A stored rebuild baseline (`goals.rebuildBaseline`). */
  readonly baseline?: string;
}

export async function openProfile({
  profile,
  weight = 'kg',
  height = 'cm',
  baseline,
}: ProfileSetup) {
  const h = await openHarness({ hash: '#/settings/profile' });
  const { profileRepo, settingsRepo, weightRepo } = h.repos;
  if (profile) await profileRepo.save(profile);
  await settingsRepo.set('units.weight', weight);
  await settingsRepo.set('units.height', height);
  if (baseline !== undefined) await settingsRepo.set('goals.rebuildBaseline', baseline);
  const profileEdits = createProfileEditsService({
    profileRepo,
    settingsRepo,
    weightRepo,
    clock: h.clock,
  });
  const services = { ...h.services, profileEdits };

  /** Renders `ui` in the harness's providers with the profile edits service. */
  const mount = (ui: ReactNode) =>
    h.mount(<ServicesProvider services={services}>{ui}</ServicesProvider>);

  /** The stored profile; throws when there is none. */
  const stored = async (): Promise<Profile> => {
    const read = await profileRepo.get();
    if (read.kind !== 'ok') throw new Error(`no stored profile: ${read.kind}`);
    return read.value;
  };

  return { ...h, profileEdits, mount, stored };
}

export type ProfileHarness = Awaited<ReturnType<typeof openProfile>>;

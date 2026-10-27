// Home's own choices (P07-04): which nutrients Home shows as pillars (setting `home.pillars`). The
// picker keeps its draft to itself and stores it here only on Done; the settings repository checks
// the list and tidies it (P01-07 rules: known names, no repeats, at most four).

import type { SettingsRepo } from '../data/repos/settingsRepo';
import type { PillarKey } from '../domain/nutrients/catalogue';

export interface HomePrefsService {
  /**
   * Stores the pillars Home shows, in the order they were picked; resolves with the list as
   * stored. A list the settings refuse (empty, or no known name) rejects and stores nothing.
   */
  setPillars(keys: readonly PillarKey[]): Promise<readonly PillarKey[]>;
}

export interface HomePrefsDeps {
  readonly settingsRepo: Pick<SettingsRepo, 'set'>;
}

export function createHomePrefsService({ settingsRepo }: HomePrefsDeps): HomePrefsService {
  return {
    setPillars: (keys) => settingsRepo.set('home.pillars', [...keys]),
  };
}

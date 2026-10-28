// Home's own choices (P07-04): which nutrients Home shows as pillars (setting `home.pillars`). The
// picker keeps its draft to itself and stores it here only on Done; the settings repository checks
// the list and tidies it (P01-07 rules: known names, no repeats, at most four). Also how the diary
// forms its sections (setting `home.sort`, P07-05), whether the Sugar line shows under the
// pillars (setting `home.sugarLine`, D-16.98), and whether the spend line shows under the summary
// (setting `home.spendLine`, D-16.108).

import type { SettingsRepo } from '../data/repos/settingsRepo';
import type { DiarySortMode } from '../domain/meals/diary';
import type { PillarKey } from '../domain/nutrients/catalogue';

export interface HomePrefsService {
  /**
   * Stores the pillars Home shows, in the order they were picked; resolves with the list as
   * stored. A list the settings refuse (empty, or no known name) rejects and stores nothing.
   */
  setPillars(keys: readonly PillarKey[]): Promise<readonly PillarKey[]>;
  /** Stores how the diary forms its sections: by meal, or newest first. */
  setSort(mode: DiarySortMode): Promise<void>;
  /** Stores whether Home shows the Sugar line under the pillars. */
  setSugarLine(on: boolean): Promise<void>;
  /** Stores whether Home shows the day's spend under the summary. */
  setSpendLine(on: boolean): Promise<void>;
}

export interface HomePrefsDeps {
  readonly settingsRepo: Pick<SettingsRepo, 'set'>;
}

export function createHomePrefsService({ settingsRepo }: HomePrefsDeps): HomePrefsService {
  return {
    setPillars: (keys) => settingsRepo.set('home.pillars', [...keys]),
    async setSort(mode) {
      await settingsRepo.set('home.sort', mode);
    },
    async setSugarLine(on) {
      await settingsRepo.set('home.sugarLine', on);
    },
    async setSpendLine(on) {
      await settingsRepo.set('home.spendLine', on);
    },
  };
}

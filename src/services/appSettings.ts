// Settings › App settings and the pages it links to (P09-02, P09-04, P09-06): every write they
// make. Each change stores one setting at once. A unit is only how numbers are shown and typed, so
// changing one never touches a stored entry, goal, weight or height. Hiding a tab or a product
// detail reads the stored list inside the write and changes that one name, so a page showing an
// older list never undoes a change made elsewhere (R05.13). The add menu's layout is stored tidied
// (P09-05, R06.21): the editor may hold empty groups and names as typed; what is stored has neither.

import type { SettingsRepo } from '../data/repos/settingsRepo';
import {
  PRODUCT_FIELDS,
  type HideableTab,
  type ProductField,
  type SettingValue,
} from '../data/settingsSchema';
import {
  decodeLayout,
  sanitiseLayout,
  type AddMenuLayout,
  type LayoutDraft,
} from '../domain/food/addMenu';

/** The settings these pages store as chosen, one row each. */
export const PLAIN_APP_SETTINGS = [
  'display.appearance',
  'display.accent',
  'log.gramsFirst',
  'display.weekStart',
  'units.energy',
  'units.height',
  'money.currency',
  'product.show',
] as const;

export type PlainAppSetting = (typeof PLAIN_APP_SETTINGS)[number];

export interface AppSettingsService {
  /** Stores one of the plain settings; resolves once it is stored. */
  set<K extends PlainAppSetting>(key: K, value: SettingValue<K>): Promise<void>;
  /** Hides or shows one tab; resolves with the hidden tabs as stored. */
  setTabHidden(tab: HideableTab, hidden: boolean): Promise<readonly HideableTab[]>;
  /** Hides or shows one product detail; resolves with the hidden details as stored. */
  setProductFieldHidden(field: ProductField, hidden: boolean): Promise<readonly ProductField[]>;
  /** Stores the add menu's layout tidied; resolves with the menu as stored. */
  setMenuLayout(layout: LayoutDraft): Promise<AddMenuLayout>;
  /** Puts the default add menu back; resolves with it. */
  resetMenuLayout(): Promise<AddMenuLayout>;
}

export interface AppSettingsDeps {
  readonly settingsRepo: Pick<SettingsRepo, 'set' | 'update' | 'toggleHiddenTab'>;
}

export function createAppSettingsService({ settingsRepo }: AppSettingsDeps): AppSettingsService {
  return {
    async set(key, value) {
      await settingsRepo.set(key, value);
    },

    setTabHidden: (tab, hidden) => settingsRepo.toggleHiddenTab(tab, hidden),

    // Written in the block's order; names the stored list has but this build does not know were
    // already dropped when it was read.
    setProductFieldHidden: (field, hidden) =>
      settingsRepo.update('product.hiddenFields', (current) =>
        PRODUCT_FIELDS.filter((each) => (each === field ? hidden : current.includes(each))),
      ),

    async setMenuLayout(layout) {
      return decodeLayout(await settingsRepo.set('menu.layout', { ...sanitiseLayout(layout) }));
    },

    // Nothing stored is the default menu, so a later default reaches whoever reset.
    async resetMenuLayout() {
      return decodeLayout(await settingsRepo.set('menu.layout', null));
    },
  };
}

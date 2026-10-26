import type { MessageTree } from '../catalogue';

/**
 * Words of the Settings hub (src/features/settings). The back link on category pages uses the
 * tab's own name (`common.tabs.settings`). Later phases add their category titles under
 * `settings.category`.
 */
export const settings = {
  settings: {
    group: {
      prefs: 'Preferences',
      info: 'About',
    },
    empty: 'Nothing to set up here yet. Your preferences will appear in this list.',
  },
} as const satisfies MessageTree;

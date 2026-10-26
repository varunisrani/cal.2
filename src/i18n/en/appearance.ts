import type { MessageTree } from '../catalogue';

/** Names of the appearance modes and of the six accent presets (D-16.1). */
export const appearance = {
  appearance: {
    mode: {
      system: 'System',
      light: 'Light',
      dark: 'Dark',
    },
    accent: {
      basil: 'Basil',
      saffron: 'Saffron',
      lagoon: 'Lagoon',
      beet: 'Beet',
      ember: 'Ember',
      ink: 'Ink',
    },
  },
} as const satisfies MessageTree;

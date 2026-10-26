import type { MessageTree } from '../catalogue';

/** Names of the appearance choices and the accent presets (src/ui/theme.ts, src/ui/tokens.ts). */
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

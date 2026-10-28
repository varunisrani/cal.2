import type { MessageTree } from '../catalogue';

/**
 * Home's budget line in the Android app when Health Connect adds the energy burned (P11-04):
 * drawn by Home's day summary, so it comes with the app; the rest of Health Connect's words
 * (`health`) are fetched with the screens and services that use them (P18-00).
 */
export const healthBudget = {
  health: {
    home: {
      budget: '{goal} goal + {burned} burned',
    },
  },
} as const satisfies MessageTree;

import type { MessageTree } from '../catalogue';

/**
 * Words of the fit check (src/features/log/FitCheckSheet.tsx): the day with the meal added, per
 * value, and the AI suggestion's states. Unit words (g, kcal, kJ) come from the review partition.
 */
export const fitCheck = {
  fitCheck: {
    title: 'Fit check',
    heading: 'The day with this meal',
    note: 'Nothing is logged here.',
    row: {
      energy: 'Energy',
      protein: 'Protein',
      carbs: 'Carbs',
      fat: 'Fat',
    },
    added: '+{amount} {unit}',
    afterGoal: '{after} / {goal} {unit}',
    after: '{after} {unit}',
    left: '{amount} {unit} left',
    over: '{amount} {unit} over',
    noGoals: 'No goals to compare with yet.',
    suggestion: {
      heading: 'Suggestion',
      loading: 'Checking how it fits…',
      empty: 'No suggestion this time. The numbers above still hold.',
      noKey: 'For a suggestion, add an AI provider and its key in Settings, under AI.',
      noProfile: 'A suggestion needs your profile and goals first.',
    },
  },
} as const satisfies MessageTree;

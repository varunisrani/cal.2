import type { MessageTree } from '../catalogue';

/**
 * Words of the Sources sheet (src/features/home/SourcesSheet.tsx, D-16.105): which foods gave
 * the shown day one nutrient. The nutrient's names, the amounts with their units, "over" and
 * "Today" are Home's.
 */
export const sources = {
  sources: {
    title: '{name} by food',
    ofGoal: '{amount} of {goal} goal',
    ofLimit: '{amount} of {limit} limit',
    when: '{meal}, {time}',
    noFigure: '{count, plural, one {# food has} other {# foods have}} no {name} figure',
    empty: 'No {name} counted on this day.',
  },
} as const satisfies MessageTree;

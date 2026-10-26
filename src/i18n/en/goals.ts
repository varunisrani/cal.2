import type { MessageTree } from '../catalogue';

/**
 * Words of the goal features (src/features/goals): the dialog shown when a weigh-in reaches the
 * goal weight (P05-14, D-16.13).
 */
export const goals = {
  goals: {
    reached: {
      title: 'You reached your goal weight',
      message:
        'You weighed in at {weight}, right where you were aiming. Set a new goal to give your plan its next direction, or keep this one for now.',
      messageNoWeight:
        'Your latest weigh-in is right where you were aiming. Set a new goal to give your plan its next direction, or keep this one for now.',
      setNewGoal: 'Set a new goal',
      dismiss: 'Dismiss',
      weight: {
        kg: '{amount} kg',
        lb: '{amount} lb',
      },
    },
  },
} as const satisfies MessageTree;

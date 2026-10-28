import type { MessageTree } from '../catalogue';

/**
 * Words of the dialog shown when a weigh-in reaches the goal weight (src/features/goals,
 * P05-14, D-16.13). It can open over any tab, so these come with the app; the rest of the goal
 * features' words (`goals`) are fetched with Settings (P18-00).
 */
export const goalReached = {
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
      },
    },
  },
} as const satisfies MessageTree;

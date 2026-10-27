import type { MessageTree } from '../catalogue';

/**
 * Words of the reminders (src/services/reminders): the title and body of each notice the engine
 * hands to the notifier, as a system notification or an in-app banner. Energy amounts arrive as
 * whole numbers in the person's unit; `{goal}` of the fasting goal is a short length ("16h").
 */
export const reminders = {
  reminders: {
    breakfast: {
      title: 'Breakfast',
      body: 'Time to log your breakfast.',
    },
    lunch: {
      title: 'Lunch',
      body: 'Time to log your lunch.',
    },
    dinner: {
      title: 'Dinner',
      body: 'Time to log your dinner.',
    },
    summary: {
      title: 'Your day so far',
      kcal: 'Eaten {eaten} of {goal} kcal, {left} left.',
      kJ: 'Eaten {eaten} of {goal} kJ, {left} left.',
      noGoalKcal: 'Eaten {eaten} kcal today.',
      noGoalKJ: 'Eaten {eaten} kJ today.',
      unread: 'Open Platewise to see how today adds up.',
    },
    water: {
      title: 'Water',
      body: 'A good moment for a glass of water. Add it once you have had it.',
    },
    fastGoal: {
      title: 'Fasting goal met',
      body: '{goal} done. Your fast keeps running until you end it.',
    },
  },
} as const satisfies MessageTree;

import type { MessageTree } from '../catalogue';

/**
 * Words of the reminders the engine hands to the notifier (src/services/reminders): the title and
 * body of each, as a system notification or an in-app banner; energy amounts arrive as whole
 * numbers in the person's unit, and `{goal}` of the fasting goal is a short length ("16h"). Also
 * the banners' own words and the Android app's notification channel. These come with the app; the
 * reminders' settings and the Android app's notices (`reminders`) are fetched with their screens
 * and services (P18-00).
 */
export const reminderTexts = {
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
    // A reminder the person wrote (P13, D-16.93): `{text}` is their own words.
    custom: {
      title: 'Reminder',
      body: '{text}',
    },
    // The Android app's notification channel, as Android's settings list it (P13, D-16.92).
    channel: {
      name: 'Reminders',
      description: 'Meal, water, summary and fasting reminders, and the ones you write.',
    },
    // The notifier (P09-09): the goal-weight alert and the banners in the app.
    goalReached: {
      title: 'Goal weight reached',
      body: 'Your latest weigh-in reached your goal weight. Well done!',
    },
    banner: {
      missed: 'Due at {time}, while Platewise was closed.',
      dismiss: 'Dismiss',
    },
  },
} as const satisfies MessageTree;

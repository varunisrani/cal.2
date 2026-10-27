import type { MessageTree } from '../catalogue';

/**
 * Words of the reminders (src/services/reminders): the title and body of each notice the engine
 * hands to the notifier, as a system notification or an in-app banner. Energy amounts arrive as
 * whole numbers in the person's unit; `{goal}` of the fasting goal is a short length ("16h").
 * Also the banners' own words and the Notifications card of Settings › Tracking & reminders.
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
    // The notifier (P09-09): the goal-weight alert and the banners in the app.
    goalReached: {
      title: 'Goal weight reached',
      body: 'Your latest weigh-in reached your goal weight. Well done!',
    },
    banner: {
      missed: 'Due at {time}, while Platewise was closed.',
      dismiss: 'Dismiss',
    },
    // The Notifications card of Settings › Tracking & reminders (P09-09).
    settings: {
      heading: 'Notifications',
      master: 'Notifications',
      masterHint: 'Your browser asks for permission the first time.',
      blocked:
        "This browser is blocking notifications from Platewise. Allow them in the browser's site settings, then come back here.",
      unsupported:
        "This browser can't show notifications. Adding Platewise to your home screen may make them available.",
      // Inside the Android app (P11), where the page has no notifications at all.
      unsupportedAndroid: 'Reminders are not available in the Android app yet.',
      openNote:
        'Reminders show while Platewise is open, or the next time you open it. They work best with the app installed.',
      noneOn: 'Every reminder is off. Switch on the ones you want.',
      breakfast: 'Breakfast',
      lunch: 'Lunch',
      dinner: 'Dinner',
      summary: 'Daily summary',
      summaryHint: 'What you have eaten today against your goal.',
      water: 'Water',
      fastGoal: 'Fasting goal reached',
      fastGoalHint: 'Once, when a running fast reaches its goal.',
      goalReached: 'Goal weight reached',
      goalReachedHint: 'When a weigh-in reaches your goal weight.',
      time: '{name} time',
      saveFailed: "That change wasn't saved. Please try again.",
      unavailable: "Notification settings can't be shown right now. Reload the page to try again.",
    },
  },
} as const satisfies MessageTree;

import type { MessageTree } from '../catalogue';

/**
 * Words of the reminders (src/services/reminders): the title and body of each notice the engine
 * hands to the notifier, as a system notification or an in-app banner. Energy amounts arrive as
 * whole numbers in the person's unit; `{goal}` of the fasting goal is a short length ("16h").
 * Also the banners' own words, the Notifications card of Settings › Tracking & reminders, the
 * Android app's notification channel, and the reminders the person writes (P13).
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
    // The Notifications card of Settings › Tracking & reminders (P09-09).
    settings: {
      heading: 'Notifications',
      master: 'Notifications',
      masterHint: 'Your browser asks for permission the first time.',
      blocked:
        "This browser is blocking notifications from Platewise. Allow them in the browser's site settings, then come back here.",
      unsupported:
        "This browser can't show notifications. Adding Platewise to your home screen may make them available.",
      openNote:
        'Reminders show while Platewise is open, or the next time you open it. They work best with the app installed.',
      // Inside the Android app (P13, D-16.92), where Android shows the notifications.
      masterHintAndroid: 'Android asks for permission the first time.',
      blockedAndroid:
        "Android is blocking notifications from Platewise. Allow them in Android's settings (Apps › Platewise › Notifications), then come back here.",
      openNoteAndroid: 'Reminders arrive as Android notifications, also while Platewise is closed.',
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
    // The "Your reminders" card of Settings › Tracking & reminders and its sheet (P13, D-16.93).
    yours: {
      heading: 'Your reminders',
      empty: 'Write your own reminders: what they say, at what time, and on which days.',
      add: 'Add a reminder',
      full: 'You have 20 reminders, the most Platewise keeps. Delete one to add another.',
      needsNotifications: 'Your reminders show only while Notifications is on.',
      everyDay: 'Every day at {time}',
      onDays: '{days} at {time}',
      once: 'Once, {date} at {time}',
      passed: 'Passed: {date} at {time}',
      edit: 'Edit {text}',
      newTitle: 'New reminder',
      editTitle: 'Edit reminder',
      text: 'What it says',
      textHint: 'Up to 80 characters.',
      time: 'Time',
      repeat: 'Repeats',
      onTheseDays: 'On days',
      onceOnly: 'Once',
      days: 'Days',
      date: 'Date',
      delete: 'Delete reminder',
      deleted: 'Reminder deleted.',
      problems: {
        noText: 'Write what the reminder should say.',
        textTooLong: 'Keep it to 80 characters or fewer.',
        badTime: 'Pick a time.',
        noDays: 'Pick at least one day.',
        badDate: 'Pick a date.',
        daysOrDate: 'Pick days, or a date.',
        past: 'That time has passed. Pick one still ahead.',
        full: 'You already have 20 reminders. Delete one to add another.',
        notFound: 'That reminder is gone. It may have been deleted elsewhere.',
      },
    },
  },
} as const satisfies MessageTree;

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
    // P17, the Android app: the nudges Platewise plans (D-16.100) and the notices it posts at once
    // (D-16.101). `{unit}` is kcal or kJ.
    nudge: {
      breakfast: 'Nothing logged for breakfast yet.',
      lunch: 'Nothing logged for lunch yet.',
      dinner: 'Nothing logged for dinner yet.',
      water: 'Behind on water today.',
      emptyTitle: 'Nothing logged today',
      empty: 'Add what you ate today.',
      weighTitle: 'Time to weigh in',
      weigh: 'A week since your last one.',
    },
    notice: {
      grams: '{eaten} g of {goal} g today.',
      sugarOver: 'Sugar limit passed',
      caloriesOver: 'Over your calorie target',
      calories: '{eaten} of {goal} {unit} today.',
      proteinReached: 'Protein goal reached',
      activeWeek: '150 active minutes',
      activeBody: 'Weekly goal reached. Well done!',
      analysisReady: 'Meal ready to review',
      analysisBody: 'Check it, then add it.',
      backupFailed: 'Backups are failing',
      backupBody: 'Two in a row failed. Tap to see why.',
      // The Coach's (D-16.102): a reply that came while you were away, a check-in it set.
      coachReplied: 'The Coach replied',
      coachCheckIn: 'Coach check-in',
    },
    // Settings › Tracking & reminders › Smart notifications (P17); each kind's label and line also
    // name its Android channel.
    smart: {
      heading: 'Smart notifications',
      mealCheck: 'Meal check',
      mealCheckHint: 'An hour after your usual time.',
      waterPace: 'Water pace',
      waterPaceHint: 'At 13:00, 16:00, 19:00 if behind.',
      emptyDay: 'Empty day',
      emptyDayHint: 'At 20:30 if nothing is logged.',
      weighIn: 'Weigh-in',
      weighInHint: 'At 08:30, a week after the last.',
      sugarOver: 'Sugar limit',
      sugarOverHint: 'When the day passes it.',
      caloriesOver: 'Calories',
      caloriesOverHint: 'When the day passes 110%.',
      proteinReached: 'Protein goal',
      proteinReachedHint: 'When the day reaches it.',
      activeWeek: 'Active week',
      activeWeekHint: 'At 150 active minutes.',
      analysisReady: 'Meal ready',
      analysisReadyHint: 'When a photo is done in the background.',
      backupFailed: 'Backup failed',
      backupFailedHint: 'When two in a row fail.',
      coachReplied: 'Coach replies',
      coachRepliedHint: 'When you are not in that chat.',
      // The Coach's check-ins: their list in Settings and their Android channel (no switch).
      coachCheckIn: 'Check-ins',
      coachCheckInHint: 'From the Coach, even in quiet hours.',
      quiet: 'Quiet hours',
      quietHint: 'None of these 22:00–07:00.',
      onlyIfNotLogged: "Only if I haven't logged it",
      onlyIfNotLoggedHint: 'Meal reminders skip a logged meal.',
    },
    // Home's one-time card and the notification panel (P17, D-16.103).
    card: {
      title: 'Let Platewise nudge you',
      body: 'Allow notifications for timely nudges.',
      turnOn: 'Turn on',
      later: 'Not now',
    },
    inbox: {
      bell: 'Notifications, {count} unread',
      unread: 'Unread',
      today: 'Today',
      yesterday: 'Yesterday',
      earlier: 'Earlier',
      readAll: 'Mark all as read',
      clear: 'Clear all',
      clearAsk: 'Clear all notifications?',
      clearYes: 'Clear',
      delete: 'Delete {title}',
      empty: 'Nothing here yet.',
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
      // In the Android app (P17, D-16.102).
      coachSets: 'Let the Coach set reminders',
      coachSetsHint: 'Off, it proposes them for you to add.',
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

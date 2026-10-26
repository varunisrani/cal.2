import type { MessageTree } from '../catalogue';

/**
 * Words of onboarding (src/features/onboarding): the wizard's frame and its steps from Welcome
 * to Reminders (P05-01..03), and the temporary quick start (P04-09, deleted by P05-07), whose
 * heading is the app's name (`common.appName`).
 */
export const onboarding = {
  onboarding: {
    quickStart: {
      lead: 'Count what you eat with your own AI key. Begin with standard details now and change them any time in Settings.',
      start: 'Start with defaults',
      failed: "That didn't save. Please try again.",
    },
    wizard: {
      continue: 'Continue',
      progress: 'Setup progress',
      progressValue: 'Step {step} of {total}',
      // Steps 10–12 until the AI setup slice fills them.
      pending: {
        aiAccess: 'Connect your AI',
        buildingPlan: 'Building your plan',
        planReady: 'Your plan',
      },
      units: {
        kg: 'kg',
        lb: 'lb',
        cm: 'cm',
        ft: 'ft',
        in: 'in',
        percent: '%',
      },
      weight: {
        wholeKg: 'Whole kilograms',
        wholeLb: 'Whole pounds',
        tenths: 'Tenths',
        shownKg: '{value} kg',
        shownLb: '{value} lb',
      },
    },
    welcome: {
      headlineTop: 'Know your plate.',
      headlineBottom: 'Reach your numbers.',
      lead: 'A food diary that does the counting with an AI you choose.',
      tourLabel: 'What Platewise does',
      tour: {
        photo: 'Photograph a meal and get its calories and macros',
        coach: 'Ask the Coach about your own diary',
        key: 'Use your own AI key from the provider you like',
        device: 'Everything stays in this browser on this device',
      },
      start: 'Get started',
      restore: 'Restore from a backup file',
    },
    sex: {
      title: 'Which body should we plan for?',
      subtitle: 'Resting energy use differs a little between bodies.',
      label: 'Sex',
      male: 'Male',
      female: 'Female',
      other: 'Other',
    },
    birthday: {
      title: 'When is your birthday?',
      subtitle: 'Energy needs change with age.',
      label: 'Date of birth',
      age: '{age, plural, one {That makes you # year old.} other {That makes you # years old.}}',
    },
    body: {
      title: 'Height and weight',
      subtitle: 'These two set the size of your daily energy budget.',
      units: 'Units',
      metric: 'Metric',
      imperial: 'Imperial',
      height: 'Height',
      weight: 'Weight',
      centimetres: 'Centimetres',
      feet: 'Feet',
      inches: 'Inches',
    },
    bodyFat: {
      title: 'Do you know your body fat?',
      subtitle: 'If you do, the plan can start from your lean mass.',
      label: 'Body fat known',
      yes: 'Yes, I know it',
      no: 'No',
      wheel: 'Body fat percentage',
      ranges:
        'As a rough guide, many men measure 10–25 % and many women 18–35 %. A scan or calipers give the best number.',
      goalSwitch: 'Add a body fat goal',
      goalDescription: 'Optional. It shows on your progress chart and does not change the plan.',
      goalWheel: 'Goal body fat percentage',
      formulaNote:
        'That is fine. Your plan will use a standard formula built on height, weight, age and sex.',
    },
    activity: {
      title: 'How active is a normal week?',
      subtitle: 'Count work, getting around and exercise together.',
      label: 'Activity level',
      levels: {
        sedentary: {
          name: 'Mostly seated',
          about: 'Desk days and very little planned exercise.',
        },
        light: {
          name: 'Lightly active',
          about: 'Walks and easy workouts on one to three days.',
        },
        moderate: {
          name: 'Moderately active',
          about: 'Training or sport on three to five days.',
        },
        active: {
          name: 'Active',
          about: 'Training on most days, or a job spent on your feet.',
        },
        hard: {
          name: 'Very active',
          about: 'Hard sessions six or seven days a week, or heavy physical work.',
        },
        athlete: {
          name: 'Athlete',
          about: 'Two sessions a day, or manual work plus regular training.',
        },
      },
      stepsBelow: 'Under {below} steps a day',
      stepsBetween: '{from} to {to} steps a day',
      stepsFrom: '{from} or more steps a day',
    },
    goal: {
      title: 'What do you want your weight to do?',
      subtitle: 'You can switch goals later in Settings.',
      label: 'Goal',
      lose: 'Lose weight',
      maintain: 'Keep my weight',
      gain: 'Gain weight',
    },
    target: {
      title: 'Where do you want to get to?',
      label: 'Target weight',
      current: 'You weigh {weight} now.',
      notBelowCurrent: 'To lose weight, pick a target below {weight}.',
      notAboveCurrent: 'To gain weight, pick a target above {weight}.',
    },
    pace: {
      title: 'Choose your pace',
      maintainTitle: 'Your pace',
      loseSubtitle: 'How much to lose in a week',
      gainSubtitle: 'How much to gain in a week',
      maintainSubtitle: 'There is no pace to pick when you keep your weight.',
      maintainDone: 'Steady it is',
      maintainBody: 'Your plan keeps calories level so your weight holds where it is.',
      perWeek: 'a week',
      label: 'Pace',
      slow: 'Slow',
      steady: 'Steady',
      fast: 'Fast',
      slowNote: 'Small daily changes that are easy to live with.',
      steadyNote: 'Our pick: clear progress without a harsh budget.',
      fastNote: 'Quicker results, with a much tighter daily budget.',
      daysTitle: 'Time to your target',
      days: '{days, plural, one {About # day} other {About # days}}',
    },
    reminders: {
      title: 'Want a nudge at mealtimes?',
      body: 'Platewise can remind you around breakfast, lunch and dinner, so meals get logged while you still remember them. You choose the times in Settings.',
      ask: 'Turn on reminders',
      granted: 'Reminders are on. You can change their times in Settings.',
      denied:
        'This browser is blocking notifications for Platewise. To get reminders later, allow notifications in the site settings of your browser, then switch reminders on in Settings.',
      dismissed: 'Reminders stay off for now. You can switch them on later in Settings.',
      unsupported:
        'This browser cannot show notifications, so reminders stay off. Adding Platewise to your home screen may help.',
      skip: 'Not now? Continue, and nothing is switched on.',
    },
  },
} as const satisfies MessageTree;

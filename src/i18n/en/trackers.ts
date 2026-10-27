import type { MessageTree } from '../catalogue';

/**
 * Words of the trackers (src/features/water) and of Settings › Tracking & reminders
 * (src/features/settings/tracking): the + menu's water page, the custom amount sheet, the water
 * settings, the goal wheel and the quick-add editor; the meal times card and its editor. An
 * amount with its unit word ("250 ml") and the unit words alone come from `home.amount` and
 * `home.unit`; fasting has its own partition, the Notifications card the reminders partition.
 */
export const trackers = {
  trackers: {
    page: {
      title: 'Tracking & reminders',
    },
    // The meal times card and its editor (P09-03).
    mealTimes: {
      heading: 'Meals',
      row: 'Meal times',
      note: 'They pick the meal a new entry goes under. You can still change it when you log.',
      title: 'Meal times',
      starts: {
        breakfast: 'Breakfast begins',
        lunch: 'Lunch begins',
        dinner: 'Dinner begins',
        lateSnack: 'Late snack begins',
      },
      help: 'Each meal starts at least 15 minutes after the one before. The late snack runs past midnight until breakfast.',
      restore: 'Restore default times',
      saveFailed: "Your meal times weren't saved. Please try again.",
      unavailable: "Meal times can't be shown right now. Reload the page to try again.",
    },
    water: {
      heading: 'Water',
      menu: {
        custom: 'Custom amount',
        logged: '{amount} of water logged',
        logFailed: "That water wasn't logged. Please try again.",
        unavailable: "Your water amounts can't be read right now.",
      },
      custom: {
        title: 'Add water',
        field: 'Amount',
        tooMuch: 'The most you can add at once is {max}.',
      },
      settings: {
        tracking: 'Water tracking',
        trackingHint: 'Adds a water pillar on Home and Water to the + menu.',
        goal: 'Daily goal',
        unit: 'Unit',
        quickAdd: 'Quick-add amounts',
        summary: {
          ml: '{amounts} ml',
          flOz: '{amounts} fl oz',
        },
        saveFailed: "That change wasn't saved. Please try again.",
        unavailable: "Water settings can't be shown right now. Reload the page to try again.",
      },
      unitChoice: {
        ml: 'Millilitres (ml)',
        flOz: 'US fluid ounces (fl oz)',
      },
      goal: {
        title: 'Daily water goal',
      },
      quickAdd: {
        title: 'Quick-add amounts',
        field: 'Amount {number}',
        invalid: 'Enter more than 0, up to {max}.',
        note: 'Each amount logs with one tap from the + menu. They are kept smallest first.',
        reset: 'Use the default amounts',
      },
    },
  },
} as const satisfies MessageTree;

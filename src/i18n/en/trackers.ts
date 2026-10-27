import type { MessageTree } from '../catalogue';

/**
 * Words of the trackers (src/features/water) and of Settings › Tracking & reminders
 * (src/features/settings/tracking): the + menu's water page, the custom amount sheet, the water
 * settings, the goal wheel and the quick-add editor. An amount with its unit word ("250 ml") and
 * the unit words alone come from `home.amount` and `home.unit`; fasting has its own partition.
 */
export const trackers = {
  trackers: {
    page: {
      title: 'Tracking & reminders',
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

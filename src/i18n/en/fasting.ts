import type { MessageTree } from '../catalogue';

/**
 * Words of fasting (src/features/fasting): the start sheet, the fast editor, the fasting card on
 * Settings › Tracking & reminders and its goal wheel, and the paused dialog every food path shows
 * while a fast runs. The page title comes from `trackers.page`.
 */
export const fasting = {
  fasting: {
    hours: '{hours, plural, one {# hour} other {# hours}}',
    hoursUnit: 'hours',
    start: {
      title: 'Start fast',
      goal: 'Goal',
      prompt: 'How long do you plan to fast?',
      note: 'The fast starts now. You can change its start time later.',
      start: 'Start',
      running: 'A fast is already running. End it before starting another.',
      overlap: 'A fast you logged ends after now, so a new one cannot start yet.',
      failed: "The fast didn't start. Please try again.",
    },
    editor: {
      titleActive: 'Active fast',
      titleDone: 'Edit fast',
      started: 'Started',
      ended: 'Ended',
      goal: 'Goal',
      endNow: 'End fast now',
      cancelFast: 'Cancel fast',
      deleteFast: 'Delete fast',
      overlap: {
        title: 'Overlaps another fast',
        message: 'Move the start or the end so this fast shares no time with another one.',
        ok: 'OK',
      },
      gone: 'This fast was changed somewhere else, so nothing was saved.',
      failed: "That change wasn't saved. Please try again.",
    },
    settings: {
      heading: 'Fasting',
      tracking: 'Fasting tracking',
      trackingHint: 'Adds Start fast to the + menu. Food logging pauses while a fast runs.',
      goal: 'Default goal',
      ended: 'Fasting is off. The fast in progress was ended and kept in your diary.',
      saveFailed: "That change wasn't saved. Please try again.",
      unavailable: "Fasting settings can't be shown right now. Reload the page to try again.",
    },
    goal: {
      title: 'Default fasting goal',
    },
    paused: {
      title: 'Food logging is paused',
      message: 'A fast is running. End it now to log this food, or keep fasting.',
      endAndLog: 'End fast and log',
      failed: 'Nothing was logged and the fast is still running. Please try again.',
    },
  },
} as const satisfies MessageTree;

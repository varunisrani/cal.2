import type { MessageTree } from '../catalogue';

/**
 * Words of reusing food (src/features/log/reuse, P06-12): the Recent, Often eaten and Saved
 * sheets, their search, empty states and rows. Then copying a day (CopyDaySheet, P06-13). The add
 * menu's own labels for these methods are in `menu`.
 */
export const reuse = {
  reuse: {
    title: {
      recent: 'Recent',
      often: 'Often eaten',
      saved: 'Saved',
    },
    search: 'Search by name',
    empty: {
      recent: 'Nothing logged in the last 30 days.',
      often: 'Nothing logged in the last 90 days.',
      saved: 'No saved meals yet. Save a meal from its entry to keep it here.',
      noMatch: 'Nothing matches “{query}”.',
    },
    row: {
      saved: 'Saved',
      eaten: '{count}× eaten',
      protein: 'P {amount} g',
      carbs: 'C {amount} g',
      fat: 'F {amount} g',
      moveUp: 'Move {name} up',
      moveDown: 'Move {name} down',
      remove: 'Remove {name}',
    },
    loadFailed: "This list can't be shown right now. Close it and try again.",
    openFailed: "That food couldn't be opened for review. Please try again.",
    changeFailed: "That change didn't save. Please try again.",
    copyDay: {
      title: 'Copy a day',
      from: 'Copy from',
      toToday: 'Foods are copied to today. The originals stay as they are.',
      toDay: 'Foods are copied to {day}. The originals stay as they are.',
      empty: 'Nothing was logged on this day.',
      all: 'Copy {count, plural, one {# food} other {# foods}}',
      meal: 'Copy {meal}',
      loadFailed: "This day can't be shown right now.",
      failed: "These foods weren't copied. Please try again.",
      paused: {
        title: 'Logging is paused',
        message:
          'A fast is running, so nothing was copied. Food can be logged again once the fast ends.',
        ok: 'OK',
      },
    },
  },
} as const satisfies MessageTree;

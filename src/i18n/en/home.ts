import type { MessageTree } from '../catalogue';

/**
 * Words of Home (src/features/home): the week bar, the energy gauge, the pillars, the diary and
 * its rows, and the add button. Meal names are logging words, in `log.meal`.
 */
export const home = {
  home: {
    loadFailed: "This day's diary can't be shown right now. Reload the page to try again.",
    week: {
      label: 'Choose a day',
    },
    unit: {
      kcal: 'kcal',
      kJ: 'kJ',
      g: 'g',
    },
    energy: {
      kcal: '{amount} kcal',
      kJ: '{amount} kJ',
    },
    gauge: {
      heading: {
        kcal: 'Calories',
        kJ: 'Kilojoules',
      },
      noGoal: 'No goal set',
      left: '{amount} left',
      over: '{amount} over',
      reached: 'Goal reached',
    },
    pillar: {
      protein: 'Protein',
      carbs: 'Carbs',
      fat: 'Fat',
      fibre: 'Fibre',
      noGoal: 'No goal',
      left: '{amount} g left',
      over: '{amount} g over',
      reached: 'Goal reached',
    },
    diary: {
      today: 'Today',
      day: 'Diary',
      empty: 'Nothing logged yet. Tap + to add what you ate.',
      totals: 'P {protein} g · C {carbs} g · F {fat} g',
    },
    entry: {
      macros: 'P {protein} · C {carbs} · F {fat}',
      deleteLabel: 'Delete {name}',
      deleteTitle: 'Delete this entry?',
      deleteMessage: '{name} will be removed from your diary.',
      deleteFailed: "That entry couldn't be deleted. Please try again.",
    },
    add: {
      label: 'Add food',
    },
  },
} as const satisfies MessageTree;

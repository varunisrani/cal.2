import type { MessageTree } from '../catalogue';

/**
 * Words of logging food (src/features/log): the meal names every screen shares and, for now, the
 * manual entry sheet (P04-11). P06 adds the other logging flows.
 */
export const log = {
  log: {
    meal: {
      breakfast: 'Breakfast',
      lunch: 'Lunch',
      dinner: 'Dinner',
      snack: 'Snack',
      other: 'Other',
    },
    manual: {
      title: 'Enter manually',
      name: 'Name',
      namePlaceholder: 'What you ate',
      energy: {
        kcal: 'Calories',
        kJ: 'Kilojoules',
      },
      protein: 'Protein',
      carbs: 'Carbs',
      fat: 'Fat',
      fibre: 'Fibre',
      fibreHint: 'Leave it empty if you are not sure.',
      meal: 'Meal',
      mealPicker: 'Choose a meal',
      wholeNumber: 'Enter a whole number, like 250.',
      number: 'Enter a number of 0 or more, or leave it empty.',
      paused: 'Fast in progress: food can be logged once it ends.',
      failed: "That didn't save. Please try again.",
    },
  },
} as const satisfies MessageTree;

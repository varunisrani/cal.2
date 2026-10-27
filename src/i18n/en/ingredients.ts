import type { MessageTree } from '../catalogue';

/**
 * Words of the ingredients card on the review (src/features/log/review): the parts list, the
 * add-ingredient menu and its describe sheet, the part editor and the recipe split. Unit words
 * (g, kcal, kJ) come from the review partition; a barcode lookup's busy line and its other
 * failures use the scanner's words (scan partition).
 */
export const ingredients = {
  ingredients: {
    heading: 'Ingredients',
    empty: 'No separate ingredients yet.',
    amount: '{grams} {gramUnit} · {energy} {energyUnit}',
    energy: '{energy} {energyUnit}',
    macro: {
      protein: 'P {grams} {unit}',
      carbs: 'C {grams} {unit}',
      fat: 'F {grams} {unit}',
    },
    add: {
      label: 'Add ingredient',
      camera: 'Camera',
      library: 'Photo',
      barcode: 'Barcode',
      describe: 'Describe',
      manual: 'Manual',
      recent: 'Recent',
      often: 'Often eaten',
      saved: 'Saved',
    },
    busy: 'Working out the ingredient…',
    dismiss: 'Dismiss',
    refused: {
      tooLarge: 'That photo is larger than 25 MB. Pick a smaller one.',
      unreadable: "That photo couldn't be read. Try another one.",
    },
    keyRefused:
      "Open Food Facts doesn't know this product, and FoodData Central refused your API key. Check the key in settings.",
    describe: {
      title: 'Describe an ingredient',
      label: 'What is it, and about how much?',
      placeholder: 'A tablespoon of olive oil',
      analyse: 'Analyse',
    },
    editor: {
      add: 'Add ingredient',
      edit: 'Edit ingredient',
      name: 'Name',
      weight: 'Weight',
      energy: {
        kcal: 'Calories',
        kJ: 'Kilojoules',
      },
      protein: 'Protein',
      carbs: 'Carbs',
      fat: 'Fat',
      remove: 'Remove ingredient',
    },
    split: {
      label: 'Servings in recipe',
      note: 'Set this once every ingredient is in. The amount then shows one serving of the dish.',
    },
  },
} as const satisfies MessageTree;

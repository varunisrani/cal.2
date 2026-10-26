// The nutrients beyond kcal and the three macros: the 23 optional nutrients and the 8 sports
// compounds ("extras"), with the unit each is stored in, the group it is listed under, whether it
// can carry a daily goal, and which of them a Home pillar may show. Keys and numbers only: labels
// and unit words come from the UI catalogue.

import {
  EXTRA_KEYS,
  MACRO_KEYS,
  isExtraKey,
  isMacroKey,
  isNutrientKey,
  type ExtraKey,
  type MacroKey,
  type NutrientKey,
} from '../model';

export const NUTRIENT_UNITS = ['g', 'mg', 'mcg'] as const;
/** The unit an amount is stored and shown in. */
export type NutrientUnit = (typeof NUTRIENT_UNITS)[number];

export const NUTRIENT_GROUPS = ['sugarsAndFats', 'minerals', 'vitamins', 'sports'] as const;
/** The heading a nutrient is listed under in the goals editor and the day's nutrient sheet. */
export type NutrientGroup = (typeof NUTRIENT_GROUPS)[number];

/** An optional nutrient or a sports compound. */
export type CatalogueKey = NutrientKey | ExtraKey;

/** The two optional nutrients that are shown but never get a goal. */
const WITHOUT_GOAL = ['monounsaturatedFat', 'polyunsaturatedFat'] as const;

/** An optional nutrient that can carry a goal (21 of the 23). */
export type GoalNutrientKey = Exclude<NutrientKey, (typeof WITHOUT_GOAL)[number]>;
/** Everything with an optional daily goal: 21 nutrients and the 8 compounds. */
export type GoalKey = GoalNutrientKey | ExtraKey;
/** Everything a Home pillar may show: the three macros and the 29 goal keys. */
export type PillarKey = MacroKey | GoalKey;

const NUTRIENT_UNIT: Readonly<Record<NutrientKey, NutrientUnit>> = {
  addedSugar: 'g',
  fibre: 'g',
  monounsaturatedFat: 'g',
  omega3: 'g',
  polyunsaturatedFat: 'g',
  saturatedFat: 'g',
  sugar: 'g',
  transFat: 'g',
  caffeine: 'mg',
  calcium: 'mg',
  cholesterol: 'mg',
  iron: 'mg',
  magnesium: 'mg',
  potassium: 'mg',
  sodium: 'mg',
  vitaminC: 'mg',
  vitaminE: 'mg',
  zinc: 'mg',
  folate: 'mcg',
  vitaminA: 'mcg',
  vitaminB12: 'mcg',
  vitaminD: 'mcg',
  vitaminK: 'mcg',
};

/** Groups in display order, each with its keys in display order. Extras form the last group. */
const GROUPED: Readonly<Record<NutrientGroup, readonly CatalogueKey[]>> = {
  sugarsAndFats: [
    'fibre',
    'sugar',
    'addedSugar',
    'saturatedFat',
    'transFat',
    'monounsaturatedFat',
    'polyunsaturatedFat',
    'omega3',
    'cholesterol',
    'caffeine',
  ],
  minerals: ['sodium', 'potassium', 'calcium', 'magnesium', 'iron', 'zinc'],
  vitamins: ['vitaminA', 'vitaminC', 'vitaminD', 'vitaminE', 'vitaminK', 'vitaminB12', 'folate'],
  sports: EXTRA_KEYS,
};

/** The 31 optional nutrients and compounds in display order, group by group. */
export const CATALOGUE_KEYS: readonly CatalogueKey[] = Object.freeze(
  NUTRIENT_GROUPS.flatMap((group) => GROUPED[group]),
);

// Filled from GROUPED; the catalogue test checks that every key has a group.
const GROUP_OF = {} as Record<CatalogueKey, NutrientGroup>;
for (const group of NUTRIENT_GROUPS) {
  for (const key of GROUPED[group]) GROUP_OF[key] = group;
}

export function isCatalogueKey(value: unknown): value is CatalogueKey {
  return isNutrientKey(value) || isExtraKey(value);
}

/** True for the 29 keys that can carry a goal (mono- and poly-unsaturated fat cannot). */
export function isGoalKey(value: unknown): value is GoalKey {
  return isCatalogueKey(value) && !(WITHOUT_GOAL as readonly string[]).includes(value);
}

/** The 29 goal keys in display order. */
export const GOAL_KEYS: readonly GoalKey[] = Object.freeze(CATALOGUE_KEYS.filter(isGoalKey));

/** The 32 pillar choices in picker order: the macros, then the goal keys. */
export const PILLAR_KEYS: readonly PillarKey[] = Object.freeze([...MACRO_KEYS, ...GOAL_KEYS]);

export function isPillarKey(value: unknown): value is PillarKey {
  return isMacroKey(value) || isGoalKey(value);
}

/** The storage unit of a nutrient, compound or macro (macros and compounds are grams). */
export function unitOf(key: CatalogueKey | MacroKey): NutrientUnit {
  return isNutrientKey(key) ? NUTRIENT_UNIT[key] : 'g';
}

/** The group a nutrient or compound is listed under. */
export function groupOf(key: CatalogueKey): NutrientGroup {
  return GROUP_OF[key];
}

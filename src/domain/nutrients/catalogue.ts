// The nutrient catalogue: every id a screen can label (`nutrient.<id>` in the UI catalogue), the
// unit its amounts are stored in, which ones carry a daily goal and which ones Home may show as a
// pillar. Display names, short names and unit words are UI copy and live with the screens.

import {
  EXTRA_KEYS,
  isExtraKey,
  isMacroKey,
  isNutrientKey,
  MACRO_KEYS,
  NUTRIENT_KEYS,
  type ExtraKey,
  type MacroKey,
  type NutrientKey,
} from '../model';

export const MASS_UNITS = ['g', 'mg', 'mcg'] as const;
/** The unit an amount is stored in: grams, milligrams or micrograms. */
export type MassUnit = (typeof MASS_UNITS)[number];

/** Storage unit of each optional nutrient. */
export const NUTRIENT_UNITS: Readonly<Record<NutrientKey, MassUnit>> = {
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

/** Every sports compound is stored in grams. */
export const EXTRA_UNIT: MassUnit = 'g';

/** Every id with a label: the three macros, the 23 optional nutrients and the 8 extras. */
export type CatalogueId = MacroKey | NutrientKey | ExtraKey;
export const CATALOGUE_IDS: readonly CatalogueId[] = [
  ...MACRO_KEYS,
  ...NUTRIENT_KEYS,
  ...EXTRA_KEYS,
];

export type CatalogueGroup = 'macro' | 'nutrient' | 'extra';

/** Which list an id comes from. */
export function catalogueGroupOf(id: CatalogueId): CatalogueGroup {
  if (isMacroKey(id)) return 'macro';
  if (isExtraKey(id)) return 'extra';
  return 'nutrient';
}

/** The unit an id's amounts are stored in. Macros and extras are grams. */
export function unitOf(id: CatalogueId): MassUnit {
  return isNutrientKey(id) ? NUTRIENT_UNITS[id] : 'g';
}

// ---- Goals and pillars --------------------------------------------------------------------

/** Optional nutrients that are tracked and shown but never get a goal. */
export const GOALLESS_NUTRIENTS = ['monounsaturatedFat', 'polyunsaturatedFat'] as const;
type GoallessNutrient = (typeof GOALLESS_NUTRIENTS)[number];

/** The 21 optional nutrients that carry a daily goal. */
export type GoalNutrientKey = Exclude<NutrientKey, GoallessNutrient>;
const GOALLESS = new Set<string>(GOALLESS_NUTRIENTS);
export const GOAL_NUTRIENT_KEYS: readonly GoalNutrientKey[] = NUTRIENT_KEYS.filter(
  (key): key is GoalNutrientKey => !GOALLESS.has(key),
);

/** The 29 optional goals: the goal-bearing nutrients, then the extras. */
export type GoalKey = GoalNutrientKey | ExtraKey;
export const GOAL_KEYS: readonly GoalKey[] = [...GOAL_NUTRIENT_KEYS, ...EXTRA_KEYS];

/** The 32 nutrients Home may show as a pillar: the macros, then the 29 goal keys. */
export type PillarKey = MacroKey | GoalKey;
export const PILLAR_KEYS: readonly PillarKey[] = [...MACRO_KEYS, ...GOAL_KEYS];

const GOAL_SET = new Set<string>(GOAL_KEYS);
const PILLAR_SET = new Set<string>(PILLAR_KEYS);

export function isGoalKey(value: unknown): value is GoalKey {
  return typeof value === 'string' && GOAL_SET.has(value);
}

export function isPillarKey(value: unknown): value is PillarKey {
  return typeof value === 'string' && PILLAR_SET.has(value);
}

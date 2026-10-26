// Daily goals for the 29 optional nutrients and sports compounds: the value a person starts with,
// whether it is a limit to stay under or a target to reach, the picker wheel, and the rules for
// values typed by hand. Wheels use the Android ranges and steps (D-16.57). A goal is any number
// in 0–999 999; it is clamped there and never moved onto a wheel step, so a typed 95 mg of
// vitamin C stays 95.

import { clamp, type StepRange } from '../units/numbers';
import { GOAL_KEYS, type GoalKey } from './catalogue';

export const NUTRIENT_GOAL_KINDS = ['limit', 'target'] as const;
/** A limit is a ceiling to stay under; a target is an amount to reach. */
export type NutrientGoalKind = (typeof NUTRIENT_GOAL_KINDS)[number];

export interface NutrientGoalRule {
  /** The goal before the person or the AI changes it, in the key's storage unit. */
  readonly start: number;
  readonly kind: NutrientGoalKind;
  /** The picker wheel in the key's storage unit. */
  readonly wheel: Readonly<StepRange>;
  /** General adult upper intake; a goal above it gets a non-blocking hint. */
  readonly upperLimit?: number;
}

const limit = (start: number, max: number, step: number): NutrientGoalRule => ({
  start,
  kind: 'limit',
  wheel: { min: 0, max, step },
});

const target = (
  start: number,
  min: number,
  max: number,
  step: number,
  upperLimit?: number,
): NutrientGoalRule => ({
  start,
  kind: 'target',
  wheel: { min, max, step },
  ...(upperLimit === undefined ? {} : { upperLimit }),
});

const SPORTS_COMPOUND = target(0, 0, 50, 1);

export const NUTRIENT_GOAL_RULES: Readonly<Record<GoalKey, NutrientGoalRule>> = {
  // grams
  fibre: target(30, 0, 100, 1),
  sugar: limit(50, 200, 5),
  addedSugar: limit(25, 100, 5),
  saturatedFat: limit(20, 80, 1),
  transFat: limit(0, 10, 1),
  omega3: target(2, 0, 10, 1),
  // milligrams
  cholesterol: limit(300, 1_000, 25),
  caffeine: limit(400, 1_000, 25),
  sodium: limit(2_300, 5_000, 50),
  potassium: target(3_500, 0, 7_000, 50),
  calcium: target(1_000, 300, 2_000, 50, 2_500),
  magnesium: target(400, 100, 800, 25),
  iron: target(18, 5, 45, 1, 45),
  zinc: target(11, 3, 40, 1, 40),
  vitaminC: target(90, 20, 500, 10, 2_000),
  vitaminE: target(15, 5, 100, 1, 1_000),
  // micrograms
  vitaminA: target(900, 300, 3_000, 50, 3_000),
  vitaminD: target(20, 5, 100, 1, 100),
  vitaminK: target(120, 30, 300, 10),
  vitaminB12: target(3, 1, 20, 1),
  folate: target(400, 100, 1_000, 50, 1_000),
  // sports compounds, grams
  arginine: SPORTS_COMPOUND,
  betaAlanine: SPORTS_COMPOUND,
  betaine: SPORTS_COMPOUND,
  carnitine: SPORTS_COMPOUND,
  citrulline: SPORTS_COMPOUND,
  creatine: SPORTS_COMPOUND,
  hmb: SPORTS_COMPOUND,
  taurine: SPORTS_COMPOUND,
};

/** One goal per goal key, each in the key's storage unit. */
export type NutrientGoals = Readonly<Record<GoalKey, number>>;

function goalsFrom(valueOf: (key: GoalKey) => number): NutrientGoals {
  const goals = {} as Record<GoalKey, number>;
  for (const key of GOAL_KEYS) goals[key] = valueOf(key);
  return Object.freeze(goals);
}

export const DEFAULT_NUTRIENT_GOALS: NutrientGoals = goalsFrom(
  (key) => NUTRIENT_GOAL_RULES[key].start,
);

/** The highest goal anyone can store. */
export const MAX_NUTRIENT_GOAL = 999_999;
/** How many digits a typed goal may have. */
export const GOAL_TEXT_MAX_DIGITS = 7;

/** Keeps a goal inside 0–999 999 without rounding it (NaN counts as 0). */
export function clampNutrientGoal(value: number): number {
  return Number.isNaN(value) ? 0 : clamp(value, 0, MAX_NUTRIENT_GOAL);
}

/** A copy of `goals` with `key` set to `value`, clamped and never snapped to the wheel. */
export function setNutrientGoal(goals: NutrientGoals, key: GoalKey, value: number): NutrientGoals {
  return goalsFrom((each) => (each === key ? clampNutrientGoal(value) : goals[each]));
}

/**
 * Reads the stored goals record. A key that is missing or not a finite number gets its starting
 * value; any other value is clamped. Anything but a plain object gives every starting value.
 */
export function readNutrientGoals(raw: unknown): NutrientGoals {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return DEFAULT_NUTRIENT_GOALS;
  const stored = raw as Partial<Record<string, unknown>>;
  return goalsFrom((key) => {
    const value = stored[key];
    return typeof value === 'number' && Number.isFinite(value)
      ? clampNutrientGoal(value)
      : DEFAULT_NUTRIENT_GOALS[key];
  });
}

// ---- Picker ------------------------------------------------------------------------------------

/** Every value on the key's wheel, smallest first. */
export function goalWheelValues(key: GoalKey): number[] {
  const { min, max, step } = NUTRIENT_GOAL_RULES[key].wheel;
  const values: number[] = [];
  for (let value = min; value <= max; value += step) values.push(value);
  return values;
}

/**
 * True when the wheel can show `value`. The picker opens in typing mode for any other value, so
 * opening it never changes a goal.
 */
export function isOnGoalWheel(key: GoalKey, value: number): boolean {
  const { min, max, step } = NUTRIENT_GOAL_RULES[key].wheel;
  return value >= min && value <= max && Number.isInteger((value - min) / step);
}

/** What the typing field keeps of typed text: ASCII digits only, at most 7 of them. */
export function filterGoalText(text: string): string {
  return text.replace(/[^0-9]/g, '').slice(0, GOAL_TEXT_MAX_DIGITS);
}

/** The goal for typed text of 1–7 digits, clamped to 999 999; null for anything else. */
export function parseGoalText(text: string): number | null {
  if (!new RegExp(`^[0-9]{1,${GOAL_TEXT_MAX_DIGITS}}$`).test(text)) return null;
  return clampNutrientGoal(Number(text));
}

/** The general adult upper intake when `value` is above it (for the hint), else null. */
export function upperLimitExceeded(key: GoalKey, value: number): number | null {
  const { upperLimit } = NUTRIENT_GOAL_RULES[key];
  return upperLimit !== undefined && value > upperLimit ? upperLimit : null;
}

/** International units of vitamin D per microgram. */
export const VITAMIN_D_IU_PER_MCG = 40;

/** Vitamin D in IU for an amount in micrograms (20 mcg → 800 IU). */
export function vitaminDIu(mcg: number): number {
  return mcg * VITAMIN_D_IU_PER_MCG;
}

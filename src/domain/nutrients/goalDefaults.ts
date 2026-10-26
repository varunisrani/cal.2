// Daily goals for the 29 optional nutrients and extras (setting `goals.nutrients`). Each goal has
// a default, a kind, a wheel for the picker (the Android ranges, D-16.57) and sometimes a general
// adult upper limit the picker mentions without blocking. Besides the wheel a person may type any
// whole number of up to 7 digits. A stored goal is only ever clamped to 0–999 999: it is never
// moved onto the wheel's grid, so 17 mg of vitamin C stays 17 and 7.3 stays 7.3.

import { clamp, type WheelRange } from '../units/numbers';
import { EXTRA_KEYS, type ExtraKey } from '../model';
import { GOAL_KEYS, type GoalKey, type GoalNutrientKey } from './catalogue';

/** A limit is a ceiling to stay under; a target is an amount to reach. */
export type NutrientGoalKind = 'limit' | 'target';

export interface GoalSpec {
  readonly defaultValue: number;
  readonly kind: NutrientGoalKind;
  /** The picker wheel, in the nutrient's storage unit. */
  readonly wheel: WheelRange;
  /** A general adult upper limit; above it the picker shows a non-blocking hint. */
  readonly upperHint?: number;
}

function spec(
  defaultValue: number,
  kind: NutrientGoalKind,
  [min, max, step]: readonly [number, number, number],
  upperHint?: number,
): GoalSpec {
  const wheel = { min, max, step };
  return upperHint === undefined
    ? { defaultValue, kind, wheel }
    : { defaultValue, kind, wheel, upperHint };
}

const NUTRIENT_SPECS: Readonly<Record<GoalNutrientKey, GoalSpec>> = {
  // grams
  addedSugar: spec(25, 'limit', [0, 100, 5]),
  fibre: spec(30, 'target', [0, 100, 1]),
  omega3: spec(2, 'target', [0, 10, 1]),
  saturatedFat: spec(20, 'limit', [0, 80, 1]),
  sugar: spec(50, 'limit', [0, 200, 5]),
  transFat: spec(0, 'limit', [0, 10, 1]),
  // milligrams
  caffeine: spec(400, 'limit', [0, 1_000, 25]),
  calcium: spec(1_000, 'target', [300, 2_000, 50], 2_500),
  cholesterol: spec(300, 'limit', [0, 1_000, 25]),
  iron: spec(18, 'target', [5, 45, 1], 45),
  magnesium: spec(400, 'target', [100, 800, 25]),
  potassium: spec(3_500, 'target', [0, 7_000, 50]),
  sodium: spec(2_300, 'limit', [0, 5_000, 50]),
  vitaminC: spec(90, 'target', [20, 500, 10], 2_000),
  vitaminE: spec(15, 'target', [5, 100, 1], 1_000),
  zinc: spec(11, 'target', [3, 40, 1], 40),
  // micrograms
  folate: spec(400, 'target', [100, 1_000, 50], 1_000),
  vitaminA: spec(900, 'target', [300, 3_000, 50], 3_000),
  vitaminB12: spec(3, 'target', [1, 20, 1]),
  vitaminD: spec(20, 'target', [5, 100, 1], 100),
  vitaminK: spec(120, 'target', [30, 300, 10]),
};

/** Sports compounds start at 0 g (no goal) and are picked on a 0–50 g wheel. */
const EXTRA_SPEC = spec(0, 'target', [0, 50, 1]);

export const GOAL_SPECS: Readonly<Record<GoalKey, GoalSpec>> = {
  ...NUTRIENT_SPECS,
  ...(Object.fromEntries(EXTRA_KEYS.map((key) => [key, EXTRA_SPEC])) as Record<ExtraKey, GoalSpec>),
};

/** One goal per key, in the key's storage unit. */
export type GoalValues = Record<GoalKey, number>;

function defaultGoalValues(): GoalValues {
  return Object.fromEntries(
    GOAL_KEYS.map((key) => [key, GOAL_SPECS[key].defaultValue]),
  ) as GoalValues;
}

export const DEFAULT_GOAL_VALUES: Readonly<GoalValues> = Object.freeze(defaultGoalValues());

// ---- Custom values ------------------------------------------------------------------------

/** The largest goal that can be stored. */
export const GOAL_VALUE_MAX = 999_999;
/** A typed goal holds at most this many digits. */
export const GOAL_TEXT_MAX_DIGITS = 7;

/** A goal as stored: inside 0–999 999, fractions kept, never snapped to the wheel. NaN is 0. */
export function clampGoalValue(value: number): number {
  return clamp(value, 0, GOAL_VALUE_MAX);
}

/** The typed field after a keystroke: ASCII digits only, at most 7 of them. */
export function filterGoalText(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, GOAL_TEXT_MAX_DIGITS);
}

/** The goal a typed field holds, clamped; null when it is empty or not all digits. */
export function goalFromText(text: string): number | null {
  const digits = text.trim();
  if (!/^\d+$/.test(digits)) return null;
  return clampGoalValue(Number(digits));
}

/**
 * Reads the stored goals. Anything that is not a record reads as all defaults; inside a record,
 * a key that is missing or not a finite number reads as its default, and every number is clamped.
 */
export function decodeGoalValues(stored: unknown): GoalValues {
  const goals = defaultGoalValues();
  if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) return goals;
  const record = stored as Record<string, unknown>;
  for (const key of GOAL_KEYS) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) goals[key] = clampGoalValue(value);
  }
  return goals;
}

/** A copy of `goals` with one goal set (clamped, not snapped). */
export function withGoalValue(
  goals: Readonly<GoalValues>,
  key: GoalKey,
  value: number,
): GoalValues {
  return { ...goals, [key]: clampGoalValue(value) };
}

// ---- Picker ---------------------------------------------------------------------------------

/** True when the wheel can show `value` exactly; otherwise the picker opens in typing mode. */
export function isWheelValue(key: GoalKey, value: number): boolean {
  const { min, max, step } = GOAL_SPECS[key].wheel;
  return value >= min && value <= max && (value - min) % step === 0;
}

/** Where the wheel opens for a goal: rounded down onto the step, then kept inside the range. */
export function goalWheelStart(key: GoalKey, value: number): number {
  const { min, max, step } = GOAL_SPECS[key].wheel;
  return clamp(Math.floor(value / step) * step, min, max);
}

/** True when a goal is above the nutrient's general adult upper limit (exactly at it is fine). */
export function isAboveUpperHint(key: GoalKey, value: number): boolean {
  const hint = GOAL_SPECS[key].upperHint;
  return hint !== undefined && value > hint;
}

/** Vitamin D in international units: 1 mcg = 40 IU, rounded to a whole unit. */
export function vitaminDIu(mcg: number): number {
  return Math.round(mcg * 40);
}

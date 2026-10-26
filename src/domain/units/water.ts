// Water amounts. Storage is whole millilitres; a person reads ml or US fluid ounces. Fields that
// take an amount (the quick-add editor and the custom amount) share one rule: more than zero,
// rounded to whole ml, at least 1 and at most 5 000 ml (D-16.39). A quick-add field the person
// left alone keeps its stored ml exactly instead of passing through fl oz and back (R05.10).

import {
  clamp,
  formatNumber,
  numberMarks,
  parseDecimal,
  plainText,
  type WheelRange,
} from './numbers';

export const WATER_DISPLAY_UNITS = ['ml', 'flOz'] as const;
/** How a person reads water (setting `water.unit`). Storage is always ml. */
export type WaterDisplayUnit = (typeof WATER_DISPLAY_UNITS)[number];

export function isWaterDisplayUnit(value: unknown): value is WaterDisplayUnit {
  return value === 'ml' || value === 'flOz';
}

export const DEFAULT_WATER_UNIT: WaterDisplayUnit = 'ml';
export const DEFAULT_WATER_GOAL_ML = 2_000;

/** One US fluid ounce in millilitres. */
export const ML_PER_FL_OZ = 29.5735295625;

// ---- Display ------------------------------------------------------------------------------

/** An ml amount in the display unit, unrounded. */
export function waterToDisplay(ml: number, unit: WaterDisplayUnit): number {
  return unit === 'flOz' ? ml / ML_PER_FL_OZ : ml;
}

/**
 * The number a screen shows for an amount: whole ml; in fl oz a whole number when the value is
 * within 0.05 of one, else one decimal (237 ml → 8, 250 ml → 8.5).
 */
export function waterShown(ml: number, unit: WaterDisplayUnit): number {
  if (unit === 'ml') return Math.round(ml);
  const ounces = waterToDisplay(ml, unit);
  const nearestWhole = Math.round(ounces);
  if (Math.abs(ounces - nearestWhole) < 0.05) return nearestWhole;
  return Math.round(ounces * 10) / 10;
}

/** An amount as grouped text without the unit word: 1 000 ml → "1,000" (en-US), 250 ml → "8.5" fl oz. */
export function formatWater(ml: number, unit: WaterDisplayUnit, locale: string): string {
  return formatNumber(waterShown(ml, unit), locale, unit === 'flOz' ? 1 : 0);
}

// ---- Daily goal wheel ---------------------------------------------------------------------

export const WATER_GOAL_WHEEL: Readonly<Record<WaterDisplayUnit, WheelRange>> = {
  ml: { min: 50, max: 10_000, step: 50 },
  flOz: { min: 2, max: 338, step: 1 },
};

/** Where the goal wheel opens: the goal in the display unit, on the nearest step, in range. */
export function waterGoalStart(goalMl: number, unit: WaterDisplayUnit): number {
  const { min, max, step } = WATER_GOAL_WHEEL[unit];
  const nearest = Math.round(waterToDisplay(goalMl, unit) / step) * step;
  return clamp(nearest, min, max);
}

/**
 * The ml goal to store for a wheel value. A fl oz wheel left where it opened keeps `storedMl`
 * exactly (2 000 ml opens at 68 fl oz, which converts back to 2 011 ml); any other pick is
 * converted. The ml wheel stores what it shows.
 */
export function waterGoalSave(
  picked: number,
  start: number,
  storedMl: number,
  unit: WaterDisplayUnit,
): number {
  if (unit === 'flOz' && picked === start) return storedMl;
  return Math.round(unit === 'flOz' ? picked * ML_PER_FL_OZ : picked);
}

// ---- Amounts: quick-add and custom --------------------------------------------------------

export const WATER_AMOUNT_MIN_ML = 1;
export const WATER_AMOUNT_MAX_ML = 5_000;
export const DEFAULT_QUICK_ADD_ML: readonly number[] = [250, 500, 750];
const QUICK_ADD_COUNT = 3;

function isAmountMl(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= WATER_AMOUNT_MIN_ML &&
    value <= WATER_AMOUNT_MAX_ML
  );
}

/**
 * The stored quick-add amounts, smallest first. Anything that is not exactly three whole amounts
 * of 1–5 000 ml reads as 250 / 500 / 750. Always a new array.
 */
export function decodeQuickAdd(value: unknown): number[] {
  if (!Array.isArray(value) || value.length !== QUICK_ADD_COUNT || !value.every(isAmountMl)) {
    return [...DEFAULT_QUICK_ADD_ML];
  }
  return [...value].sort((a: number, b: number) => a - b);
}

/**
 * The ml to store for an amount in the display unit, or null: it must be above 0; it is rounded
 * to whole ml, raised to at least 1 ml (0.4 ml → 1) and refused above 5 000 ml (D-16.39).
 */
export function amountToMl(value: number, unit: WaterDisplayUnit): number | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  const ml = Math.max(
    WATER_AMOUNT_MIN_ML,
    Math.round(unit === 'flOz' ? value * ML_PER_FL_OZ : value),
  );
  return ml > WATER_AMOUNT_MAX_ML ? null : ml;
}

/** The largest amount a field accepts, in its unit, for the error text: 5 000 ml or 169 fl oz. */
export function maxAmountShown(unit: WaterDisplayUnit): number {
  if (unit === 'ml') return WATER_AMOUNT_MAX_ML;
  // One decimal is all a fl oz field takes; 169.1 fl oz would round to 5 001 ml.
  return Math.floor((WATER_AMOUNT_MAX_ML / ML_PER_FL_OZ) * 10) / 10;
}

const ML_FIELD_LENGTH = 5;
const FL_OZ_FIELD_LENGTH = 6;

/**
 * The amount field's text after a keystroke. ml: ASCII digits only, at most 5. fl oz: digits and
 * one decimal mark (a comma, a dot or the locale's mark, written as the locale's mark) with one
 * digit after it, at most 6 characters; a second mark and what follows it are dropped.
 */
export function filterAmountText(raw: string, unit: WaterDisplayUnit, locale: string): string {
  if (unit === 'ml') return raw.replace(/\D/g, '').slice(0, ML_FIELD_LENGTH);
  const { decimal } = numberMarks(locale);
  let whole = '';
  let fraction: string | null = null;
  for (const char of raw) {
    const isMark = char === '.' || char === ',' || char === decimal;
    if (isMark) {
      if (fraction !== null) break;
      fraction = '';
    } else if (char >= '0' && char <= '9') {
      if (fraction === null) whole += char;
      else if (fraction.length < 1) fraction += char;
    }
  }
  const text = fraction === null ? whole : `${whole}${decimal}${fraction}`;
  return text.slice(0, FL_OZ_FIELD_LENGTH);
}

/** The field text for a stored amount: plain ml digits ("1000"), or fl oz as shown ("8", "8.5"). */
export function amountText(ml: number, unit: WaterDisplayUnit, locale: string): string {
  if (unit === 'ml') return plainText(Math.round(ml), 0);
  return plainText(waterShown(ml, unit), 1).replace('.', numberMarks(locale).decimal);
}

/** The ml for a field's text, or null when it is empty, zero or over 5 000 ml. */
export function parseAmountText(
  text: string,
  unit: WaterDisplayUnit,
  locale: string,
): number | null {
  const value = parseDecimal(text, locale);
  return value === null ? null : amountToMl(value, unit);
}

/**
 * The ml for one quick-add field. A field still showing the text it was seeded with keeps
 * `savedMl` exactly (R05.10); an edited field is read with `parseAmountText`.
 */
export function quickAddFieldMl(
  text: string,
  savedMl: number,
  unit: WaterDisplayUnit,
  locale: string,
): number | null {
  if (text === amountText(savedMl, unit, locale)) return savedMl;
  return parseAmountText(text, unit, locale);
}

/**
 * The amounts to store from the editor's three fields (seeded from `saved`), smallest first, or
 * null while any field is empty, zero or over the limit.
 */
export function quickAddFromFields(
  texts: readonly string[],
  saved: readonly number[],
  unit: WaterDisplayUnit,
  locale: string,
): number[] | null {
  if (texts.length !== QUICK_ADD_COUNT || saved.length !== QUICK_ADD_COUNT) return null;
  const amounts: number[] = [];
  for (const [index, text] of texts.entries()) {
    const savedMl = saved[index];
    const ml = savedMl === undefined ? null : quickAddFieldMl(text, savedMl, unit, locale);
    if (ml === null) return null;
    amounts.push(ml);
  }
  return amounts.sort((a, b) => a - b);
}

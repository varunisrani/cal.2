// Water in ml or US fluid ounces. Stored amounts are whole ml; fluid ounces exist only on
// screen and in typed input. Every amount a person sets (a quick-add button or a custom amount)
// is 1–5 000 ml (D-16.39).

import { clamp, formatFixed, readPlainNumber, type StepRange } from './numbers';

/** The values of the `water.unit` setting. */
export const WATER_MEASURES = ['ml', 'flOz'] as const;
export type WaterMeasure = (typeof WATER_MEASURES)[number];

export function isWaterMeasure(value: unknown): value is WaterMeasure {
  return value === 'ml' || value === 'flOz';
}

export const ML_PER_FL_OZ = 29.5735295625;
export const WATER_AMOUNT_MIN_ML = 1;
export const WATER_AMOUNT_MAX_ML = 5_000;

function mlIn(ml: number, unit: WaterMeasure): number {
  return unit === 'flOz' ? ml / ML_PER_FL_OZ : ml;
}

// ---- Display -------------------------------------------------------------------------------

/**
 * The number shown for an amount: whole ml, or fluid ounces as a whole number when within 0.05
 * of one (237 ml → 8) and with one decimal otherwise (250 ml → 8.5).
 */
export function waterDisplayValue(ml: number, unit: WaterMeasure): number {
  if (unit === 'ml') return Math.round(ml);
  const ounces = mlIn(ml, unit);
  const nearest = Math.round(ounces);
  return Math.abs(ounces - nearest) < 0.05 ? nearest : Math.round(ounces * 10) / 10;
}

/** The shown amount in the locale's marks: "1,000" ml, "8" or "8.5" fl oz. */
export function formatWater(ml: number, unit: WaterMeasure, locale: string): string {
  const value = waterDisplayValue(ml, unit);
  return formatFixed(value, Number.isInteger(value) ? 0 : 1, locale);
}

/**
 * Whole ml for an amount given in `unit`: rounded, at least 1, or null when it is not above 0,
 * not finite, or comes to more than 5 000 ml.
 */
export function waterAmountMl(value: number, unit: WaterMeasure): number | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  const ml = Math.max(
    WATER_AMOUNT_MIN_ML,
    Math.round(unit === 'flOz' ? value * ML_PER_FL_OZ : value),
  );
  return ml <= WATER_AMOUNT_MAX_ML ? ml : null;
}

// ---- Daily goal wheel ----------------------------------------------------------------------

export const WATER_GOAL_WHEEL: Readonly<Record<WaterMeasure, StepRange>> = {
  ml: { min: 50, max: 10_000, step: 50 },
  flOz: { min: 2, max: 338, step: 1 },
};

/** Where the goal wheel opens: the stored goal rounded to the nearest row, inside the wheel. */
export function waterGoalStart(goalMl: number, unit: WaterMeasure): number {
  const { min, max, step } = WATER_GOAL_WHEEL[unit];
  return clamp(Math.round(mlIn(goalMl, unit) / step) * step, min, max);
}

/**
 * The goal in ml for a wheel pick. A wheel saved where it opened keeps the stored goal, so
 * opening and saving never moves it; any other pick converts and rounds to whole ml.
 */
export function waterGoalSave(
  picked: number,
  start: number,
  storedMl: number,
  unit: WaterMeasure,
): number {
  if (picked === start) return storedMl;
  return Math.round(unit === 'flOz' ? picked * ML_PER_FL_OZ : picked);
}

// ---- Quick-add amounts ---------------------------------------------------------------------

/** The three quick-add amounts in ml, smallest first. */
export type QuickAddAmounts = readonly [number, number, number];

export const QUICK_ADD_DEFAULTS: QuickAddAmounts = Object.freeze([250, 500, 750] as const);

function isAmountMl(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= WATER_AMOUNT_MIN_ML &&
    value <= WATER_AMOUNT_MAX_ML
  );
}

/** A sorted copy of exactly three amounts, or null for any other count. */
function sortedTriple(amounts: readonly number[]): QuickAddAmounts | null {
  const [low, middle, high] = [...amounts].sort((a, b) => a - b);
  if (amounts.length !== 3 || low === undefined || middle === undefined || high === undefined) {
    return null;
  }
  return [low, middle, high];
}

/** The amounts in storage order (smallest first). */
export function sortQuickAdd(amounts: QuickAddAmounts): QuickAddAmounts {
  return sortedTriple(amounts) ?? QUICK_ADD_DEFAULTS;
}

/**
 * Reads the stored quick-add amounts: exactly three whole numbers of 1–5 000 ml, returned
 * smallest first; anything else gives 250 / 500 / 750.
 */
export function decodeQuickAdd(raw: unknown): QuickAddAmounts {
  if (!Array.isArray(raw)) return QUICK_ADD_DEFAULTS;
  const values: readonly unknown[] = raw;
  if (!values.every(isAmountMl)) return QUICK_ADD_DEFAULTS;
  return sortedTriple(values) ?? QUICK_ADD_DEFAULTS;
}

// ---- Amount fields (quick-add editor and custom amount) ------------------------------------

/** Longest text an amount field keeps: 5 digits of ml, or 6 characters of fl oz. */
export const WATER_FIELD_MAX_LENGTH: Readonly<Record<WaterMeasure, number>> = { ml: 5, flOz: 6 };

/**
 * What an amount field keeps of typed text: digits only for ml; for fl oz digits plus one
 * decimal mark (the comma or dot the person typed) and one digit after it.
 */
export function filterWaterField(text: string, unit: WaterMeasure): string {
  let kept = '';
  let hasMark = false;
  let decimals = 0;
  for (const char of text) {
    if (char >= '0' && char <= '9') {
      if (!hasMark) {
        kept += char;
      } else if (decimals < 1) {
        kept += char;
        decimals += 1;
      }
    } else if (unit === 'flOz' && !hasMark && (char === '.' || char === ',')) {
      kept += char;
      hasMark = true;
    }
  }
  return kept.slice(0, WATER_FIELD_MAX_LENGTH[unit]);
}

/** The text an amount field opens with: plain digits, fl oz to one decimal with a dot. */
export function waterFieldText(ml: number, unit: WaterMeasure): string {
  if (unit === 'ml') return String(Math.round(ml));
  const tenths = Math.round(mlIn(ml, unit) * 10);
  return tenths % 10 === 0 ? String(tenths / 10) : (tenths / 10).toFixed(1);
}

/**
 * ml for an amount field's text (a comma or a dot as the decimal mark), or null when it is
 * empty, zero or above 5 000 ml. The custom amount sheet uses this as well.
 */
export function parseWaterField(text: string, unit: WaterMeasure): number | null {
  const value = readPlainNumber(text.trim().replace(',', '.'));
  return value === null ? null : waterAmountMl(value, unit);
}

/** One quick-add field in the editor: what it shows now, and what it opened with. */
export interface QuickAddField {
  text: string;
  savedText: string;
  savedMl: number;
}

/**
 * ml for one editor field. A field whose text is still the text it opened with keeps its exact
 * stored ml, so 250 ml shown as "8.5" fl oz is not saved back as 251 (R05.10).
 */
export function quickAddFieldMl(field: QuickAddField, unit: WaterMeasure): number | null {
  return field.text === field.savedText ? field.savedMl : parseWaterField(field.text, unit);
}

/** The amounts to save from the three editor fields, smallest first, or null while any is invalid. */
export function quickAddFromFields(
  fields: readonly QuickAddField[],
  unit: WaterMeasure,
): QuickAddAmounts | null {
  const amounts: number[] = [];
  for (const field of fields) {
    const ml = quickAddFieldMl(field, unit);
    if (ml === null) return null;
    amounts.push(ml);
  }
  return sortedTriple(amounts);
}

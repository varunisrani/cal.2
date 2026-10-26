// The plan check: the gate between an AI plan reply and the saved targets (R01.2). A reply that is
// not four numbers, out of range, internally inconsistent or far from the formula plan is refused,
// and the caller keeps the targets it has. A reply that passes comes back as whole numbers whose
// energy adds up exactly: 4 × protein + 4 × carbs + 9 × fat = kcal.
//
// The checks run in a fixed order and a refusal names the one that failed. The input is the four
// raw values (and the reason) already read from the reply text by the AI layer, plus the person's
// formula plan.

import { err, ok, type Result } from '../../lib/result';
import { MACRO_KEYS, type MacroKey, type Targets } from '../model';
import { KCAL_PER_GRAM } from './formulas';
import { div, floorMod } from './integers';
import type { PlanField } from './planEdit';

/** The values a plan reply carried, before any check. */
export interface PlanReplyValues {
  readonly kcal: unknown;
  readonly protein: unknown;
  readonly carbs: unknown;
  readonly fat: unknown;
  readonly reason?: unknown;
}

/** An accepted plan: whole values with an exact 4/4/9 energy sum, and the AI's reason if any. */
export interface CheckedPlan extends Targets {
  readonly reason?: string;
}

/** Which check refused the reply, with the field and bounds where one field is to blame. */
export type PlanRejection =
  /** Step 1: a value is missing, not finite, or not a number or numeric string. */
  | { readonly step: 'notNumber'; readonly field: PlanField }
  /** Step 2: a raw value is outside `RAW_PLAN_RANGES`. */
  | {
      readonly step: 'outOfRange';
      readonly field: PlanField;
      readonly value: number;
      readonly min: number;
      readonly max: number;
    }
  /** Step 3: the macros' energy is too far from kcal. */
  | {
      readonly step: 'incoherent';
      readonly macroKcal: number;
      readonly kcal: number;
      readonly allowed: number;
    }
  /** Step 5: after the exact fit, protein or fat is under 10 g, or carbs under 0. */
  | {
      readonly step: 'belowMinimum';
      readonly field: MacroKey;
      readonly value: number;
      readonly min: number;
    }
  /** Step 6: a value is too far from the formula plan. */
  | {
      readonly step: 'implausible';
      readonly field: PlanField;
      readonly value: number;
      readonly min: number;
      readonly max: number;
    };

const FIELDS: readonly PlanField[] = ['kcal', 'protein', 'carbs', 'fat'];

/** Bounds every raw reply value must sit in, inclusive. */
export const RAW_PLAN_RANGES: Readonly<Record<PlanField, { min: number; max: number }>> = {
  kcal: { min: 800, max: 6_000 },
  protein: { min: 10, max: 500 },
  carbs: { min: 0, max: 1_500 },
  fat: { min: 10, max: 400 },
};

/** The fat ceiling of the exact fit, in grams. */
const FAT_CEILING = 400;

/** Smallest accepted protein and fat after the exact fit, in grams. */
const MACRO_FLOOR = 10;

// Plain decimal text: optional sign, digits with an optional fraction, optional exponent.
const NUMERIC_TEXT = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

/** A finite number, or numeric text (surrounding spaces ignored); anything else is null. */
function readValue(value: unknown): number | null {
  let n: number;
  if (typeof value === 'number') n = value;
  else if (typeof value === 'string' && NUMERIC_TEXT.test(value.trim())) n = Number(value.trim());
  else return null;
  return Number.isFinite(n) ? n : null;
}

/**
 * The fat amount with `residue` as its remainder mod 4 that is nearest `wanted`, inside
 * `[0, ceiling]`; on a tie the lower one.
 */
function fatWithResidue(wanted: number, residue: number, ceiling: number): number {
  const lower = wanted - floorMod(wanted - residue, 4);
  const upper = lower + 4;
  const fits = (n: number) => n >= 0 && n <= ceiling;
  if (fits(upper) && (!fits(lower) || upper - wanted < wanted - lower)) return upper;
  if (fits(lower)) return lower;
  return Math.min(residue, ceiling);
}

/**
 * Step 4: whole values whose energy sums exactly to the rounded kcal. Since 9 ≡ 1 (mod 4), fat must
 * leave the same remainder mod 4 as kcal; protein (capped at kcal div 4) steps down only as far as
 * needed to leave room for that much fat. Carbs take what is left.
 */
function exactFit(kcalRaw: number, proteinRaw: number, fatRaw: number): Targets {
  const kcal = Math.round(kcalRaw);
  const residue = floorMod(kcal, 4);
  const fatRoom = (protein: number) => div(kcal - KCAL_PER_GRAM.protein * protein, 9);
  let protein = Math.min(Math.round(proteinRaw), div(kcal, KCAL_PER_GRAM.protein));
  while (protein > 0 && fatRoom(protein) < residue) protein -= 1;
  const ceiling = Math.min(FAT_CEILING, fatRoom(protein));
  const fat = fatWithResidue(Math.min(Math.round(fatRaw), ceiling), residue, ceiling);
  const carbs = div(kcal - KCAL_PER_GRAM.protein * protein - KCAL_PER_GRAM.fat * fat, 4);
  return { kcal, protein, carbs, fat };
}

/** Rounded bounds `low × ref` to `high × ref`. */
function band(ref: number, low: number, high: number): { min: number; max: number } {
  return { min: Math.round(ref * low), max: Math.round(ref * high) };
}

/** Step 6 bounds from the formula plan. Carbs follow from the other three, so they have none. */
function plausibleBounds(
  formula: Targets,
): Record<'protein' | 'fat' | 'kcal', { min: number; max: number }> {
  const kcalRef = Math.min(6_000, Math.max(800, formula.kcal));
  const kcal = band(kcalRef, 0.5, 2);
  return {
    protein: band(Math.max(MACRO_FLOOR, formula.protein), 0.7, 1.3),
    fat: band(Math.max(MACRO_FLOOR, formula.fat), 0.5, 1.5),
    kcal: { min: Math.max(800, kcal.min), max: Math.min(6_000, kcal.max) },
  };
}

/**
 * Checks a plan reply against the formula plan (`formulaPlan(profile, today)`), in order:
 * 1. all four values are finite numbers or numeric text (booleans and null are not);
 * 2. each sits in `RAW_PLAN_RANGES`;
 * 3. |4P + 4C + 9F − kcal| ≤ max(100, 15 % of kcal);
 * 4. exact fit (see `exactFit`);
 * 5. protein and fat at least 10 g, carbs at least 0;
 * 6. protein within 70–130 % of max(10, formula protein), fat within 50–150 % of max(10, formula
 *    fat), kcal within max(800, half) to min(6 000, double) of the formula kcal held to 800–6 000;
 * 7. a reason that is text with something besides spaces is kept, trimmed.
 * Body fat never enters: the protein reference is the formula's full-body-weight protein.
 */
export function checkPlan(
  reply: PlanReplyValues,
  formula: Targets,
): Result<CheckedPlan, PlanRejection> {
  const raw = {} as Record<PlanField, number>;
  for (const field of FIELDS) {
    const value = readValue(reply[field]);
    if (value === null) return err({ step: 'notNumber', field });
    raw[field] = value;
  }

  for (const field of FIELDS) {
    const value = raw[field];
    const { min, max } = RAW_PLAN_RANGES[field];
    if (!(value >= min && value <= max)) return err({ step: 'outOfRange', field, value, min, max });
  }

  const reported = 4 * raw.protein + 4 * raw.carbs + 9 * raw.fat;
  const allowed = Math.max(100, raw.kcal * 0.15);
  if (Math.abs(reported - raw.kcal) > allowed) {
    return err({ step: 'incoherent', macroKcal: reported, kcal: raw.kcal, allowed });
  }

  const plan = exactFit(raw.kcal, raw.protein, raw.fat);

  for (const field of MACRO_KEYS) {
    const min = field === 'carbs' ? 0 : MACRO_FLOOR;
    if (plan[field] < min) return err({ step: 'belowMinimum', field, value: plan[field], min });
  }

  const bounds = plausibleBounds(formula);
  for (const field of ['protein', 'fat', 'kcal'] as const) {
    const { min, max } = bounds[field];
    const value = plan[field];
    if (value < min || value > max) return err({ step: 'implausible', field, value, min, max });
  }

  const reason = typeof reply.reason === 'string' ? reply.reason.trim() : '';
  return ok(reason === '' ? plan : { ...plan, reason });
}

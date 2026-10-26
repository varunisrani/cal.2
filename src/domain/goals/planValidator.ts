// Checks an AI plan reply before it may become the person's plan (R01.2). The reply reader hands
// over the four raw values and the reason; this module refuses anything malformed, out of range,
// self-contradicting or implausible for the person, and turns an accepted reply into whole numbers
// with 4P + 4C + 9F equal to kcal exactly. It never throws: a refusal names the step that failed.
//
// Exactness: 9 ≡ 1 (mod 4), so 4P + 4C + 9F ≡ F (mod 4). Fat grams must therefore leave the same
// remainder mod 4 as kcal; then the carbs remainder divides by 4 with nothing left over. The
// remainder is a true floor-mod (R01.9).

import { err, ok, type Result } from '../../lib/result';
import type { Targets } from '../model';
import { KCAL_PER_GRAM, floorMod, intDiv, macroKcal } from './formulas';

/** The values read from a plan reply, still untrusted. */
export interface PlanReply {
  kcal: unknown;
  protein: unknown;
  carbs: unknown;
  fat: unknown;
  reason?: unknown;
}

/** An accepted plan: whole numbers with 4P + 4C + 9F = kcal, and the AI's reason if it gave one. */
export interface CheckedPlan extends Targets {
  reason?: string;
}

/** Inclusive bounds. */
export interface Span {
  min: number;
  max: number;
}

export type PlanField = keyof Targets;

/** The check that refused a reply, in the order they run. */
export type PlanCheckStep = 'shape' | 'range' | 'coherence' | 'lowMacro' | 'plausibility';

export interface PlanRejection {
  step: PlanCheckStep;
  /** The field that failed (none for coherence, which is about all four). */
  field?: PlanField;
  /** The failing value: raw for shape and range, the mismatch in kcal for coherence, else whole. */
  value?: unknown;
  /** What would have passed, for range, coherence and plausibility. */
  allowed?: Span;
}

const FIELDS: readonly PlanField[] = ['kcal', 'protein', 'carbs', 'fat'];

/** Raw ranges a reply must sit in before anything is rounded. */
export const REPLY_RANGES: Readonly<Record<PlanField, Span>> = {
  kcal: { min: 800, max: 6_000 },
  protein: { min: 10, max: 500 },
  carbs: { min: 0, max: 1_500 },
  fat: { min: 10, max: 400 },
};

/** Protein and fat below this many grams are refused after normalising. */
export const MIN_MACRO_GRAMS = 10;

/** The most fat grams a normalised plan may hold. */
const FAT_CAP = 400;

const NUMERIC_TEXT = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;

/**
 * Step 1 for one value: a finite number, or a string holding one (spaces around are fine). true and
 * false, null, missing values, objects and text such as "150g", "NaN" or "Infinity" give null.
 */
export function readPlanNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!NUMERIC_TEXT.test(text)) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

/**
 * Plausible spans for a person whose formula plan is `reference`: protein 70–130 % and fat
 * 50–150 % of the formula grams (each reference at least 10), kcal half to twice the formula kcal
 * (clamped to 800–6 000) and never outside 800–6 000.
 */
export function plausibleRanges(reference: Targets): Record<'kcal' | 'protein' | 'fat', Span> {
  const protein = Math.max(MIN_MACRO_GRAMS, reference.protein);
  const fat = Math.max(MIN_MACRO_GRAMS, reference.fat);
  const { min: kcalMin, max: kcalMax } = REPLY_RANGES.kcal;
  const kcal = Math.min(Math.max(reference.kcal, kcalMin), kcalMax);
  return {
    protein: { min: Math.round(protein * 0.7), max: Math.round(protein * 1.3) },
    fat: { min: Math.round(fat * 0.5), max: Math.round(fat * 1.5) },
    kcal: {
      min: Math.max(kcalMin, Math.round(kcal * 0.5)),
      max: Math.min(kcalMax, Math.round(kcal * 2)),
    },
  };
}

/**
 * The fat grams ≡ `residue` (mod 4) nearest to `target`, inside 0…`capacity`; on a tie the lower
 * one. When no such value fits, the residue itself, capped at the capacity.
 */
export function fatWithResidue(target: number, residue: number, capacity: number): number {
  const lower = target - floorMod(target - residue, 4);
  const fits = [lower, lower + 4].filter((grams) => grams >= 0 && grams <= capacity);
  if (fits.length === 0) return Math.min(residue, capacity);
  return fits.reduce((best, grams) =>
    Math.abs(grams - target) < Math.abs(best - target) ? grams : best,
  );
}

function inside(value: number, span: Span): boolean {
  return value >= span.min && value <= span.max;
}

/**
 * Step 4 on its own: rounds checked raw values into a plan whose energy adds up exactly. kcal and
 * protein are rounded (protein at most kcal div 4, lowered while fat has no room for kcal's
 * remainder mod 4), fat is the nearest value with that remainder (at most 400 g), carbs take the
 * rest.
 */
export function exactPlan(raw: Targets): Targets {
  const kcal = Math.round(raw.kcal);
  let protein = Math.min(Math.round(raw.protein), intDiv(kcal, KCAL_PER_GRAM.protein));
  const residue = floorMod(kcal, 4);
  const fatRoom = (grams: number): number =>
    intDiv(kcal - grams * KCAL_PER_GRAM.protein, KCAL_PER_GRAM.fat);
  // Lower protein until the fat room can hold the residue.
  while (fatRoom(protein) < residue && protein > 0) protein -= 1;
  const capacity = Math.min(FAT_CAP, fatRoom(protein));
  const fat = fatWithResidue(Math.min(Math.round(raw.fat), capacity), residue, capacity);
  const carbs = intDiv(
    kcal - protein * KCAL_PER_GRAM.protein - fat * KCAL_PER_GRAM.fat,
    KCAL_PER_GRAM.carbs,
  );
  return { kcal, protein, carbs, fat };
}

/**
 * Runs the checks in order (shape, range, coherence, normalise, low macro, plausibility against
 * `reference`, the formula plan of the person the reply is for) and returns the accepted plan or
 * the first refusal.
 */
export function checkPlan(
  reply: PlanReply,
  reference: Targets,
): Result<CheckedPlan, PlanRejection> {
  // 1. Every value is a number.
  const raw: Targets = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  for (const field of FIELDS) {
    const number = readPlanNumber(reply[field]);
    if (number === null) return err({ step: 'shape', field, value: reply[field] });
    raw[field] = number;
  }

  // 2. Raw ranges.
  for (const field of FIELDS) {
    const allowed = REPLY_RANGES[field];
    if (!inside(raw[field], allowed)) {
      return err({ step: 'range', field, value: raw[field], allowed: { ...allowed } });
    }
  }

  // 3. The macros must explain the kcal within max(100, 15 %).
  const mismatch = macroKcal(raw) - raw.kcal;
  const tolerance = Math.max(100, raw.kcal * 0.15);
  if (Math.abs(mismatch) > tolerance) {
    return err({
      step: 'coherence',
      value: mismatch,
      allowed: { min: -tolerance, max: tolerance },
    });
  }

  // 4. Whole numbers with exact energy.
  const plan = exactPlan(raw);

  // 5. Nothing too low left over.
  if (plan.protein < MIN_MACRO_GRAMS) {
    return err({ step: 'lowMacro', field: 'protein', value: plan.protein });
  }
  if (plan.fat < MIN_MACRO_GRAMS) return err({ step: 'lowMacro', field: 'fat', value: plan.fat });
  if (plan.carbs < 0) return err({ step: 'lowMacro', field: 'carbs', value: plan.carbs });

  // 6. Plausible for this person.
  const ranges = plausibleRanges(reference);
  for (const field of ['protein', 'fat', 'kcal'] as const) {
    if (!inside(plan[field], ranges[field])) {
      return err({ step: 'plausibility', field, value: plan[field], allowed: ranges[field] });
    }
  }

  // 7. Keep a reason that says something.
  const checked: CheckedPlan = { ...plan };
  if (typeof reply.reason === 'string' && reply.reason.trim() !== '') {
    checked.reason = reply.reason.trim();
  }
  return ok(checked);
}

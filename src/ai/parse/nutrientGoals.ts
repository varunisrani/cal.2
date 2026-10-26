/**
 * The optional nutrient goals a model suggests after the plan is rebuilt. The reading is tolerant
 * about each value (a number or numeric text) and about key spelling, but strict about what it
 * changes: it starts from the person's current goals and overwrites only the keys that came back,
 * so a typed 7.3 stays 7.3 and a goal the answer left out keeps its value (R01.10, R03.25). An
 * answer with nothing usable is a failure, and a failure never touches the goals.
 */
import { GOAL_KEYS, unitOf, type GoalKey } from '../../domain/nutrients/catalogue';
import { clampGoalValue, type GoalValues } from '../../domain/nutrients/goalDefaults';
import { err, ok, type Result } from '../../lib/result';
import type { SingleFailure } from '../errors';
import { isRecord, readNumber } from './json';

/** Spellings people and models commonly use besides the ones built from our key names. */
const ALTERNATES: Readonly<Partial<Record<GoalKey, readonly string[]>>> = {
  fibre: ['fiber'],
  arginine: ['l-arginine'],
  carnitine: ['l-carnitine'],
  citrulline: ['l-citrulline'],
};

/** A key compared loosely: lower case, without `_`, `-` or spaces ("Vitamin_B12" → "vitaminb12"). */
function squeeze(name: string): string {
  return name.toLowerCase().replace(/[\s_-]/g, '');
}

/**
 * Every accepted spelling, squeezed, and the goal it names: the key ("vitaminC", "vitamin_c" and
 * "Vitamin C" all squeeze alike), the key followed by its own storage unit ("sodium_mg",
 * "vitaminDMcg") and the alternates. A suffix for another unit is not a spelling: "sodium_g" read
 * as milligrams would be off by 1 000.
 */
const SPELLINGS: ReadonlyMap<string, GoalKey> = new Map(
  GOAL_KEYS.flatMap((key) => {
    const unit = unitOf(key);
    const names = [key, ...(ALTERNATES[key] ?? [])].map(squeeze);
    return names.flatMap((name) => [
      [name, key],
      [name + unit, key],
    ]) as [string, GoalKey][];
  }),
);

/**
 * The person's goals after a goal answer already cut out of the model's text (`parseModelJson`).
 * Each of the 29 goals the answer gives, under our key or another spelling, is rounded to a whole
 * number and clamped to 0–999 999; our own spelling wins over another spelling of the same goal.
 * Every other goal keeps its current value, untouched. No usable goal at all is an invalid answer.
 * `current` is never changed.
 */
export function readNutrientGoals(
  reply: unknown,
  current: Readonly<GoalValues>,
): Result<GoalValues, SingleFailure> {
  if (!isRecord(reply)) return invalid();
  const found = new Map<GoalKey, number>();
  for (const key of GOAL_KEYS) {
    const value = Object.hasOwn(reply, key) ? readNumber(reply[key]) : undefined;
    if (value !== undefined) found.set(key, value);
  }
  for (const [name, raw] of Object.entries(reply)) {
    const key = SPELLINGS.get(squeeze(name));
    if (key === undefined || found.has(key)) continue;
    const value = readNumber(raw);
    if (value !== undefined) found.set(key, value);
  }
  if (found.size === 0) return invalid();

  const goals: GoalValues = { ...current };
  for (const [key, value] of found) goals[key] = clampGoalValue(Math.round(value));
  return ok(goals);
}

function invalid(): Result<never, SingleFailure> {
  return err({ kind: 'invalidResponse' });
}

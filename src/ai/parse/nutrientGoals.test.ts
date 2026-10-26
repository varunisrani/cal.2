import { describe, expect, it } from 'vitest';
import { GOAL_KEYS, unitOf } from '../../domain/nutrients/catalogue';
import { DEFAULT_GOAL_VALUES, type GoalValues } from '../../domain/nutrients/goalDefaults';
import { parseModelJson } from './json';
import { readNutrientGoals } from './nutrientGoals';

/** The person's goals: defaults plus a few typed values that sit off the picker wheels. */
const CURRENT: Readonly<GoalValues> = Object.freeze({
  ...DEFAULT_GOAL_VALUES,
  vitaminC: 17,
  iron: 7.3,
  sodium: 2_345,
  creatine: 5,
});

/** The goals read from `reply`, failing the test when it was refused. */
function goalsOf(reply: unknown, current: Readonly<GoalValues> = CURRENT): GoalValues {
  const result = readNutrientGoals(reply, current);
  if (!result.ok) throw new Error(`refused: ${result.error.kind}`);
  return result.value;
}

const REFUSED = { ok: false, error: { kind: 'invalidResponse' } };

describe('readNutrientGoals: only the goals that came back change (R03.25, R01.10)', () => {
  it('changes only sodium when the answer gives only sodium (ACC-C10-2)', () => {
    expect(goalsOf({ sodium: 1_800 })).toEqual({ ...CURRENT, sodium: 1_800 });
  });

  it('keeps typed values it was not given exactly, never snapped or rounded', () => {
    const goals = goalsOf({ calcium: 1_200 });
    expect(goals.iron).toBe(7.3);
    expect(goals.vitaminC).toBe(17);
    expect(goals.creatine).toBe(5);
  });

  it('reads every one of the 29 goals', () => {
    const reply = Object.fromEntries(GOAL_KEYS.map((key, i) => [key, i + 1]));
    const goals = goalsOf(reply);
    GOAL_KEYS.forEach((key, i) => expect(goals[key], key).toBe(i + 1));
  });

  it('reads an answer wrapped in a fence', () => {
    const parsed = parseModelJson('```json\n{"fibre": 32, "sugar": 45}\n```');
    if (!parsed.ok) throw new Error('did not parse');
    expect(goalsOf(parsed.value)).toEqual({ ...CURRENT, fibre: 32, sugar: 45 });
  });

  it('ignores kcal, macros, the goal-less fats and unknown keys beside a usable goal', () => {
    const goals = goalsOf({
      kcal: 2_000,
      protein: 150,
      monounsaturatedFat: 30,
      lycopene: 10,
      zinc: 12,
    });
    expect(goals).toEqual({ ...CURRENT, zinc: 12 });
    expect(goals).not.toHaveProperty('protein');
  });

  it('never changes the goals it was given', () => {
    const current = { ...CURRENT };
    goalsOf({ sodium: 1_500, iron: 14 }, current);
    expect(current).toEqual(CURRENT);
  });
});

describe('readNutrientGoals: values read tolerantly, rounded and clamped (D-16.57)', () => {
  it('accepts "1500" as 1 500', () => {
    expect(goalsOf({ potassium: '1500' }).potassium).toBe(1_500);
    expect(goalsOf({ potassium: ' 3200.4 ' }).potassium).toBe(3_200);
  });

  it('turns −3 into 0', () => {
    expect(goalsOf({ transFat: -3 }).transFat).toBe(0);
    expect(Object.is(goalsOf({ transFat: -0.4 }).transFat, 0)).toBe(true);
  });

  it('rounds to a whole number and holds the ceiling at 999 999', () => {
    expect(goalsOf({ sodium: 2_345.6 }).sodium).toBe(2_346);
    expect(goalsOf({ omega3: 1.5 }).omega3).toBe(2);
    expect(goalsOf({ caffeine: 5_000_000 }).caffeine).toBe(999_999);
    expect(goalsOf({ caffeine: '1e7' }).caffeine).toBe(999_999);
  });

  it('skips a value that is not a number and keeps the goal it had', () => {
    const goals = goalsOf({
      sodium: 'plenty',
      iron: null,
      zinc: true,
      calcium: '900 mg',
      fibre: 28,
    });
    expect(goals).toEqual({ ...CURRENT, fibre: 28 });
  });
});

describe('readNutrientGoals: other spellings of our keys', () => {
  it('reads snake_case, spaced, capitalised and unit-suffixed spellings', () => {
    const goals = goalsOf({
      vitamin_c: 120,
      'Vitamin D': 25,
      sodium_mg: 2_000,
      fiber_g: 35,
      vitaminB12Mcg: 4,
      'saturated-fat': 18,
      omega_3: 3,
      beta_alanine: 2,
      'L-Carnitine': 1,
      l_arginine: 6,
    });
    expect(goals).toEqual({
      ...CURRENT,
      vitaminC: 120,
      vitaminD: 25,
      sodium: 2_000,
      fibre: 35,
      vitaminB12: 4,
      saturatedFat: 18,
      omega3: 3,
      betaAlanine: 2,
      carnitine: 1,
      arginine: 6,
    });
  });

  it('maps the snake_case, unit-suffixed spelling of each goal to that goal alone', () => {
    for (const key of GOAL_KEYS) {
      const snake = key.replace(/[A-Z]+|\d+/g, (part) => `_${part.toLowerCase()}`);
      const name = `${snake}_${unitOf(key)}`;
      expect(goalsOf({ [name]: 7 }), name).toEqual({ ...CURRENT, [key]: 7 });
    }
  });

  it('does not read a suffix for another unit, which would be off by 1 000', () => {
    expect(readNutrientGoals({ sodium_g: 2 }, CURRENT)).toEqual(REFUSED);
    expect(readNutrientGoals({ vitamin_d_mg: 1 }, CURRENT)).toEqual(REFUSED);
  });

  it('prefers our own spelling over another spelling of the same goal, in any order', () => {
    expect(goalsOf({ sodium_mg: 1_500, sodium: 2_000 }).sodium).toBe(2_000);
    expect(goalsOf({ sodium: 2_000, sodium_mg: 1_500 }).sodium).toBe(2_000);
    expect(goalsOf({ sodium: null, sodium_mg: 1_500 }).sodium).toBe(1_500);
  });
});

describe('readNutrientGoals: nothing usable is a failure and never clears goals (R03.25)', () => {
  it('refuses an answer with no usable goal, leaving the goals to the caller unchanged', () => {
    const current = { ...CURRENT };
    const replies: unknown[] = [
      {},
      { kcal: 2_000, protein: 120, carbs: 250, fat: 70 },
      { sodium: null, iron: 'lots', calcium: true, zinc: '12 mg' },
      { monounsaturatedFat: 20, polyunsaturatedFat: 15 },
      { goals: { sodium: 2_000 } },
    ];
    for (const reply of replies) {
      expect(readNutrientGoals(reply, current), JSON.stringify(reply)).toEqual(REFUSED);
    }
    expect(current).toEqual(CURRENT);
  });

  it('refuses an answer that is not an object', () => {
    for (const reply of [null, undefined, 'sodium 2000', [2_000], 2_000]) {
      expect(readNutrientGoals(reply, CURRENT)).toEqual(REFUSED);
    }
  });
});

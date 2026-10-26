import { describe, expect, it } from 'vitest';
import { EXTRA_KEYS } from '../model';
import { GOAL_KEYS, type GoalKey } from './catalogue';
import {
  DEFAULT_NUTRIENT_GOALS,
  MAX_NUTRIENT_GOAL,
  NUTRIENT_GOAL_RULES,
  clampNutrientGoal,
  filterGoalText,
  goalWheelValues,
  isOnGoalWheel,
  parseGoalText,
  readNutrientGoals,
  setNutrientGoal,
  upperLimitExceeded,
  vitaminDIu,
} from './goalDefaults';

// The Android column of 01 §3.11 (D-16.57): start, kind, wheel min–max and step.
const TABLE: [GoalKey, number, 'limit' | 'target', number, number, number][] = [
  ['sugar', 50, 'limit', 0, 200, 5],
  ['addedSugar', 25, 'limit', 0, 100, 5],
  ['fibre', 30, 'target', 0, 100, 1],
  ['saturatedFat', 20, 'limit', 0, 80, 1],
  ['transFat', 0, 'limit', 0, 10, 1],
  ['cholesterol', 300, 'limit', 0, 1_000, 25],
  ['caffeine', 400, 'limit', 0, 1_000, 25],
  ['sodium', 2_300, 'limit', 0, 5_000, 50],
  ['potassium', 3_500, 'target', 0, 7_000, 50],
  ['calcium', 1_000, 'target', 300, 2_000, 50],
  ['iron', 18, 'target', 5, 45, 1],
  ['magnesium', 400, 'target', 100, 800, 25],
  ['zinc', 11, 'target', 3, 40, 1],
  ['vitaminA', 900, 'target', 300, 3_000, 50],
  ['vitaminC', 90, 'target', 20, 500, 10],
  ['vitaminD', 20, 'target', 5, 100, 1],
  ['vitaminB12', 3, 'target', 1, 20, 1],
  ['vitaminE', 15, 'target', 5, 100, 1],
  ['vitaminK', 120, 'target', 30, 300, 10],
  ['folate', 400, 'target', 100, 1_000, 50],
  ['omega3', 2, 'target', 0, 10, 1],
];

describe('goal rules', () => {
  it('has one rule for each of the 29 goal keys', () => {
    expect(Object.keys(NUTRIENT_GOAL_RULES).sort()).toEqual([...GOAL_KEYS].sort());
    expect(Object.keys(DEFAULT_NUTRIENT_GOALS).sort()).toEqual([...GOAL_KEYS].sort());
  });

  it('starts sodium at a 2 300 mg limit, fibre at a 30 g target and every compound at 0', () => {
    expect(NUTRIENT_GOAL_RULES.sodium).toMatchObject({ start: 2_300, kind: 'limit' });
    expect(NUTRIENT_GOAL_RULES.fibre).toMatchObject({ start: 30, kind: 'target' });
    expect(DEFAULT_NUTRIENT_GOALS.sodium).toBe(2_300);
    expect(DEFAULT_NUTRIENT_GOALS.fibre).toBe(30);
    for (const key of EXTRA_KEYS) {
      expect(NUTRIENT_GOAL_RULES[key]).toEqual({
        start: 0,
        kind: 'target',
        wheel: { min: 0, max: 50, step: 1 },
      });
      expect(DEFAULT_NUTRIENT_GOALS[key]).toBe(0);
    }
  });

  it('uses the Android starts, kinds, ranges and steps for the 21 nutrients (D-16.57)', () => {
    expect(TABLE).toHaveLength(21);
    for (const [key, start, kind, min, max, step] of TABLE) {
      const rule = NUTRIENT_GOAL_RULES[key];
      expect({ key, start: rule.start, kind: rule.kind, ...rule.wheel }).toEqual({
        key,
        start,
        kind,
        min,
        max,
        step,
      });
    }
  });

  it('keeps every wheel end and starting value on its step grid', () => {
    for (const key of GOAL_KEYS) {
      const { start, wheel } = NUTRIENT_GOAL_RULES[key];
      expect(Number.isInteger((wheel.max - wheel.min) / wheel.step)).toBe(true);
      expect(isOnGoalWheel(key, start)).toBe(true);
    }
  });
});

describe('custom goals', () => {
  it('clamps to 0–999 999: 1 234 567 → 999 999 and −1 → 0', () => {
    expect(setNutrientGoal(DEFAULT_NUTRIENT_GOALS, 'vitaminC', 1_234_567).vitaminC).toBe(
      MAX_NUTRIENT_GOAL,
    );
    expect(setNutrientGoal(DEFAULT_NUTRIENT_GOALS, 'iron', -1).iron).toBe(0);
    expect(clampNutrientGoal(999_999)).toBe(999_999);
    expect(clampNutrientGoal(Number.POSITIVE_INFINITY)).toBe(999_999);
    expect(clampNutrientGoal(Number.NaN)).toBe(0);
  });

  it('never snaps a value to the wheel: 7.3 stays 7.3 and 95 mg of vitamin C stays 95', () => {
    expect(setNutrientGoal(DEFAULT_NUTRIENT_GOALS, 'omega3', 7.3).omega3).toBe(7.3);
    expect(setNutrientGoal(DEFAULT_NUTRIENT_GOALS, 'vitaminC', 95).vitaminC).toBe(95);
    expect(setNutrientGoal(DEFAULT_NUTRIENT_GOALS, 'sodium', 9_999).sodium).toBe(9_999);
  });

  it('changes only the key that was set and leaves the input untouched', () => {
    const next = setNutrientGoal(DEFAULT_NUTRIENT_GOALS, 'zinc', 12);
    expect(next).toEqual({ ...DEFAULT_NUTRIENT_GOALS, zinc: 12 });
    expect(DEFAULT_NUTRIENT_GOALS.zinc).toBe(11);
  });

  it('tells wheel values from values that need typing mode', () => {
    expect(isOnGoalWheel('vitaminC', 90)).toBe(true);
    expect(isOnGoalWheel('vitaminC', 95)).toBe(false);
    expect(isOnGoalWheel('omega3', 7.3)).toBe(false);
    expect(isOnGoalWheel('sodium', 5_000)).toBe(true);
    expect(isOnGoalWheel('sodium', 5_050)).toBe(false);
    expect(isOnGoalWheel('calcium', 250)).toBe(false);
  });

  it('lists every wheel value from the minimum up in steps', () => {
    expect(goalWheelValues('transFat')).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const sodium = goalWheelValues('sodium');
    expect(sodium).toHaveLength(101);
    expect(sodium.slice(0, 3)).toEqual([0, 50, 100]);
    expect(sodium.at(-1)).toBe(5_000);
    expect(goalWheelValues('calcium').slice(0, 2)).toEqual([300, 350]);
  });

  it('keeps up to seven digits of typed text and nothing else', () => {
    expect(filterGoalText('12a3.5')).toBe('1235');
    expect(filterGoalText('12345678')).toBe('1234567');
    expect(filterGoalText(' 2,300 ')).toBe('2300');
    expect(filterGoalText('')).toBe('');
  });

  it('reads typed digits as a clamped goal and refuses anything else', () => {
    expect(parseGoalText('2345')).toBe(2_345);
    expect(parseGoalText('1234567')).toBe(999_999);
    expect(parseGoalText('0')).toBe(0);
    expect(parseGoalText('0030')).toBe(30);
    for (const bad of ['', '12345678', '7.3', '-5', ' 12', '1e3', '١٢']) {
      expect(parseGoalText(bad)).toBeNull();
    }
  });
});

describe('hints', () => {
  it('names the upper limit only when a goal is above it', () => {
    expect(upperLimitExceeded('calcium', 3_000)).toBe(2_500);
    expect(upperLimitExceeded('calcium', 2_500)).toBeNull();
    expect(upperLimitExceeded('calcium', 2_501)).toBe(2_500);
    expect(upperLimitExceeded('sodium', 999_999)).toBeNull();
    expect(upperLimitExceeded('creatine', 999_999)).toBeNull();
  });

  it('has upper limits for exactly eight nutrients', () => {
    const limits = Object.fromEntries(
      GOAL_KEYS.flatMap((key) => {
        const { upperLimit } = NUTRIENT_GOAL_RULES[key];
        return upperLimit === undefined ? [] : [[key, upperLimit]];
      }),
    );
    expect(limits).toEqual({
      calcium: 2_500,
      iron: 45,
      zinc: 40,
      vitaminA: 3_000,
      vitaminC: 2_000,
      vitaminD: 100,
      vitaminE: 1_000,
      folate: 1_000,
    });
  });

  it('gives vitamin D in IU as mcg × 40: 20 mcg = 800 IU', () => {
    expect(vitaminDIu(20)).toBe(800);
    expect(vitaminDIu(125)).toBe(5_000);
    expect(vitaminDIu(0)).toBe(0);
  });
});

describe('readNutrientGoals', () => {
  it('gives every starting value for anything but a plain object', () => {
    for (const raw of [undefined, null, 'sodium=2000', 42, [], [1, 2]]) {
      expect(readNutrientGoals(raw)).toEqual(DEFAULT_NUTRIENT_GOALS);
    }
  });

  it('fills missing or unreadable keys with their starting values', () => {
    const goals = readNutrientGoals({
      sodium: 1_500,
      fibre: '40',
      iron: Number.NaN,
      zinc: Number.POSITIVE_INFINITY,
      vitaminK: null,
    });
    expect(goals).toEqual({ ...DEFAULT_NUTRIENT_GOALS, sodium: 1_500 });
  });

  it('clamps stored values without rounding them and drops unknown keys', () => {
    const raw = { calcium: -20, sugar: 2_000_000, omega3: 1.6, fiber: 99, mystery: 1 };
    const goals = readNutrientGoals(raw);
    expect(goals.calcium).toBe(0);
    expect(goals.sugar).toBe(999_999);
    expect(goals.omega3).toBe(1.6);
    expect(goals.fibre).toBe(30);
    expect(Object.keys(goals).sort()).toEqual([...GOAL_KEYS].sort());
    expect(raw.calcium).toBe(-20);
  });
});

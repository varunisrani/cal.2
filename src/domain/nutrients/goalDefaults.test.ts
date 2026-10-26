import { describe, expect, it } from 'vitest';
import { EXTRA_KEYS } from '../model';
import { GOAL_KEYS, type GoalKey } from './catalogue';
import {
  clampGoalValue,
  decodeGoalValues,
  DEFAULT_GOAL_VALUES,
  filterGoalText,
  GOAL_SPECS,
  GOAL_TEXT_MAX_DIGITS,
  GOAL_VALUE_MAX,
  goalFromText,
  goalWheelStart,
  isAboveUpperHint,
  isWheelValue,
  vitaminDIu,
  withGoalValue,
} from './goalDefaults';

// [default, kind, min, max, step] for every goal nutrient, Android column of 01 §3.11 (D-16.57).
const TABLE: Record<
  Exclude<GoalKey, (typeof EXTRA_KEYS)[number]>,
  [number, string, number, number, number]
> = {
  sugar: [50, 'limit', 0, 200, 5],
  addedSugar: [25, 'limit', 0, 100, 5],
  fibre: [30, 'target', 0, 100, 1],
  saturatedFat: [20, 'limit', 0, 80, 1],
  transFat: [0, 'limit', 0, 10, 1],
  cholesterol: [300, 'limit', 0, 1_000, 25],
  caffeine: [400, 'limit', 0, 1_000, 25],
  sodium: [2_300, 'limit', 0, 5_000, 50],
  potassium: [3_500, 'target', 0, 7_000, 50],
  calcium: [1_000, 'target', 300, 2_000, 50],
  iron: [18, 'target', 5, 45, 1],
  magnesium: [400, 'target', 100, 800, 25],
  zinc: [11, 'target', 3, 40, 1],
  vitaminA: [900, 'target', 300, 3_000, 50],
  vitaminC: [90, 'target', 20, 500, 10],
  vitaminD: [20, 'target', 5, 100, 1],
  vitaminB12: [3, 'target', 1, 20, 1],
  vitaminE: [15, 'target', 5, 100, 1],
  vitaminK: [120, 'target', 30, 300, 10],
  folate: [400, 'target', 100, 1_000, 50],
  omega3: [2, 'target', 0, 10, 1],
};

describe('goal specs', () => {
  it('has a spec for each of the 29 goals', () => {
    expect(Object.keys(GOAL_SPECS).sort()).toEqual([...GOAL_KEYS].sort());
    expect(Object.keys(DEFAULT_GOAL_VALUES).sort()).toEqual([...GOAL_KEYS].sort());
  });

  it('matches the default, kind and Android wheel of every goal nutrient (D-16.57)', () => {
    for (const [key, [defaultValue, kind, min, max, step]] of Object.entries(TABLE)) {
      const spec = GOAL_SPECS[key as GoalKey];
      expect({ key, defaultValue: spec.defaultValue, kind: spec.kind, wheel: spec.wheel }).toEqual({
        key,
        defaultValue,
        kind,
        wheel: { min, max, step },
      });
    }
  });

  it('defaults sodium to a 2 300 mg limit, fibre to a 30 g target and supplements to 0', () => {
    expect(GOAL_SPECS.sodium).toMatchObject({ defaultValue: 2_300, kind: 'limit' });
    expect(GOAL_SPECS.fibre).toMatchObject({ defaultValue: 30, kind: 'target' });
    for (const key of EXTRA_KEYS) {
      expect(GOAL_SPECS[key]).toEqual({
        defaultValue: 0,
        kind: 'target',
        wheel: { min: 0, max: 50, step: 1 },
      });
      expect(DEFAULT_GOAL_VALUES[key]).toBe(0);
    }
    expect(DEFAULT_GOAL_VALUES.sodium).toBe(2_300);
    expect(DEFAULT_GOAL_VALUES.fibre).toBe(30);
  });

  it('puts every default inside its wheel', () => {
    for (const key of GOAL_KEYS) expect(isWheelValue(key, DEFAULT_GOAL_VALUES[key])).toBe(true);
  });
});

describe('custom goal values', () => {
  it('clamps to 0–999 999 without snapping to the wheel', () => {
    expect(GOAL_VALUE_MAX).toBe(999_999);
    expect(clampGoalValue(1_234_567)).toBe(999_999);
    expect(clampGoalValue(7.3)).toBe(7.3);
    expect(clampGoalValue(17)).toBe(17);
    expect(clampGoalValue(-1)).toBe(0);
    expect(clampGoalValue(Number.NaN)).toBe(0);
    expect(clampGoalValue(Number.POSITIVE_INFINITY)).toBe(999_999);
    expect(clampGoalValue(Number.NEGATIVE_INFINITY)).toBe(0);
  });

  it('keeps digits only, at most seven, while typing', () => {
    expect(GOAL_TEXT_MAX_DIGITS).toBe(7);
    expect(filterGoalText('12a3')).toBe('123');
    expect(filterGoalText('7.3')).toBe('73');
    expect(filterGoalText('-5')).toBe('5');
    expect(filterGoalText('123456789')).toBe('1234567');
    expect(filterGoalText('')).toBe('');
  });

  it('reads a typed value and clamps it', () => {
    expect(goalFromText('1234567')).toBe(999_999);
    expect(goalFromText('17')).toBe(17);
    expect(goalFromText('0')).toBe(0);
    expect(goalFromText(' 007 ')).toBe(7);
    for (const text of ['', ' ', '7.3', '-1', '1e3', '12a']) expect(goalFromText(text)).toBeNull();
  });

  it('sets one goal in a copy, clamped and not snapped', () => {
    const goals = withGoalValue(DEFAULT_GOAL_VALUES, 'vitaminC', 17);
    expect(goals.vitaminC).toBe(17);
    expect(withGoalValue(goals, 'vitaminD', 1_234_567).vitaminD).toBe(999_999);
    expect(withGoalValue(goals, 'iron', -1).iron).toBe(0);
    expect(withGoalValue(goals, 'fibre', 7.3).fibre).toBe(7.3);
    expect(DEFAULT_GOAL_VALUES.vitaminC).toBe(90);
  });
});

describe('decodeGoalValues', () => {
  it('reads every goal as its default when the stored value is not a record', () => {
    for (const stored of [undefined, null, 'x', 42, [], [1, 2]]) {
      expect(decodeGoalValues(stored)).toEqual(DEFAULT_GOAL_VALUES);
    }
  });

  it('fills missing or unreadable keys with defaults, clamps the rest and drops unknown keys', () => {
    const goals = decodeGoalValues({
      sodium: 1_500,
      fibre: '40',
      iron: null,
      vitaminA: -3,
      calcium: 2_000_000,
      creatine: 5,
      zinc: 7.3,
      potassium: Number.NaN,
      fiber: 99,
    });
    expect(goals).toEqual({
      ...DEFAULT_GOAL_VALUES,
      sodium: 1_500,
      vitaminA: 0,
      calcium: 999_999,
      creatine: 5,
      zinc: 7.3,
    });
    expect(Object.keys(goals)).toHaveLength(29);
  });

  it('returns a new record every time', () => {
    const goals = decodeGoalValues(null);
    goals.sodium = 1;
    expect(decodeGoalValues(null).sodium).toBe(2_300);
    expect(DEFAULT_GOAL_VALUES.sodium).toBe(2_300);
  });
});

describe('goal picker', () => {
  it('opens in typing mode for a value the wheel cannot show', () => {
    expect(isWheelValue('vitaminC', 90)).toBe(true);
    expect(isWheelValue('vitaminC', 17)).toBe(false);
    expect(isWheelValue('vitaminC', 95)).toBe(false);
    expect(isWheelValue('vitaminC', 510)).toBe(false);
    expect(isWheelValue('fibre', 7.3)).toBe(false);
    expect(isWheelValue('sodium', 5_000)).toBe(true);
    expect(isWheelValue('sodium', 6_000)).toBe(false);
    expect(isWheelValue('calcium', 300)).toBe(true);
    expect(isWheelValue('calcium', 250)).toBe(false);
  });

  it('opens the wheel on the value rounded down to the step and kept in range', () => {
    expect(goalWheelStart('vitaminC', 95)).toBe(90);
    expect(goalWheelStart('vitaminC', 17)).toBe(20);
    expect(goalWheelStart('vitaminC', 5_000)).toBe(500);
    expect(goalWheelStart('sodium', 2_349)).toBe(2_300);
    expect(goalWheelStart('fibre', 7.3)).toBe(7);
    expect(goalWheelStart('magnesium', 999_999)).toBe(800);
  });

  it('flags a goal above the general adult upper limit, only for the eight with one', () => {
    const hints = Object.fromEntries(
      GOAL_KEYS.filter((key) => GOAL_SPECS[key].upperHint !== undefined).map((key) => [
        key,
        GOAL_SPECS[key].upperHint,
      ]),
    );
    expect(hints).toEqual({
      calcium: 2_500,
      iron: 45,
      zinc: 40,
      vitaminA: 3_000,
      vitaminC: 2_000,
      vitaminD: 100,
      vitaminE: 1_000,
      folate: 1_000,
    });
    expect(isAboveUpperHint('calcium', 2_500)).toBe(false);
    expect(isAboveUpperHint('calcium', 2_501)).toBe(true);
    expect(isAboveUpperHint('sodium', 999_999)).toBe(false);
  });

  it('shows vitamin D in IU as mcg × 40', () => {
    expect(vitaminDIu(20)).toBe(800);
    expect(vitaminDIu(250)).toBe(10_000);
    expect(vitaminDIu(0)).toBe(0);
  });
});

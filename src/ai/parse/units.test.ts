import { describe, expect, it } from 'vitest';
import type { NutritionDraft, ServingBasis } from '../../domain/model';
import foodOkScript from '../../../e2e/fake-ai/scripts/food-ok.json?raw';
import { readFoodReply } from './foodReply';
import { parseModelJson } from './json';
import { readUnits, withUnits } from './units';

const grams = (weight: number): ServingBasis => ({ kind: 'grams', grams: weight });
const UNKNOWN: ServingBasis = { kind: 'servings', count: 1 };

/** A food answer whose unit list is `units`. */
function answer(units: unknown): Record<string, unknown> {
  return { name: 'Sesame bagel', kcal: 280, protein: 10, carbs: 54, fat: 2, units };
}

const VOID = { units: [], needsRepair: true };

/** A draft of tomato soup at `basis`, for `withUnits`. */
function draft(basis: ServingBasis, overrides: Partial<NutritionDraft> = {}): NutritionDraft {
  return {
    name: 'Tomato soup',
    kcal: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
    nutrients: {},
    extras: {},
    basis,
    units: [],
    lines: [],
    progressive: false,
    ...overrides,
  };
}

describe('readUnits: a usable list (R03.16)', () => {
  it('keeps a valid list in order, ids trimmed and lower-case, and asks for no repair', () => {
    const reading = readUnits(
      answer([
        { unit: ' Bagel ', count: 1, gramsEach: 105 },
        { unit: 'half', count: 2, gramsEach: 52.5 },
      ]),
      grams(105),
    );
    expect(reading).toEqual({
      units: [
        { unit: 'bagel', gramsEach: 105, count: 1 },
        { unit: 'half', gramsEach: 52.5, count: 2 },
      ],
      needsRepair: false,
    });
  });

  it('reads an empty list as a complete answer: no units and no repair', () => {
    expect(readUnits(answer([]), grams(250))).toEqual({ units: [], needsRepair: false });
  });

  it('accepts 2 × 120 g for a 250 g serving, within 15 %', () => {
    const reading = readUnits(answer([{ unit: 'skewer', count: 2, gramsEach: 120 }]), grams(250));
    expect(reading.needsRepair).toBe(false);
    expect(reading.units).toEqual([{ unit: 'skewer', gramsEach: 120, count: 2 }]);
  });

  it('allows max(5 g, 15 %): 30 g either side of 200 g, 5 g either side of 20 g', () => {
    const fits = (count: number, each: number, weight: number) =>
      !readUnits(answer([{ unit: 'piece', count, gramsEach: each }]), grams(weight)).needsRepair;
    expect(fits(1, 230, 200)).toBe(true);
    expect(fits(1, 170, 200)).toBe(true);
    expect(fits(1, 230.5, 200)).toBe(false);
    expect(fits(1, 169.5, 200)).toBe(false);
    expect(fits(3, 8, 20)).toBe(true);
    expect(fits(1, 25, 20)).toBe(true);
    expect(fits(1, 26, 20)).toBe(false);
  });

  it('removes repeats in any case, keeping the first, and keeps four', () => {
    const reading = readUnits(
      answer([
        { unit: 'Slice', count: 3, gramsEach: 80 },
        { unit: 'slice', count: 2, gramsEach: 120 },
        { unit: 'wedge', count: 4, gramsEach: 60 },
        { unit: 'cup', count: 1, gramsEach: 240 },
        { unit: 'tbsp', count: 16, gramsEach: 15 },
        { unit: 'bowl', count: 1, gramsEach: 240 },
      ]),
      grams(240),
    );
    expect(reading.needsRepair).toBe(false);
    expect(reading.units).toEqual([
      { unit: 'slice', gramsEach: 80, count: 3 },
      { unit: 'wedge', gramsEach: 60, count: 4 },
      { unit: 'cup', gramsEach: 240, count: 1 },
      { unit: 'tbsp', gramsEach: 15, count: 16 },
    ]);
  });

  it('skips the weight check when the weight is unknown', () => {
    const reading = readUnits(answer([{ unit: 'cup', count: 1, gramsEach: 900 }]), UNKNOWN);
    expect(reading).toEqual({
      units: [{ unit: 'cup', gramsEach: 900, count: 1 }],
      needsRepair: false,
    });
  });
});

describe('readUnits: a missing or mangled list asks for one repair (R03.16)', () => {
  it('asks for repair when the list is missing or not a list', () => {
    const { units: _units, ...withoutUnits } = answer([]);
    expect(readUnits(withoutUnits, grams(105))).toEqual(VOID);
    for (const value of [null, 'bagel', { unit: 'bagel', count: 1, gramsEach: 105 }, 3]) {
      expect(readUnits(answer(value), grams(105)), JSON.stringify(value)).toEqual(VOID);
    }
    for (const reply of [null, 'units', [{ unit: 'bagel', count: 1, gramsEach: 105 }]]) {
      expect(readUnits(reply, grams(105))).toEqual(VOID);
    }
  });

  it('refuses count: true and count: "2", and the same for grams each', () => {
    const elements = [
      { unit: 'skewer', count: true, gramsEach: 120 },
      { unit: 'skewer', count: '2', gramsEach: 120 },
      { unit: 'skewer', count: 2, gramsEach: false },
      { unit: 'skewer', count: 2, gramsEach: '120' },
      { unit: 'skewer', count: null, gramsEach: 120 },
    ];
    for (const element of elements) {
      expect(readUnits(answer([element]), grams(240)), JSON.stringify(element)).toEqual(VOID);
    }
  });

  it('refuses an element that is not an object, lacks a field or has no usable name', () => {
    const elements: unknown[] = [
      'cup',
      null,
      [1, 240],
      { unit: 'cup', gramsEach: 240 },
      { unit: 'cup', count: 1 },
      { count: 1, gramsEach: 240 },
      { unit: '', count: 1, gramsEach: 240 },
      { unit: '   ', count: 1, gramsEach: 240 },
      { unit: 7, count: 1, gramsEach: 240 },
    ];
    for (const element of elements) {
      expect(readUnits(answer([element]), grams(240)), JSON.stringify(element)).toEqual(VOID);
    }
  });

  it('refuses counts and weights that are zero, negative or not finite', () => {
    for (const bad of [0, -2, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(readUnits(answer([{ unit: 'cup', count: bad, gramsEach: 240 }]), UNKNOWN)).toEqual(
        VOID,
      );
      expect(readUnits(answer([{ unit: 'cup', count: 1, gramsEach: bad }]), UNKNOWN)).toEqual(VOID);
    }
  });

  it('refuses 2 × 80 g for a 250 g serving and voids the good unit beside it', () => {
    const good = { unit: 'skewer', count: 2, gramsEach: 120 };
    const bad = { unit: 'kebab', count: 2, gramsEach: 80 };
    expect(readUnits(answer([bad]), grams(250))).toEqual(VOID);
    expect(readUnits(answer([good, bad]), grams(250))).toEqual(VOID);
    expect(readUnits(answer([bad, good]), grams(250))).toEqual(VOID);
  });

  it('refuses every spelling of grams, which the picker always offers itself', () => {
    for (const unit of ['g', 'G', ' gram ', 'Grams']) {
      const reading = readUnits(
        answer([
          { unit: 'cup', count: 1, gramsEach: 240 },
          { unit, count: 240, gramsEach: 1 },
        ]),
        grams(240),
      );
      expect(reading, unit).toEqual(VOID);
    }
  });

  it('reads only our element keys: other spellings of count and grams each are missing', () => {
    const element = { unit: 'cup', amount: 1, weightEach: 240 };
    expect(readUnits(answer([element]), grams(240))).toEqual(VOID);
  });
});

describe('withUnits: the first unit is the one the sheet opens in', () => {
  it('chooses the first unit and its count when the weight is known', () => {
    const next = withUnits(draft(grams(360)), [
      { unit: 'cup', gramsEach: 240, count: 1.5 },
      { unit: 'bowl', gramsEach: 360, count: 1 },
    ]);
    expect(next.units).toHaveLength(2);
    expect(next).toMatchObject({ chosenUnit: 'cup', chosenCount: 1.5 });
  });

  it('derives the count from the weight when the unit has none', () => {
    const next = withUnits(draft(grams(360)), [{ unit: 'cup', gramsEach: 240 }]);
    expect(next).toMatchObject({ chosenUnit: 'cup', chosenCount: 1.5 });
  });

  it('keeps the units but chooses none when the weight is unknown', () => {
    const next = withUnits(draft(UNKNOWN), [{ unit: 'cup', gramsEach: 240, count: 1 }]);
    expect(next.units).toEqual([{ unit: 'cup', gramsEach: 240, count: 1 }]);
    expect(next).not.toHaveProperty('chosenUnit');
    expect(next).not.toHaveProperty('chosenCount');
  });

  it('clears an earlier choice when no units are left, and leaves the input as it was', () => {
    const before = draft(grams(360), {
      units: [{ unit: 'cup', gramsEach: 240, count: 1.5 }],
      chosenUnit: 'cup',
      chosenCount: 1.5,
    });
    const next = withUnits(before, []);
    expect(next.units).toEqual([]);
    expect(next).not.toHaveProperty('chosenUnit');
    expect(next).not.toHaveProperty('chosenCount');
    expect(before).toMatchObject({ chosenUnit: 'cup', chosenCount: 1.5 });
  });
});

describe('readUnits with the food reply', () => {
  it("reads the fake AI's answer: a bowl and 1.75 cups, the bowl chosen", () => {
    const script = JSON.parse(foodOkScript) as {
      replies: [{ body: { choices: [{ message: { content: string } }] } }];
    };
    const parsed = parseModelJson(script.replies[0].body.choices[0].message.content);
    if (!parsed.ok) throw new Error('the fake answer did not parse');
    const food = readFoodReply(parsed.value);
    if (!food.ok) throw new Error('the fake answer was refused');

    const reading = readUnits(parsed.value, food.value.basis);
    expect(reading.needsRepair).toBe(false);
    const next = withUnits(food.value, reading.units);
    expect(next.units).toEqual([
      { unit: 'bowl', gramsEach: 420, count: 1 },
      { unit: 'cup', gramsEach: 240, count: 1.75 },
    ]);
    expect(next).toMatchObject({ chosenUnit: 'bowl', chosenCount: 1 });
  });
});

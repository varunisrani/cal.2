import { describe, expect, it } from 'vitest';
import type { IngredientLine, NutritionDraft, ServingBasis } from '../../domain/model';
import foodOkScript from '../../../e2e/fake-ai/scripts/food-ok.json?raw';
import { readFoodReply } from './foodReply';
import { parseModelJson } from './json';
import { MAX_PARTS, readParts, withParts } from './parts';

const grams = (weight: number): ServingBasis => ({ kind: 'grams', grams: weight });

/** A paneer tikka plate as the answer totals it: 500 g, 640 kcal. */
function meal(overrides: Partial<NutritionDraft> = {}): NutritionDraft {
  return {
    name: 'Paneer tikka plate',
    kcal: 640,
    protein: 32,
    carbs: 70,
    fat: 26,
    nutrients: { fibre: 6 },
    extras: {},
    basis: grams(500),
    units: [{ unit: 'plate', gramsEach: 500, count: 1 }],
    lines: [],
    progressive: false,
    ...overrides,
  };
}

/** A part in our reply contract. */
function part(
  name: string,
  weight: unknown,
  kcal: unknown,
  protein: unknown = 1,
  carbs: unknown = 1,
  fat: unknown = 1,
): Record<string, unknown> {
  return { name, grams: weight, kcal, protein, carbs, fat };
}

/** Three parts that add up to 590 of the plate's 640 kcal. */
const PLATE_PARTS = [
  part('Basmati rice', 200, 260, 5.4, 56, 0.8),
  part('Paneer tikka', 150, 300, 21, 6, 21.5),
  part('Mint chutney', 50, 30, 1, 4, 1.2),
];

function answer(parts: unknown): Record<string, unknown> {
  return { name: 'Paneer tikka plate', kcal: 640, protein: 32, carbs: 70, fat: 26, parts };
}

/** The draft after reading `parts` against `base`. */
function readInto(base: NutritionDraft, parts: unknown): NutritionDraft {
  return withParts(base, readParts(answer(parts), base));
}

/** Expects the breakdown dropped and the answer's own totals kept. */
function expectDropped(base: NutritionDraft, parts: unknown, label?: string): void {
  expect(readParts(answer(parts), base), label).toEqual([]);
  const next = readInto(base, parts);
  expect(next.lines, label).toEqual([]);
  expect(next, label).toMatchObject({
    kcal: base.kcal,
    protein: base.protein,
    carbs: base.carbs,
    fat: base.fat,
  });
}

describe('readParts: a usable breakdown replaces the totals (R03.14)', () => {
  it('keeps the parts and makes the meal kcal and macros their sums', () => {
    const next = readInto(meal(), PLATE_PARTS);
    expect(next.lines).toEqual<IngredientLine[]>([
      {
        name: 'Basmati rice',
        grams: 200,
        kcal: 260,
        protein: 5.4,
        carbs: 56,
        fat: 0.8,
        photoIds: [],
      },
      {
        name: 'Paneer tikka',
        grams: 150,
        kcal: 300,
        protein: 21,
        carbs: 6,
        fat: 21.5,
        photoIds: [],
      },
      { name: 'Mint chutney', grams: 50, kcal: 30, protein: 1, carbs: 4, fat: 1.2, photoIds: [] },
    ]);
    expect(next.kcal).toBe(590);
    expect(next.protein).toBeCloseTo(27.4, 10);
    expect(next.carbs).toBeCloseTo(66, 10);
    expect(next.fat).toBeCloseTo(23.5, 10);
  });

  it('leaves the serving weight, units and nutrients as the answer gave them', () => {
    const base = meal();
    const next = readInto(base, PLATE_PARTS);
    expect(next.basis).toEqual(grams(500));
    expect(next.units).toEqual(base.units);
    expect(next.nutrients).toEqual({ fibre: 6 });
  });

  it('reads numeric strings, trims names and rounds each part to a whole kcal', () => {
    const lines = readParts(
      answer([part('  Basmati rice ', '200', '260.4', '5.4', 56, 0.8), PLATE_PARTS[1]]),
      meal(),
    );
    expect(lines[0]).toMatchObject({ name: 'Basmati rice', grams: 200, kcal: 260, protein: 5.4 });
  });

  it('keeps 20 parts, the most an answer may list', () => {
    const parts = Array.from({ length: MAX_PARTS }, (_, i) => part(`Tapas ${i + 1}`, 25, 32));
    expect(readParts(answer(parts), meal())).toHaveLength(20);
  });

  it('keeps a breakdown at exactly half and at exactly one and a half of the meal kcal', () => {
    const base = meal({ kcal: 600 });
    expect(readParts(answer([part('Rice', 200, 300)]), base)).toHaveLength(1);
    expect(readParts(answer([part('Rice', 200, 900)]), base)).toHaveLength(1);
  });

  it('skips the coverage check when the meal has no kcal', () => {
    const base = meal({ kcal: 0, protein: 0, carbs: 0, fat: 0 });
    const next = readInto(base, [part('Lemon slice', 10, 3, 0, 1, 0)]);
    expect(next.lines).toHaveLength(1);
    expect(next.kcal).toBe(3);
  });

  it('needs no meal weight when every part lists its own', () => {
    const base = meal({ basis: { kind: 'servings', count: 1 } });
    expect(readParts(answer(PLATE_PARTS), base)).toHaveLength(3);
  });
});

describe('readParts: unknown part weights are filled from the meal (R03.14)', () => {
  it('shares the weight the listed parts leave over in proportion to kcal', () => {
    const base = meal({ kcal: 870 });
    const lines = readParts(
      answer([part('Rice', 200, 260), part('Dal makhani', undefined, 340), part('Naan', 0, 170)]),
      base,
    );
    expect(lines.map((line) => line.grams)).toEqual([200, 200, 100]);
  });

  it('reads a null weight as unknown too, and rounds a filled weight to 0.1 g', () => {
    const base = meal({ kcal: 75, basis: grams(300) });
    const lines = readParts(
      answer([part('Salad leaves', 200, 5), part('Olive oil', null, 30), part('Feta', 0, 40)]),
      base,
    );
    expect(lines.map((line) => line.grams)).toEqual([200, 42.9, 57.1]);
  });

  it('accepts a fill of exactly 9 kcal per gram and drops one of 10', () => {
    const base = meal({ kcal: 600, basis: grams(300) });
    expect(readParts(answer([part('Toast', 250, 150), part('Butter', 0, 450)]), base)).toHaveLength(
      2,
    );
    expectDropped(meal({ kcal: 650, basis: grams(300) }), [
      part('Toast', 250, 150),
      part('Butter', 0, 500),
    ]);
  });

  it('drops the breakdown when the meal weight is unknown', () => {
    expectDropped(meal({ basis: { kind: 'servings', count: 1 } }), [
      part('Rice', 200, 260),
      part('Curry', 0, 330),
    ]);
  });

  it('drops the breakdown when the listed weights leave no room', () => {
    for (const listed of [500, 520]) {
      expectDropped(meal(), [part('Rice', listed, 260), part('Curry', 0, 330)], `${listed} g`);
    }
  });

  it('drops the breakdown when a part of unknown weight has no kcal to size it by', () => {
    expectDropped(meal(), [...PLATE_PARTS, part('Water', 0, 0, 0, 0, 0)]);
    expectDropped(meal(), [...PLATE_PARTS, part('Water', undefined, 0, 0, 0, 0)]);
  });
});

describe('readParts: a breakdown that does not add up is dropped and the totals kept (ACC-E8-2)', () => {
  it('drops a breakdown covering 0.4 of the meal kcal', () => {
    expectDropped(meal(), [part('Basmati rice', 200, 256, 5.4, 56, 0.8)]);
  });

  it('drops a breakdown that also lists a total row', () => {
    expectDropped(meal(), [...PLATE_PARTS, part('Total', 400, 590, 27.4, 66, 23.5)]);
  });

  it('drops 21 parts instead of cutting the list short', () => {
    const parts = Array.from({ length: MAX_PARTS + 1 }, (_, i) => part(`Tapas ${i + 1}`, 20, 30));
    expectDropped(meal(), parts);
  });

  it('gives no breakdown for a missing, empty or non-list value', () => {
    for (const value of [undefined, null, [], 'rice, curry', { name: 'Rice' }]) {
      expectDropped(meal(), value, JSON.stringify(value));
    }
    expect(readParts(null, meal())).toEqual([]);
  });

  it('drops the whole list for any malformed part', () => {
    const malformed: unknown[] = [
      { name: 'Raita', grams: 50, kcal: 40, protein: 2, carbs: 4 },
      part('', 50, 40),
      part('   ', 50, 40),
      { ...part('x', 50, 40), name: 7 },
      part('Raita', 50, -5),
      part('Raita', 50, 40, -1),
      part('Raita', -50, 40),
      part('Raita', 50, true),
      part('Raita', 50, 'about 40'),
      part('Raita', 50, '1e9'),
      part('Raita', 50, 40, 100_001),
      part('Raita', 100_001, 40),
      part('Raita', 'a bowl', 40),
      part('Raita', false, 40),
      part('Raita', 50, Number.NaN),
      'Raita',
      null,
    ];
    for (const bad of malformed) {
      expectDropped(meal(), [...PLATE_PARTS, bad], JSON.stringify(bad));
    }
  });
});

describe('withParts', () => {
  it('keeps the totals and clears the parts when there are none', () => {
    const earlier: IngredientLine = {
      name: 'Basmati rice',
      grams: 200,
      kcal: 260,
      protein: 5.4,
      carbs: 56,
      fat: 0.8,
      photoIds: [],
    };
    const base = meal({ lines: [earlier] });
    const next = withParts(base, []);
    expect(next.lines).toEqual([]);
    expect(next).toMatchObject({ kcal: 640, protein: 32, carbs: 70, fat: 26 });
  });

  it("reads the fake AI's answer: soup and bread, totals from the parts", () => {
    const script = JSON.parse(foodOkScript) as {
      replies: [{ body: { choices: [{ message: { content: string } }] } }];
    };
    const parsed = parseModelJson(script.replies[0].body.choices[0].message.content);
    if (!parsed.ok) throw new Error('the fake answer did not parse');
    const food = readFoodReply(parsed.value);
    if (!food.ok) throw new Error('the fake answer was refused');

    const next = withParts(food.value, readParts(parsed.value, food.value));
    expect(next.lines.map((line) => [line.name, line.grams, line.kcal])).toEqual([
      ['Red lentil soup', 350, 240],
      ['Wholemeal bread', 70, 170],
    ]);
    expect(next.kcal).toBe(410);
    expect(next.protein).toBeCloseTo(22, 10);
    expect(next.carbs).toBeCloseTo(65, 10);
    expect(next.fat).toBeCloseTo(6.9, 10);
  });
});

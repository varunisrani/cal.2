import { describe, expect, it } from 'vitest';
import type { IngredientLine, NutritionDraft } from '../model';
import {
  applyLineChange,
  draftAsLine,
  LINE_VALUE_LIMIT,
  lineTotals,
  rescaleLine,
  stretchFactor,
  toLine,
  validateLine,
  type LineFields,
  type LinePortion,
} from './ingredients';
import { scaleLine } from './scale';

const line = (name: string, grams: number, kcal: number, macros = [0, 0, 0]): IngredientLine => ({
  name,
  grams,
  kcal,
  protein: macros[0] ?? 0,
  carbs: macros[1] ?? 0,
  fat: macros[2] ?? 0,
  photoIds: [],
});

function draftOf(fields: Partial<NutritionDraft> = {}): NutritionDraft {
  return {
    name: 'Stew',
    kcal: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
    nutrients: {},
    extras: {},
    basis: { kind: 'grams', grams: 400 },
    units: [],
    lines: [],
    progressive: false,
    ...fields,
  };
}

describe('lineTotals', () => {
  it('sums weight, energy and macros', () => {
    const totals = lineTotals([
      line('Oats', 60, 230, [8, 40, 4]),
      line('Milk', 200, 98, [7, 10, 3]),
    ]);
    expect(totals).toEqual({ grams: 260, kcal: 328, protein: 15, carbs: 50, fat: 7 });
    expect(lineTotals([])).toEqual({ grams: 0, kcal: 0, protein: 0, carbs: 0, fat: 0 });
  });
});

describe('draftAsLine', () => {
  it('makes a whole food one line with its known weight, without expanding its own lines', () => {
    const bowl = draftOf({
      name: ' Poke bowl ',
      kcal: 520,
      protein: 30,
      carbs: 60,
      fat: 16,
      basis: { kind: 'grams', grams: 350 },
      lines: [line('Rice', 200, 260), line('Salmon', 150, 260)],
      emoji: '🍣',
    });
    expect(draftAsLine(bowl, ['p1'])).toEqual({
      name: 'Poke bowl',
      grams: 350,
      kcal: 520,
      protein: 30,
      carbs: 60,
      fat: 16,
      photoIds: ['p1'],
      emoji: '🍣',
    });
  });

  it('gives an unknown weight 0 g, never its serving count (R02.1)', () => {
    const label = draftOf({ kcal: 380, basis: { kind: 'servings', count: 2 }, emoji: ' ' });
    const part = draftAsLine(label, []);
    expect(part.grams).toBe(0);
    expect(part.kcal).toBe(380);
    expect(part).not.toHaveProperty('emoji');
  });
});

describe('stretchFactor', () => {
  it('is new ÷ old when both weights are above 0', () => {
    expect(stretchFactor(400, 300)).toBe(0.75);
    expect(stretchFactor(150, 300)).toBe(2);
  });

  it('is null when the old weight is not above 0 and 0 when the new one is not', () => {
    expect(stretchFactor(0, 250)).toBeNull();
    expect(stretchFactor(-20, 250)).toBeNull();
    expect(stretchFactor(Number.NaN, 250)).toBeNull();
    expect(stretchFactor(250, 0)).toBe(0);
    expect(stretchFactor(250, -20)).toBe(0);
    expect(stretchFactor(250, Number.NaN)).toBe(0);
  });
});

describe('applyLineChange', () => {
  it('makes the header the sum of the lines: 120 + 80 kcal is 200 (R02.4)', () => {
    const toast = line('Toast', 50, 120, [4, 22, 1.5]);
    const egg = line('Egg', 55, 80, [7, 0.5, 5.5]);
    const draft = draftOf({ kcal: 120, protein: 4, carbs: 22, fat: 1.5, lines: [toast] });
    const next = applyLineChange(draft, [toast, egg]);
    expect(next.kcal).toBe(200);
    expect(next.protein).toBe(11);
    expect(next.carbs).toBe(22.5);
    expect(next.fat).toBe(7);
    expect(next.lines).toEqual([toast, egg]);
  });

  it('scales sodium by 300/400 when a 100 g line leaves a 400 g meal (R02.4)', () => {
    const beans = line('Beans', 300, 350, [21, 60, 2]);
    const cheese = line('Cheese', 100, 400, [25, 1, 33]);
    const draft = draftOf({
      kcal: 750,
      lines: [beans, cheese],
      nutrients: { sodium: 1_200, calcium: 640 },
      extras: { creatine: 2 },
    });
    const next = applyLineChange(draft, [beans]);
    expect(next.nutrients).toEqual({ sodium: 900, calcium: 480 });
    expect(next.extras).toEqual({ creatine: 1.5 });
    // Unknown nutrients stay unknown; they are never rebuilt from the lines.
    expect(next.nutrients.fibre).toBeUndefined();
    expect(next.kcal).toBe(350);
    expect(next.basis).toEqual({ kind: 'grams', grams: 300 });
  });

  it('leaves nutrients unchanged when the old lines weighed nothing', () => {
    const draft = draftOf({
      basis: { kind: 'grams', grams: 250 },
      nutrients: { sugar: 6, sodium: 400 },
    });
    const next = applyLineChange(draft, [line('Chicken', 120, 198, [37, 0, 4.3])]);
    expect(next.nutrients).toEqual({ sugar: 6, sodium: 400 });
    expect(next.basis).toEqual({ kind: 'grams', grams: 120 });
    expect(next.kcal).toBe(198);
  });

  it('sets known nutrients to 0 when the new lines weigh nothing, and keeps the serving', () => {
    const draft = draftOf({
      kcal: 198,
      lines: [line('Chicken', 120, 198)],
      basis: { kind: 'grams', grams: 120 },
      units: [{ unit: 'piece', gramsEach: 60, count: 2 }],
      chosenUnit: 'piece',
      chosenCount: 2,
      nutrients: { sugar: 6, sodium: 400 },
      extras: { taurine: 0.4 },
    });
    const emptied = applyLineChange(draft, []);
    expect(emptied.nutrients).toEqual({ sugar: 0, sodium: 0 });
    expect(emptied.extras).toEqual({ taurine: 0 });
    expect(emptied.nutrients.fibre).toBeUndefined();
    expect(emptied.kcal).toBe(0);
    expect(emptied.basis).toEqual({ kind: 'grams', grams: 120 });
    expect(emptied.units).toEqual(draft.units);
    expect(emptied.chosenUnit).toBe('piece');
    expect(emptied.chosenCount).toBe(2);
  });

  it('keeps the serving as it was when every new weight is unknown', () => {
    const draft = draftOf({
      basis: { kind: 'servings', count: 2 },
      lines: [line('Soup', 0, 180)],
      nutrients: { sodium: 700 },
    });
    const next = applyLineChange(draft, [line('Soup', 0, 180), line('Bread', 0, 90)]);
    expect(next.basis).toEqual({ kind: 'servings', count: 2 });
    expect(next.kcal).toBe(270);
    expect(next.nutrients).toEqual({ sodium: 700 });
  });

  it('drops units and the chosen unit, ending any recipe split, when the new weight is known', () => {
    const draft = draftOf({
      lines: [line('Beans', 300, 350), line('Beef', 100, 250)],
      units: [
        { unit: 'serving', gramsEach: 100, count: 4 },
        { unit: 'cup', gramsEach: 240 },
      ],
      chosenUnit: 'serving',
      chosenCount: 1,
    });
    const next = applyLineChange(draft, [line('Beans', 300, 350), line('Beef', 150, 375)]);
    expect(next.units).toEqual([]);
    expect('chosenUnit' in next).toBe(false);
    expect('chosenCount' in next).toBe(false);
    expect(next.basis).toEqual({ kind: 'grams', grams: 450 });
  });

  it('takes the lines as shown at the current scale', () => {
    // Stored at 250 g; the sheet shows double (500 g) and the person adds 100 g of rice there.
    const rice = line('Rice', 150, 195, [4, 42, 0.5]);
    const fish = line('Fish', 100, 140, [24, 0, 4.5]);
    const draft = draftOf({
      kcal: 335,
      basis: { kind: 'grams', grams: 250 },
      lines: [rice, fish],
      nutrients: { sugar: 5, omega3: 0.8 },
    });
    const shown = [scaleLine(rice, 2), scaleLine(fish, 2), line('Rice', 100, 130, [2.7, 28, 0.3])];
    const next = applyLineChange(draft, shown);
    expect(next.basis).toEqual({ kind: 'grams', grams: 600 });
    expect(next.kcal).toBe(390 + 280 + 130);
    expect(next.nutrients.sugar).toBeCloseTo(12, 10);
    expect(next.nutrients.omega3).toBeCloseTo(1.92, 10);
  });
});

describe('rescaleLine', () => {
  const baseline: LinePortion = { grams: 100, kcal: 133, protein: 4.7, carbs: 21.3, fat: 2.9 };

  it('gives 1.5× at 150 g from the unrounded baseline, twice in a row without drift', () => {
    const once = rescaleLine(baseline, 150);
    expect(once).toEqual({
      grams: 150,
      kcal: 199.5,
      protein: 4.7 * 1.5,
      carbs: 21.3 * 1.5,
      fat: 2.9 * 1.5,
    });
    expect(rescaleLine(baseline, 150)).toEqual(once);
    // Typing 1, 15 and then 150 lands on the same numbers.
    rescaleLine(baseline, 1);
    rescaleLine(baseline, 15);
    expect(rescaleLine(baseline, 150)).toEqual(once);
    expect(rescaleLine(baseline, 100)).toEqual(baseline);
  });

  it('doubles and halves every value', () => {
    expect(rescaleLine(baseline, 200)).toMatchObject({ grams: 200, kcal: 266 });
    expect(rescaleLine(baseline, 50)).toMatchObject({ grams: 50, kcal: 66.5 });
  });

  it('starts from the edited numbers once the person types a value', () => {
    const at150 = rescaleLine(baseline, 150);
    expect(at150).not.toBeNull();
    const edited: LinePortion = { ...(at150 as LinePortion), kcal: 210, protein: 9 };
    expect(rescaleLine(edited, 100)).toMatchObject({ grams: 100, kcal: 140, protein: 6 });
  });

  it('refuses weights that are not above 0, a 0 g baseline and results that overflow', () => {
    for (const grams of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_VALUE]) {
      expect(rescaleLine(baseline, grams), String(grams)).toBeNull();
    }
    expect(rescaleLine({ ...baseline, grams: 0 }, 100)).toBeNull();
    expect(rescaleLine({ ...baseline, kcal: LINE_VALUE_LIMIT - 1 }, 200)).toBeNull();
    expect(rescaleLine({ ...baseline, fat: -1 }, 200)).toBeNull();
  });
});

describe('validateLine', () => {
  const valid: LineFields = {
    name: 'Lentils',
    grams: 120,
    kcal: 139,
    protein: 10.8,
    carbs: 24,
    fat: 0.5,
  };

  it('accepts a named line with a weight and non-negative values', () => {
    expect(validateLine(valid)).toEqual([]);
    expect(validateLine({ ...valid, kcal: 0, protein: 0, carbs: 0, fat: 0 })).toEqual([]);
    expect(validateLine({ ...valid, kcal: LINE_VALUE_LIMIT - 1 })).toEqual([]);
  });

  it('names every field that blocks saving', () => {
    expect(validateLine({ ...valid, name: '   ' })).toEqual(['name']);
    expect(validateLine({ ...valid, grams: 0 })).toEqual(['grams']);
    expect(validateLine({ ...valid, grams: null })).toEqual(['grams']);
    expect(validateLine({ ...valid, grams: Number.POSITIVE_INFINITY })).toEqual(['grams']);
    expect(validateLine({ ...valid, kcal: LINE_VALUE_LIMIT })).toEqual(['kcal']);
    expect(validateLine({ ...valid, kcal: Number.NaN })).toEqual(['kcal']);
    expect(validateLine({ ...valid, protein: -0.1 })).toEqual(['protein']);
    expect(validateLine({ ...valid, carbs: null, fat: Number.NEGATIVE_INFINITY })).toEqual([
      'carbs',
      'fat',
    ]);
  });
});

describe('toLine', () => {
  it('saves a trimmed name and whole kcal with the line photos and emoji', () => {
    const fields: LineFields = {
      name: ' Lentils ',
      grams: 120,
      kcal: 139.4,
      protein: 10.8,
      carbs: 24,
      fat: 0.5,
    };
    expect(toLine(fields, { photoIds: ['p2'], emoji: '🥣' })).toEqual({
      name: 'Lentils',
      grams: 120,
      kcal: 139,
      protein: 10.8,
      carbs: 24,
      fat: 0.5,
      photoIds: ['p2'],
      emoji: '🥣',
    });
  });

  it('gives null while a field is invalid', () => {
    const fields: LineFields = { name: '', grams: 120, kcal: 139, protein: 1, carbs: 2, fat: 3 };
    expect(toLine(fields, { photoIds: [] })).toBeNull();
  });
});

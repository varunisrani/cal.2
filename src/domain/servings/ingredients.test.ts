import { describe, expect, it } from 'vitest';
import type { DiaryEntry, IngredientLine, NutritionDraft } from '../model';
import {
  LINE_KCAL_LIMIT,
  applyLineChange,
  lineAmounts,
  lineTotals,
  rescaleLine,
  stretchFactor,
  validateLine,
  type LineAmounts,
  type LineInput,
} from './ingredients';
import { scaleLine } from './scale';

const line = (
  name: string,
  grams: number,
  kcal: number,
  macros: { protein?: number; carbs?: number; fat?: number } = {},
): IngredientLine => ({
  name,
  grams,
  kcal,
  protein: macros.protein ?? 0,
  carbs: macros.carbs ?? 0,
  fat: macros.fat ?? 0,
  photoIds: [],
});

function draftOf(overrides: Partial<NutritionDraft> = {}): NutritionDraft {
  return {
    name: 'Bowl',
    kcal: 500,
    protein: 20,
    carbs: 60,
    fat: 15,
    nutrients: { sodium: 800, sugar: 12 },
    extras: { creatine: 2 },
    basis: { kind: 'grams', grams: 400 },
    units: [],
    lines: [],
    progressive: false,
    ...overrides,
  };
}

describe('lineTotals', () => {
  it('sums weight, kcal and macros; unknown weights add nothing', () => {
    const totals = lineTotals([
      line('Rice', 150, 120, { protein: 2.5, carbs: 26.25, fat: 0.4 }),
      line('Beans', 0, 80, { protein: 5.1, carbs: 14, fat: 0.35 }),
    ]);
    expect(totals.grams).toBe(150);
    expect(totals.kcal).toBe(200);
    expect(totals.protein).toBeCloseTo(7.6, 10);
    expect(totals.carbs).toBeCloseTo(40.25, 10);
    expect(totals.fat).toBeCloseTo(0.75, 10);
    expect(lineTotals([])).toEqual({ grams: 0, kcal: 0, protein: 0, carbs: 0, fat: 0 });
  });
});

describe('scaleLine', () => {
  it('scales lines with the header: grams, kcal rounded, macros unrounded', () => {
    const scaled = scaleLine(line('Rice', 150, 125, { protein: 3.3, carbs: 27.1, fat: 0.45 }), 1.5);
    expect(scaled).toMatchObject({ name: 'Rice', grams: 225, kcal: 188 });
    expect(scaled.protein).toBeCloseTo(4.95, 10);
    expect(scaled.carbs).toBeCloseTo(40.65, 10);
    expect(scaled.fat).toBeCloseTo(0.675, 10);
  });
});

describe('applyLineChange', () => {
  it('makes the header the sum of the lines: 120 + 80 kcal gives 200', () => {
    const next = [
      line('Rice', 150, 120, { protein: 2.5, carbs: 26 }),
      line('Beans', 100, 80, { protein: 5, carbs: 14, fat: 0.5 }),
    ];
    const changed = applyLineChange(draftOf({ basis: { kind: 'grams', grams: 250 } }), next);
    expect(changed.kcal).toBe(200);
    expect(changed.protein).toBe(7.5);
    expect(changed.carbs).toBe(40);
    expect(changed.fat).toBe(0.5);
    expect(changed.lines).toEqual(next);
  });

  it('takes the header from the lines at the current scale and stretches nutrients to match (R02.4)', () => {
    const base = [
      line('Rice', 200, 260, { protein: 5 }),
      line('Chicken', 200, 330, { protein: 62 }),
    ];
    const draft = draftOf({ lines: base });
    // The sheet shows the meal at twice its base amount and the person renames a line.
    const shown = base.map((part) => scaleLine(part, 2));
    const changed = applyLineChange(draft, [{ ...shown[0]!, name: 'Brown rice' }, shown[1]!]);
    expect(changed.kcal).toBe(1180);
    expect(changed.protein).toBe(134);
    expect(changed.basis).toEqual({ kind: 'grams', grams: 800 });
    expect(changed.nutrients).toEqual({ sodium: 1600, sugar: 24 });
    expect(changed.extras).toEqual({ creatine: 4 });
  });

  it('scales sodium by 300/400 when a 100 g line is removed from 400 g', () => {
    const lines = [line('Rice', 200, 260), line('Chicken', 100, 165), line('Sauce', 100, 75)];
    const draft = draftOf({ lines, nutrients: { sodium: 800, vitaminC: 6 } });
    const changed = applyLineChange(draft, lines.slice(0, 2));
    expect(changed.nutrients.sodium).toBe(600);
    expect(changed.nutrients.vitaminC).toBe(4.5);
    expect(changed.kcal).toBe(425);
    expect(changed.basis).toEqual({ kind: 'grams', grams: 300 });
  });

  it('never makes up nutrients the meal did not know (lines carry none)', () => {
    const lines = [line('Rice', 200, 260), line('Chicken', 200, 330)];
    const changed = applyLineChange(draftOf({ lines }), [lines[0]!]);
    expect(Object.keys(changed.nutrients).sort()).toEqual(['sodium', 'sugar']);
    expect('iron' in changed.nutrients).toBe(false);
  });

  it('leaves nutrients unchanged when the old lines weighed nothing', () => {
    // A plain meal gets its first line: there is no old line weight to compare with.
    const changed = applyLineChange(draftOf(), [line('Chicken', 100, 165)]);
    expect(changed.nutrients).toEqual({ sodium: 800, sugar: 12 });
    expect(changed.extras).toEqual({ creatine: 2 });
    expect(changed.basis).toEqual({ kind: 'grams', grams: 100 });
    expect(changed.kcal).toBe(165);
  });

  it('sets every known nutrient to 0 when the new lines weigh nothing, and keeps the serving', () => {
    const draft = draftOf({
      lines: [line('Chicken', 100, 165)],
      basis: { kind: 'grams', grams: 100 },
    });
    const emptied = applyLineChange(draft, []);
    expect(emptied.nutrients).toEqual({ sodium: 0, sugar: 0 });
    expect(emptied.extras).toEqual({ creatine: 0 });
    expect('iron' in emptied.nutrients).toBe(false);
    expect(emptied.kcal).toBe(0);
    expect(emptied.protein).toBe(0);
    expect(emptied.basis).toEqual({ kind: 'grams', grams: 100 });
  });

  it('with a new weight, clears the units and the chosen unit, which ends a recipe split', () => {
    const draft = draftOf({
      lines: [line('Beans', 1000, 1100), line('Beef', 1000, 2000)],
      basis: { kind: 'grams', grams: 2000 },
      units: [
        { unit: 'serving', gramsEach: 500 },
        { unit: 'cup', gramsEach: 240 },
      ],
      chosenUnit: 'serving',
      chosenCount: 1,
    });
    const changed = applyLineChange(draft, [line('Beans', 1000, 1100), line('Beef', 800, 1600)]);
    expect(changed.basis).toEqual({ kind: 'grams', grams: 1800 });
    expect(changed.units).toEqual([]);
    expect('chosenUnit' in changed).toBe(false);
    expect('chosenCount' in changed).toBe(false);
  });

  it('keeps the serving as it was when every new weight is unknown', () => {
    const draft = draftOf({
      lines: [line('Soup', 0, 300), line('Bread', 0, 200)],
      basis: { kind: 'servings', count: 2 },
      chosenCount: 2,
    });
    const changed = applyLineChange(draft, [line('Soup', 0, 300)]);
    expect(changed.basis).toEqual({ kind: 'servings', count: 2 });
    expect(changed.chosenCount).toBe(2);
    expect(changed.kcal).toBe(300);
    // No weight before or after: nutrients are left alone.
    expect(changed.nutrients).toEqual({ sodium: 800, sugar: 12 });

    const sliced = draftOf({
      lines: [line('Toast', 0, 90), line('Jam', 0, 40)],
      units: [{ unit: 'slice', gramsEach: 30 }],
      chosenUnit: 'slice',
      chosenCount: 2,
    });
    const kept = applyLineChange(sliced, [line('Toast', 0, 90)]);
    expect(kept.basis).toEqual(sliced.basis);
    expect(kept.units).toEqual(sliced.units);
    expect(kept.chosenUnit).toBe('slice');
  });

  it('keeps every other field of a diary entry', () => {
    const entry: DiaryEntry = {
      ...draftOf({ lines: [line('Rice', 200, 260)] }),
      id: 'e1',
      loggedAt: 1_700_000_000_000,
      dayKey: '2026-10-26',
      meal: 'lunch',
      source: 'photo',
      photoIds: ['p1'],
      note: 'leftovers',
    };
    const changed = applyLineChange(entry, [line('Rice', 100, 130)]);
    expect(changed).toMatchObject({
      id: 'e1',
      loggedAt: 1_700_000_000_000,
      dayKey: '2026-10-26',
      meal: 'lunch',
      source: 'photo',
      photoIds: ['p1'],
      note: 'leftovers',
      name: 'Bowl',
    });
  });
});

describe('stretchFactor', () => {
  it('is new ÷ old when both weights are positive', () => {
    expect(stretchFactor(400, 300)).toBe(0.75);
    expect(stretchFactor(150, 300)).toBe(2);
  });

  it('is null when the old weight is not positive and 0 when the new one is not', () => {
    expect(stretchFactor(0, 120)).toBeNull();
    expect(stretchFactor(-20, 120)).toBeNull();
    expect(stretchFactor(Number.NaN, 120)).toBeNull();
    expect(stretchFactor(120, 0)).toBe(0);
    expect(stretchFactor(120, -20)).toBe(0);
  });
});

describe('rescaleLine', () => {
  const baseline: LineAmounts = { grams: 100, kcal: 130, protein: 2.7, carbs: 28.2, fat: 0.3 };

  it('scales energy and macros in proportion to the weight', () => {
    const more = rescaleLine(baseline, 150)!;
    expect(more.grams).toBe(150);
    expect(more.kcal).toBe(195);
    expect(more.protein).toBeCloseTo(4.05, 10);
    expect(more.carbs).toBeCloseTo(42.3, 10);
    expect(more.fat).toBeCloseTo(0.45, 10);
    expect(rescaleLine(baseline, 50)).toMatchObject({ grams: 50, kcal: 65 });
  });

  it('rescales from the unrounded baseline every time, so typing never drifts', () => {
    expect(rescaleLine(baseline, 150)).toEqual(rescaleLine(baseline, 150));
    // Typing "1", "15", "150" gives the same numbers as typing 150 at once.
    for (const grams of [1, 15]) rescaleLine(baseline, grams);
    expect(rescaleLine(baseline, 150)).toEqual({
      grams: 150,
      kcal: 195,
      protein: 2.7 * 1.5,
      carbs: 28.2 * 1.5,
      fat: 0.3 * 1.5,
    });
    // Back to the first weight gives the baseline exactly.
    expect(rescaleLine(baseline, 100)).toEqual(baseline);
  });

  it('starts from the current numbers once a value is edited', () => {
    const doubled = rescaleLine(baseline, 200)!;
    const edited: LineAmounts = { ...doubled, kcal: 300, protein: 8 };
    expect(rescaleLine(edited, 100)).toEqual({ ...baseline, kcal: 150, protein: 4 });
  });

  it('refuses weights that are not positive and results that overflow', () => {
    for (const grams of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_VALUE]) {
      expect(rescaleLine(baseline, grams)).toBeNull();
    }
    expect(rescaleLine({ ...baseline, grams: 0 }, 100)).toBeNull();
    expect(rescaleLine({ ...baseline, kcal: LINE_KCAL_LIMIT - 1 }, 200)).toBeNull();
    expect(rescaleLine({ ...baseline, fat: -1 }, 200)).toBeNull();
  });

  it('seeds a baseline from a line', () => {
    expect(lineAmounts(line('Rice', 100, 130, { protein: 2.7, carbs: 28.2, fat: 0.3 }))).toEqual(
      baseline,
    );
  });
});

describe('validateLine', () => {
  const valid: LineInput = {
    name: ' Rice ',
    grams: 150,
    kcal: 195.4,
    protein: 4,
    carbs: 42,
    fat: 0,
  };

  it('accepts a named line with a weight and non-negative values, trimming and rounding', () => {
    expect(validateLine(valid)).toEqual({
      ok: true,
      value: { name: 'Rice', grams: 150, kcal: 195, protein: 4, carbs: 42, fat: 0 },
    });
  });

  it('refuses a blank name and a weight that is missing, 0, negative or not finite', () => {
    expect(validateLine({ ...valid, name: '   ' })).toEqual({ ok: false, error: ['name'] });
    for (const grams of [null, 0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(validateLine({ ...valid, grams })).toEqual({ ok: false, error: ['grams'] });
    }
  });

  it('refuses values that are missing, negative or not finite, and kcal from 2³¹ − 1', () => {
    for (const field of ['kcal', 'protein', 'carbs', 'fat'] as const) {
      for (const bad of [null, -0.1, Number.NaN, Number.POSITIVE_INFINITY]) {
        expect(validateLine({ ...valid, [field]: bad })).toEqual({ ok: false, error: [field] });
      }
    }
    expect(validateLine({ ...valid, kcal: LINE_KCAL_LIMIT })).toEqual({
      ok: false,
      error: ['kcal'],
    });
    expect(validateLine({ ...valid, kcal: LINE_KCAL_LIMIT - 1 }).ok).toBe(true);
  });

  it('lists every field that blocks saving, in field order', () => {
    expect(
      validateLine({ name: '', grams: 0, kcal: null, protein: -1, carbs: 2, fat: null }),
    ).toEqual({
      ok: false,
      error: ['name', 'grams', 'kcal', 'protein', 'fat'],
    });
  });
});

import { describe, expect, it } from 'vitest';
import type { IngredientLine, NutritionDraft } from '../model';
import {
  fromShown,
  initialAmount,
  reviewBase,
  scaleDraft,
  scaleLine,
  scaleOf,
  scaleRecord,
  scaleValues,
} from './scale';
import { initialUnit, pickerUnits, shownAmount, unitLabel } from './units';

function draftOf(overrides: Partial<NutritionDraft> = {}): NutritionDraft {
  return {
    name: 'Soup',
    kcal: 333,
    protein: 10.33,
    carbs: 20.17,
    fat: 5.05,
    nutrients: { sodium: 401.4, fibre: 3.33 },
    extras: { creatine: 0.25 },
    basis: { kind: 'grams', grams: 300 },
    units: [],
    lines: [],
    progressive: false,
    ...overrides,
  };
}

const line = (name: string, grams: number, kcal: number): IngredientLine => ({
  name,
  grams,
  kcal,
  protein: kcal / 20,
  carbs: kcal / 10,
  fat: kcal / 40,
  photoIds: [],
});

describe('reviewBase', () => {
  it('is the known weight', () => {
    expect(reviewBase(draftOf())).toBe(300);
  });

  it('is the serving count when the weight is unknown', () => {
    expect(reviewBase(draftOf({ basis: { kind: 'servings', count: 2 } }))).toBe(2);
  });

  it('falls back to the chosen count, then 1', () => {
    const broken = { kind: 'servings', count: 0 } as const;
    expect(reviewBase(draftOf({ basis: broken, chosenCount: 3 }))).toBe(3);
    expect(reviewBase(draftOf({ basis: broken }))).toBe(1);
    expect(reviewBase(draftOf({ basis: { kind: 'grams', grams: Number.NaN } }))).toBe(1);
  });
});

describe('reopening a saved entry', () => {
  it('reopens an unknown-weight entry at its serving count and never offers grams (R02.1)', () => {
    // Saved at 2 servings without a weight.
    const saved = draftOf({ basis: { kind: 'servings', count: 2 }, chosenUnit: 'slice' });
    const offered = pickerUnits(saved.basis, saved.units);
    const unit = initialUnit(saved, true);
    const quantity = initialAmount(saved, unit);

    expect(offered.map((pick) => pick.kind)).toEqual(['servings']);
    expect(unit.kind).toBe('servings');
    expect(quantity).toBe(2);
    expect(unitLabel(unit, quantity, { one: 'serving', other: 'servings' })).toBe('servings');
    expect(scaleOf(shownAmount(quantity, unit), reviewBase(saved))).toBe(1);
    // Logging it again at 3 servings keeps a serving count, never grams.
    expect(scaleDraft(saved, scaleOf(3, reviewBase(saved))).basis).toEqual({
      kind: 'servings',
      count: 3,
    });
  });

  it('reopens a known weight on its saved unit and count', () => {
    const saved = draftOf({
      basis: { kind: 'grams', grams: 120 },
      units: [{ unit: 'slice', gramsEach: 60, count: 2 }],
      chosenUnit: 'slice',
      chosenCount: 2,
    });
    const unit = initialUnit(saved, false);
    expect(unit).toEqual({ kind: 'unit', id: 'slice', amountEach: 60 });
    expect(initialAmount(saved, unit)).toBe(2);
    expect(scaleOf(shownAmount(2, unit), reviewBase(saved))).toBe(1);
  });

  it('opens other units at the base amount in that unit', () => {
    const saved = draftOf({
      basis: { kind: 'grams', grams: 120 },
      units: [{ unit: 'slice', gramsEach: 60 }],
      chosenUnit: 'slice',
      chosenCount: 2,
    });
    expect(initialAmount(saved, { kind: 'grams', id: 'g', amountEach: 1 })).toBe(120);
    expect(initialAmount(saved, { kind: 'unit', id: 'cup', amountEach: 240 })).toBe(0.5);
    expect(initialAmount({ ...saved, chosenCount: 0 }, initialUnit(saved, false))).toBe(2);
  });
});

describe('scaleOf', () => {
  it('is the shown amount over the base amount', () => {
    expect(scaleOf(600, 300)).toBe(2);
    expect(scaleOf(150, 300)).toBe(0.5);
    expect(scaleOf(3, 2)).toBe(1.5);
  });

  it('is 1 when the base is not a positive number or the shown amount is unusable', () => {
    expect(scaleOf(600, 0)).toBe(1);
    expect(scaleOf(600, Number.NaN)).toBe(1);
    expect(scaleOf(Number.NaN, 300)).toBe(1);
    expect(scaleOf(-10, 300)).toBe(1);
  });
});

describe('scaleValues', () => {
  it('rounds shown kcal and keeps macros, nutrients and extras unrounded (R02.25)', () => {
    const shown = scaleValues(draftOf(), 1.5);
    expect(shown.kcal).toBe(500); // 499.5 rounds up
    expect(shown.protein).toBeCloseTo(15.495, 10);
    expect(shown.carbs).toBeCloseTo(30.255, 10);
    expect(shown.fat).toBeCloseTo(7.575, 10);
    expect(shown.nutrients.sodium).toBeCloseTo(602.1, 10);
    expect(shown.nutrients.fibre).toBeCloseTo(4.995, 10);
    expect(shown.extras.creatine).toBeCloseTo(0.375, 10);
  });

  it('keeps unknown nutrients unknown, never 0', () => {
    const shown = scaleValues(draftOf(), 2);
    expect('iron' in shown.nutrients).toBe(false);
    expect(Object.keys(shown.nutrients).sort()).toEqual(['fibre', 'sodium']);
    expect(scaleRecord({}, 2)).toEqual({});
  });
});

describe('scaleDraft', () => {
  it('stores base × scale unrounded except kcal, so review and logged totals agree (R02.25)', () => {
    const base = draftOf({ lines: [line('Rice', 200, 233), line('Beans', 100, 100)] });
    const logged = scaleDraft(base, 1.5);
    const shown = scaleValues(base, 1.5);
    expect(logged).toMatchObject(shown);
    expect(logged.basis).toEqual({ kind: 'grams', grams: 450 });
    expect(logged.lines.map((part) => part.grams)).toEqual([300, 150]);
    expect(logged.lines.map((part) => part.kcal)).toEqual([350, 150]);
    expect(logged.name).toBe(base.name);
  });

  it('treats a scale that is not a positive number as 1', () => {
    const base = draftOf();
    expect(scaleDraft(base, 0)).toEqual(base);
    expect(scaleDraft(base, Number.NaN)).toEqual(base);
  });
});

describe('scaleLine', () => {
  it('scales grams and macros unrounded and rounds kcal', () => {
    const scaled = scaleLine({ ...line('Rice', 150, 195), emoji: 'r' }, 1 / 3);
    expect(scaled.grams).toBeCloseTo(50, 10);
    expect(scaled.kcal).toBe(65);
    expect(scaled.protein).toBeCloseTo(3.25, 10);
    expect(scaled.emoji).toBe('r');
  });
});

describe('fromShown', () => {
  it('stores a value typed at the shown amount divided by the scale (R02.3)', () => {
    expect(fromShown(300, 2)).toBe(150);
    expect(fromShown(40, 2)).toBe(20);
    expect(fromShown(301, 2)).toBe(150.5);
    // Shown again at the same scale, the typed value comes back exactly.
    expect(Math.round(fromShown(301, 2) * 2)).toBe(301);
  });

  it('treats a scale of 0 or less, or not finite, as 1 (R02.3)', () => {
    expect(fromShown(300, 0)).toBe(300);
    expect(fromShown(300, -2)).toBe(300);
    expect(fromShown(300, Number.NaN)).toBe(300);
    expect(fromShown(300, Number.POSITIVE_INFINITY)).toBe(300);
  });
});

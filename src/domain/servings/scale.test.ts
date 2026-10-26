import { describe, expect, it } from 'vitest';
import { formatMacro } from '../units/numbers';
import type { DiaryEntry, IngredientLine, NutritionDraft } from '../model';
import {
  baseFromTyped,
  draftAtAmount,
  initialAmount,
  reviewBase,
  scaledKcal,
  scaleFor,
  scaleLine,
  scaleValues,
  shownTenth,
} from './scale';
import { GRAMS_UNIT, pickerUnits, SERVING_COUNT_UNIT, switchUnit, withCount } from './units';

function draftOf(fields: Partial<NutritionDraft> = {}): NutritionDraft {
  return {
    name: 'Pizza',
    kcal: 480,
    protein: 20,
    carbs: 64,
    fat: 16,
    nutrients: {},
    extras: {},
    basis: { kind: 'grams', grams: 120 },
    units: [],
    lines: [],
    progressive: false,
    ...fields,
  };
}

const line = (fields: Partial<IngredientLine> = {}): IngredientLine => ({
  name: 'Rice',
  grams: 150,
  kcal: 195,
  protein: 4,
  carbs: 42,
  fat: 0.5,
  photoIds: [],
  ...fields,
});

describe('reviewBase', () => {
  it('is the known weight, else the serving count, else 1', () => {
    expect(reviewBase(draftOf())).toBe(120);
    expect(reviewBase(draftOf({ basis: { kind: 'servings', count: 2 } }))).toBe(2);
    expect(reviewBase(draftOf({ basis: { kind: 'servings', count: 0 } }))).toBe(1);
    expect(reviewBase(draftOf({ basis: { kind: 'servings', count: Number.NaN } }))).toBe(1);
    expect(reviewBase(draftOf({ basis: { kind: 'grams', grams: 0 } }))).toBe(1);
  });
});

describe('initialAmount', () => {
  it('reopens an unknown weight saved at 2 servings at 2 servings and never shows grams (R02.1)', () => {
    // Values known, weight not: the sheet opens at one serving.
    const restored = draftOf({
      name: 'Recovered meal',
      kcal: 420,
      basis: { kind: 'servings', count: 1 },
    });
    const opened = initialAmount(restored, true);
    expect(opened).toEqual({ unit: SERVING_COUNT_UNIT, count: 1, amount: 1 });

    // The person logs 2 servings.
    const saved = draftAtAmount(restored, withCount(opened, 2));
    expect(saved.basis).toEqual({ kind: 'servings', count: 2 });
    expect(saved.kcal).toBe(840);
    expect(saved.chosenUnit).toBeUndefined();

    // Reopened, 2 servings stay 2 servings at scale 1; grams are never offered or invented.
    const reopened = initialAmount(saved, false);
    expect(reopened).toEqual({ unit: SERVING_COUNT_UNIT, count: 2, amount: 2 });
    expect(pickerUnits(saved.basis, saved.units)).toEqual([SERVING_COUNT_UNIT]);
    expect(scaleFor(reopened.amount, reviewBase(saved))).toBe(1);
    expect(draftAtAmount(saved, reopened).kcal).toBe(840);
  });

  it('keeps a split serving with known grams a named unit when reopened (R02.2)', () => {
    const portion = draftOf({
      basis: { kind: 'grams', grams: 800 },
      units: [{ unit: 'serving', gramsEach: 400, count: 2 }],
      chosenUnit: 'serving',
      chosenCount: 2,
    });
    const opened = initialAmount(portion, false);
    expect(opened.unit).toEqual({ kind: 'unit', id: 'serving', gramsEach: 400 });
    expect(opened).toMatchObject({ count: 2, amount: 800 });
    expect(switchUnit(opened, GRAMS_UNIT).count).toBe(800);
  });

  it('opens a known unit at its stored count and amount', () => {
    const pizza = draftOf({
      units: [{ unit: 'slice', gramsEach: 60, count: 2 }],
      chosenUnit: 'slice',
      chosenCount: 2,
    });
    expect(initialAmount(pizza, false)).toEqual({
      unit: { kind: 'unit', id: 'slice', gramsEach: 60 },
      count: 2,
      amount: 120,
    });
    expect(initialAmount(pizza, true)).toEqual({ unit: GRAMS_UNIT, count: 120, amount: 120 });
  });

  it('writes the base in the opening unit when that is not the chosen one', () => {
    const soup = draftOf({
      basis: { kind: 'grams', grams: 360 },
      units: [{ unit: 'cup', gramsEach: 240 }],
      chosenUnit: 'bowl',
      chosenCount: 3,
    });
    expect(initialAmount(soup, false)).toEqual({
      unit: { kind: 'unit', id: 'cup', gramsEach: 240 },
      count: 1.5,
      amount: 360,
    });
  });
});

describe('scaleFor', () => {
  it('is shown amount ÷ base amount', () => {
    expect(scaleFor(240, 120)).toBe(2);
    expect(scaleFor(60, 120)).toBe(0.5);
    expect(scaleFor(0, 120)).toBe(0);
  });

  it('is 1 when the base is not above 0 or either amount is not usable', () => {
    expect(scaleFor(240, 0)).toBe(1);
    expect(scaleFor(240, -5)).toBe(1);
    expect(scaleFor(240, Number.NaN)).toBe(1);
    expect(scaleFor(Number.NaN, 120)).toBe(1);
    expect(scaleFor(Number.POSITIVE_INFINITY, 120)).toBe(1);
    expect(scaleFor(-10, 120)).toBe(1);
  });
});

describe('scaling values', () => {
  it('rounds energy to a whole kcal', () => {
    expect(scaledKcal(480, 1.5)).toBe(720);
    expect(scaledKcal(95, 0.5)).toBe(48);
    expect(scaledKcal(333, 1 / 3)).toBe(111);
  });

  it('keeps known values unrounded and unknown ones absent', () => {
    expect(scaleValues({ sodium: 333.33, fibre: 2.5 }, 1.5)).toEqual({
      sodium: 499.995,
      fibre: 3.75,
    });
    expect(scaleValues({ creatine: 5, taurine: Number.NaN }, 2)).toEqual({ creatine: 10 });
    expect(scaleValues({}, 2)).toEqual({});
  });

  it('scales a part: grams and macros unrounded, kcal whole, photos kept', () => {
    const part = line({ photoIds: ['p1'], emoji: '🍚' });
    expect(scaleLine(part, 1.5)).toEqual({
      name: 'Rice',
      grams: 225,
      kcal: 293,
      protein: 6,
      carbs: 63,
      fat: 0.75,
      photoIds: ['p1'],
      emoji: '🍚',
    });
  });

  it('rounds nutrients to 0.1 for display only', () => {
    expect(shownTenth(499.995)).toBe(500);
    expect(shownTenth(3.14159)).toBe(3.1);
    expect(shownTenth(undefined)).toBeNull();
    expect(shownTenth(Number.NaN)).toBeNull();
  });
});

describe('baseFromTyped', () => {
  it('stores typed 300 kcal at scale 2 as 150 (R02.3)', () => {
    expect(baseFromTyped(300, 2)).toBe(150);
    // Typed 40 g protein at double amount stores 20 g per base amount.
    expect(baseFromTyped(40, 2)).toBe(20);
    // The stored base does not double again on the next amount change.
    expect(scaledKcal(baseFromTyped(300, 2), 3)).toBe(450);
  });

  it('treats a scale of 0 or less as 1 (R02.3)', () => {
    expect(baseFromTyped(300, 0)).toBe(300);
    expect(baseFromTyped(300, -2)).toBe(300);
    expect(baseFromTyped(300, Number.NaN)).toBe(300);
    expect(baseFromTyped(300, Number.POSITIVE_INFINITY)).toBe(300);
  });

  it('keeps the typed base unrounded so the shown value reads back as typed (R02.25)', () => {
    const base = baseFromTyped(301, 2);
    expect(base).toBe(150.5);
    expect(scaledKcal(base, 2)).toBe(301);
  });
});

describe('draftAtAmount', () => {
  it('stores values unrounded so review, fit check and totals agree (R02.25)', () => {
    const bowl = draftOf({
      kcal: 333,
      protein: 12.34,
      carbs: 40.07,
      fat: 9.99,
      basis: { kind: 'grams', grams: 300 },
      nutrients: { sodium: 333.33, vitaminC: 1.234 },
      extras: { creatine: 0.37 },
    });
    const shown = { unit: GRAMS_UNIT, count: 450, amount: 450 };
    const scale = scaleFor(shown.amount, reviewBase(bowl));
    const stored = draftAtAmount(bowl, shown);

    // What the review shows at 1.5× ...
    const shownKcal = scaledKcal(bowl.kcal, scale);
    const shownProtein = formatMacro(bowl.protein * scale);
    const shownSodium = shownTenth((bowl.nutrients.sodium ?? 0) * scale);
    // ... is what the stored row shows, and the stored row is not rounded.
    expect(stored.kcal).toBe(shownKcal);
    expect(stored.kcal).toBe(500);
    expect(formatMacro(stored.protein)).toBe(shownProtein);
    expect(stored.protein).toBeCloseTo(18.51, 10);
    expect(stored.nutrients.sodium).toBeCloseTo(499.995, 10);
    expect(shownTenth(stored.nutrients.sodium)).toBe(shownSodium);
    expect(stored.nutrients.vitaminC).toBeCloseTo(1.851, 10);
    expect(stored.extras.creatine).toBeCloseTo(0.555, 10);
    expect(stored.nutrients.fibre).toBeUndefined();
    expect(stored.basis).toEqual({ kind: 'grams', grams: 450 });
  });

  it('stores a named unit as the chosen unit and refreshes unit counts', () => {
    const pizza = draftOf({
      units: [
        { unit: 'slice', gramsEach: 60, count: 2 },
        { unit: 'box', gramsEach: 480, count: 0.25 },
      ],
      chosenUnit: 'slice',
      chosenCount: 2,
    });
    const threeSlices = withCount(initialAmount(pizza, false), 3);
    const stored = draftAtAmount(pizza, threeSlices);
    expect(stored.basis).toEqual({ kind: 'grams', grams: 180 });
    expect(stored.chosenUnit).toBe('slice');
    expect(stored.chosenCount).toBe(3);
    expect(stored.kcal).toBe(720);
    expect(stored.units).toEqual([
      { unit: 'slice', gramsEach: 60, count: 3 },
      { unit: 'box', gramsEach: 480, count: 0.375 },
    ]);
  });

  it('drops the chosen unit when grams are shown', () => {
    const pizza = draftOf({
      units: [{ unit: 'slice', gramsEach: 60 }],
      chosenUnit: 'slice',
      chosenCount: 2,
    });
    const stored = draftAtAmount(pizza, { unit: GRAMS_UNIT, count: 90, amount: 90 });
    expect(stored.chosenUnit).toBeUndefined();
    expect(stored.chosenCount).toBeUndefined();
    expect('chosenUnit' in stored).toBe(false);
    expect(stored.basis).toEqual({ kind: 'grams', grams: 90 });
  });

  it('scales the parts with the header', () => {
    const bowl = draftOf({
      basis: { kind: 'grams', grams: 250 },
      lines: [
        line(),
        line({ name: 'Chicken', grams: 100, kcal: 165, protein: 31, carbs: 0, fat: 3.6 }),
      ],
    });
    const stored = draftAtAmount(bowl, { unit: GRAMS_UNIT, count: 125, amount: 125 });
    expect(stored.lines.map((part) => [part.grams, part.kcal])).toEqual([
      [75, 98],
      [50, 83],
    ]);
    expect(stored.lines[1]?.fat).toBeCloseTo(1.8, 10);
  });

  it('keeps the other fields of an entry', () => {
    const entry: DiaryEntry = {
      ...draftOf({ note: 'extra cheese' }),
      id: 'e-1',
      loggedAt: 1_000,
      dayKey: '2026-10-26',
      meal: 'lunch',
      source: 'photo',
      photoIds: ['p1'],
    };
    const stored = draftAtAmount(entry, { unit: GRAMS_UNIT, count: 60, amount: 60 });
    expect(stored).toMatchObject({
      id: 'e-1',
      loggedAt: 1_000,
      meal: 'lunch',
      note: 'extra cheese',
    });
    expect(stored.kcal).toBe(240);
  });

  it('leaves the draft as it is for an amount that is not above 0', () => {
    const pizza = draftOf();
    for (const amount of [0, -1, Number.NaN]) {
      expect(draftAtAmount(pizza, { unit: GRAMS_UNIT, count: amount, amount })).toBe(pizza);
    }
  });
});

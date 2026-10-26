import { describe, expect, it } from 'vitest';
import type { NutritionDraft, ServingBasis, UnitChoice } from '../model';
import {
  amountOf,
  countIn,
  findUnit,
  GRAMS_UNIT,
  initialUnit,
  isGramSpelling,
  isWeightKnown,
  MAX_UNIT_CHOICES,
  normaliseChoices,
  pickerUnits,
  SERVING_COUNT_UNIT,
  switchUnit,
  unitId,
  unitLabel,
  withCount,
  type PickerUnit,
  type ServingWord,
} from './units';

const WORD: ServingWord = { one: 'serving', other: 'servings' };
const grams = (n: number): ServingBasis => ({ kind: 'grams', grams: n });
const servings = (n: number): ServingBasis => ({ kind: 'servings', count: n });
const named = (id: string, gramsEach: number): PickerUnit => ({ kind: 'unit', id, gramsEach });

type ServingFields = Pick<NutritionDraft, 'basis' | 'units' | 'chosenUnit'>;
const draftWith = (fields: Partial<ServingFields>): ServingFields => ({
  basis: grams(120),
  units: [],
  ...fields,
});

describe('unitId', () => {
  it('trims and lower-cases a unit name', () => {
    expect(unitId(' Slice ')).toBe('slice');
    expect(unitId('FL OZ')).toBe('fl oz');
  });

  it('knows the three gram spellings in any case', () => {
    for (const name of ['g', 'G', ' gram ', 'Grams']) expect(isGramSpelling(name), name).toBe(true);
    for (const name of ['kg', 'gr', 'mg', '']) expect(isGramSpelling(name), name).toBe(false);
  });
});

describe('normaliseChoices', () => {
  it('keeps one slice from ["Slice", "slice", "g", {gramsEach: 0}]', () => {
    const list: UnitChoice[] = [
      { unit: 'Slice', gramsEach: 30 },
      { unit: 'slice', gramsEach: 45 },
      { unit: 'g', gramsEach: 1 },
      { unit: 'cup', gramsEach: 0 },
    ];
    expect(normaliseChoices(list, 60)).toEqual([{ unit: 'slice', gramsEach: 30, count: 2 }]);
  });

  it('keeps the first four of five valid units', () => {
    const list = ['slice', 'cup', 'piece', 'bowl', 'plate'].map((unit) => ({
      unit,
      gramsEach: 10,
    }));
    const kept = normaliseChoices(list, 100);
    expect(MAX_UNIT_CHOICES).toBe(4);
    expect(kept.map((choice) => choice.unit)).toEqual(['slice', 'cup', 'piece', 'bowl']);
  });

  it('drops gram spellings, empty names and weights that are not a positive number', () => {
    const list: UnitChoice[] = [
      { unit: 'Grams', gramsEach: 1 },
      { unit: ' gram', gramsEach: 1 },
      { unit: '   ', gramsEach: 50 },
      { unit: 'bar', gramsEach: -5 },
      { unit: 'cookie', gramsEach: Number.NaN },
      { unit: 'scoop', gramsEach: Number.POSITIVE_INFINITY },
      { unit: ' Cup ', gramsEach: 240 },
    ];
    expect(normaliseChoices(list, 480)).toEqual([{ unit: 'cup', gramsEach: 240, count: 2 }]);
  });

  it('keeps a positive count and fills a missing or unusable one from the base weight', () => {
    const list: UnitChoice[] = [
      { unit: 'slice', gramsEach: 40, count: 3 },
      { unit: 'cup', gramsEach: 240 },
      { unit: 'bowl', gramsEach: 300, count: 0 },
      { unit: 'piece', gramsEach: 60, count: -1 },
    ];
    expect(normaliseChoices(list, 120)).toEqual([
      { unit: 'slice', gramsEach: 40, count: 3 },
      { unit: 'cup', gramsEach: 240, count: 0.5 },
      { unit: 'bowl', gramsEach: 300, count: 0.4 },
      { unit: 'piece', gramsEach: 60, count: 2 },
    ]);
  });

  it('invents no count when the base weight is unknown', () => {
    for (const base of [0, -10, Number.NaN]) {
      expect(normaliseChoices([{ unit: 'slice', gramsEach: 40 }], base)).toEqual([
        { unit: 'slice', gramsEach: 40 },
      ]);
    }
  });
});

describe('pickerUnits', () => {
  it('offers grams first, then the named units, when the weight is known', () => {
    const units = pickerUnits(grams(120), [
      { unit: 'Slice', gramsEach: 60 },
      { unit: 'g', gramsEach: 1 },
      { unit: 'cup', gramsEach: 240 },
    ]);
    expect(units).toEqual([GRAMS_UNIT, named('slice', 60), named('cup', 240)]);
  });

  it('offers only the serving count when the weight is unknown, never grams (R02.1)', () => {
    const choices: UnitChoice[] = [{ unit: 'slice', gramsEach: 60 }];
    expect(pickerUnits(servings(2), choices)).toEqual([SERVING_COUNT_UNIT]);
    // A grams basis without a usable weight counts as unknown too.
    expect(pickerUnits(grams(0), choices)).toEqual([SERVING_COUNT_UNIT]);
    expect(pickerUnits(grams(Number.NaN), choices)).toEqual([SERVING_COUNT_UNIT]);
    expect(isWeightKnown(grams(0))).toBe(false);
    expect(isWeightKnown(servings(2))).toBe(false);
    expect(isWeightKnown(grams(0.5))).toBe(true);
  });

  it('keeps a recipe serving unit with known grams a named unit, not the servings basis (R02.2)', () => {
    const units = pickerUnits(grams(400), [{ unit: 'serving', gramsEach: 400 }]);
    expect(units).toEqual([GRAMS_UNIT, named('serving', 400)]);
    expect(units.some((unit) => unit.kind === 'servings')).toBe(false);
    // The serving count has its own kind, told apart by kind and not by name.
    expect(SERVING_COUNT_UNIT.kind).toBe('servings');
    expect(findUnit(units, 'Serving')).toEqual(named('serving', 400));
  });

  it('keeps the four-unit cap', () => {
    const list = ['a', 'b', 'c', 'd', 'e'].map((unit) => ({ unit, gramsEach: 10 }));
    expect(pickerUnits(grams(50), list)).toHaveLength(1 + MAX_UNIT_CHOICES);
  });
});

describe('initialUnit', () => {
  const units: UnitChoice[] = [
    { unit: 'slice', gramsEach: 60 },
    { unit: 'cup', gramsEach: 240 },
  ];

  it('opens an unknown weight in the serving count, whatever else is set (R02.1)', () => {
    const draft = draftWith({ basis: servings(2), units, chosenUnit: 'cup' });
    expect(initialUnit(draft, true)).toEqual(SERVING_COUNT_UNIT);
    expect(initialUnit(draft, false)).toEqual(SERVING_COUNT_UNIT);
  });

  it('opens in grams when the grams-first setting is on and the weight is known', () => {
    expect(initialUnit(draftWith({ units, chosenUnit: 'cup' }), true)).toEqual(GRAMS_UNIT);
  });

  it('opens in the chosen unit when it is offered, matching by id', () => {
    expect(initialUnit(draftWith({ units, chosenUnit: ' Cup' }), false)).toEqual(named('cup', 240));
    expect(initialUnit(draftWith({ units, chosenUnit: 'g' }), false)).toEqual(GRAMS_UNIT);
  });

  it('falls back to the first named unit, then grams', () => {
    expect(initialUnit(draftWith({ units, chosenUnit: 'bowl' }), false)).toEqual(
      named('slice', 60),
    );
    expect(initialUnit(draftWith({ units }), false)).toEqual(named('slice', 60));
    expect(initialUnit(draftWith({}), false)).toEqual(GRAMS_UNIT);
  });
});

describe('switchUnit', () => {
  it('keeps the grams and rewrites the count', () => {
    const slices = { unit: named('slice', 60), count: 2, amount: 120 };
    expect(switchUnit(slices, GRAMS_UNIT)).toEqual({ unit: GRAMS_UNIT, count: 120, amount: 120 });
    expect(switchUnit(slices, named('cup', 240))).toEqual({
      unit: named('cup', 240),
      count: 0.5,
      amount: 120,
    });
  });

  it('turns a typed count into the basis amount', () => {
    const shown = { unit: named('slice', 60), count: 2, amount: 120 };
    expect(withCount(shown, 3)).toEqual({ unit: named('slice', 60), count: 3, amount: 180 });
    expect(amountOf(GRAMS_UNIT, 85)).toBe(85);
    expect(amountOf(SERVING_COUNT_UNIT, 2)).toBe(2);
    expect(countIn(SERVING_COUNT_UNIT, 2)).toBe(2);
    expect(countIn(named('cup', 240), 360)).toBe(1.5);
  });
});

describe('unitLabel', () => {
  it('writes 1 piece, 2 pieces, 2 tbsp and 3 cups', () => {
    expect(unitLabel('piece', 1, WORD)).toBe('piece');
    expect(unitLabel('piece', 2, WORD)).toBe('pieces');
    expect(unitLabel('tbsp', 2, WORD)).toBe('tbsp');
    expect(unitLabel('cup', 3, WORD)).toBe('cups');
  });

  it('keeps the singular within 0.0001 of one and without a count', () => {
    expect(unitLabel('slice', 1.00005, WORD)).toBe('slice');
    expect(unitLabel('slice', 0.99995, WORD)).toBe('slice');
    expect(unitLabel('slice', undefined, WORD)).toBe('slice');
    expect(unitLabel('slice', 1.001, WORD)).toBe('slices');
    expect(unitLabel('slice', 0.5, WORD)).toBe('slices');
  });

  it('never changes metric and kitchen abbreviations', () => {
    for (const unit of [
      'g',
      'gram',
      'grams',
      'kg',
      'mg',
      'ml',
      'l',
      'oz',
      'fl oz',
      'tbsp',
      'tsp',
    ]) {
      expect(unitLabel(unit, 3, WORD), unit).toBe(unit);
    }
  });

  it('adds no second s to a name that ends in one', () => {
    expect(unitLabel('glass', 2, WORD)).toBe('glass');
    expect(unitLabel('nuggets', 6, WORD)).toBe('nuggets');
  });

  it('shows the serving word, singular or plural, for a serving', () => {
    expect(unitLabel('serving', 1, WORD)).toBe('serving');
    expect(unitLabel('serving', 2, WORD)).toBe('servings');
    expect(unitLabel(SERVING_COUNT_UNIT.id, 0.5, { one: 'Portion', other: 'Portionen' })).toBe(
      'Portionen',
    );
  });
});

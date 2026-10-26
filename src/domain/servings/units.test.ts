import { describe, expect, it } from 'vitest';
import type { NutritionDraft, ServingBasis, UnitChoice } from '../model';
import {
  GRAMS_PICK,
  MAX_UNITS,
  SERVINGS_PICK,
  basisFor,
  initialUnit,
  isGramUnit,
  normaliseChoices,
  pickFor,
  pickerUnits,
  shownAmount,
  switchUnit,
  unitId,
  unitLabel,
  weightKnown,
  withChoice,
  type PickerUnit,
} from './units';

const grams = (n: number): ServingBasis => ({ kind: 'grams', grams: n });
const servings = (n: number): ServingBasis => ({ kind: 'servings', count: n });
const unit = (id: string, gramsEach: number): PickerUnit => ({
  kind: 'unit',
  id,
  amountEach: gramsEach,
});
const WORDS = { one: 'serving', other: 'servings' };

describe('unitId and isGramUnit', () => {
  it('trims and lower-cases a unit name', () => {
    expect(unitId('  Slice ')).toBe('slice');
    expect(unitId('Fl Oz')).toBe('fl oz');
  });

  it('knows every spelling of grams', () => {
    for (const name of ['g', 'G', 'gram', ' Grams ']) expect(isGramUnit(name)).toBe(true);
    for (const name of ['kg', 'mg', 'grain', '']) expect(isGramUnit(name)).toBe(false);
  });
});

describe('basisFor and weightKnown', () => {
  it('makes a grams basis only for a finite weight above 0', () => {
    expect(basisFor(250)).toEqual(grams(250));
    expect(weightKnown(grams(250))).toBe(true);
  });

  it('keeps a missing or broken weight a serving count, never 100 g (R02.1)', () => {
    for (const weight of [undefined, null, 0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(basisFor(weight)).toEqual(servings(1));
    }
    expect(basisFor(undefined, 2)).toEqual(servings(2));
    expect(basisFor(0, 0)).toEqual(servings(1));
    expect(weightKnown(servings(2))).toBe(false);
    expect(weightKnown(grams(0))).toBe(false);
    expect(weightKnown(grams(Number.NaN))).toBe(false);
  });
});

describe('normaliseChoices', () => {
  it('keeps one slice from ["Slice", "slice", "g", a unit of 0 g]', () => {
    const list: UnitChoice[] = [
      { unit: 'Slice', gramsEach: 30 },
      { unit: 'slice', gramsEach: 25 },
      { unit: 'g', gramsEach: 1 },
      { unit: 'cup', gramsEach: 0 },
    ];
    expect(normaliseChoices(list, 90)).toEqual([{ unit: 'slice', gramsEach: 30, count: 3 }]);
  });

  it('drops gram spellings, empty names and weights that are not finite and above 0', () => {
    const list: UnitChoice[] = [
      { unit: ' Grams ', gramsEach: 1 },
      { unit: 'gram', gramsEach: 1 },
      { unit: '   ', gramsEach: 10 },
      { unit: 'cup', gramsEach: -240 },
      { unit: 'bowl', gramsEach: Number.NaN },
      { unit: 'pot', gramsEach: Number.POSITIVE_INFINITY },
      { unit: '  Cup ', gramsEach: 240 },
    ];
    expect(normaliseChoices(list, 0)).toEqual([{ unit: 'cup', gramsEach: 240 }]);
  });

  it('keeps the first four of five valid units', () => {
    const list = ['a', 'b', 'c', 'd', 'e'].map((name) => ({ unit: name, gramsEach: 10 }));
    const kept = normaliseChoices(list, 0);
    expect(kept).toHaveLength(MAX_UNITS);
    expect(kept.map((choice) => choice.unit)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('fills a missing or unusable count from the base weight, and keeps a given one', () => {
    const list: UnitChoice[] = [
      { unit: 'slice', gramsEach: 30, count: 2 },
      { unit: 'cup', gramsEach: 240 },
      { unit: 'piece', gramsEach: 40, count: 0 },
      { unit: 'bar', gramsEach: 60, count: Number.NaN },
    ];
    expect(normaliseChoices(list, 120)).toEqual([
      { unit: 'slice', gramsEach: 30, count: 2 },
      { unit: 'cup', gramsEach: 240, count: 0.5 },
      { unit: 'piece', gramsEach: 40, count: 3 },
      { unit: 'bar', gramsEach: 60, count: 2 },
    ]);
  });

  it('leaves the count out when the base weight is unknown', () => {
    expect(normaliseChoices([{ unit: 'cup', gramsEach: 240 }], Number.NaN)).toEqual([
      { unit: 'cup', gramsEach: 240 },
    ]);
  });
});

describe('pickerUnits', () => {
  it('offers grams first, then the named units, when the weight is known', () => {
    const units: UnitChoice[] = [
      { unit: 'Slice', gramsEach: 30 },
      { unit: 'g', gramsEach: 1 },
      { unit: 'cup', gramsEach: 240 },
    ];
    expect(pickerUnits(grams(120), units)).toEqual([
      GRAMS_PICK,
      unit('slice', 30),
      unit('cup', 240),
    ]);
    expect(pickerUnits(grams(120), [])).toEqual([GRAMS_PICK]);
  });

  it('offers only the serving count when the weight is unknown, never grams (R02.1)', () => {
    const units: UnitChoice[] = [{ unit: 'slice', gramsEach: 30 }];
    expect(pickerUnits(servings(2), units)).toEqual([SERVINGS_PICK]);
    expect(pickerUnits(grams(0), units)).toEqual([SERVINGS_PICK]);
    expect(pickerUnits(servings(1), [])).toEqual([SERVINGS_PICK]);
  });

  it('treats a recipe "serving" unit with known grams as a unit choice, not the serving count (R02.2)', () => {
    const picks = pickerUnits(grams(2000), [{ unit: 'serving', gramsEach: 250 }]);
    expect(picks).toEqual([GRAMS_PICK, { kind: 'unit', id: 'serving', amountEach: 250 }]);
    expect(picks.some((pick) => pick.kind === 'servings')).toBe(false);
  });
});

describe('initialUnit', () => {
  const slices: UnitChoice[] = [
    { unit: 'slice', gramsEach: 30 },
    { unit: 'cup', gramsEach: 240 },
  ];

  it('opens on grams when grams-first is on and the weight is known', () => {
    expect(initialUnit({ basis: grams(60), units: slices, chosenUnit: 'cup' }, true)).toEqual(
      GRAMS_PICK,
    );
  });

  it('otherwise opens on the chosen unit when it is offered, matched by id', () => {
    expect(initialUnit({ basis: grams(60), units: slices, chosenUnit: ' Cup' }, false)).toEqual(
      unit('cup', 240),
    );
    expect(initialUnit({ basis: grams(60), units: slices, chosenUnit: 'g' }, false)).toEqual(
      GRAMS_PICK,
    );
  });

  it('falls back to the first named unit, then grams', () => {
    expect(initialUnit({ basis: grams(60), units: slices, chosenUnit: 'bowl' }, false)).toEqual(
      unit('slice', 30),
    );
    expect(initialUnit({ basis: grams(60), units: slices }, false)).toEqual(unit('slice', 30));
    expect(initialUnit({ basis: grams(60), units: [] }, false)).toEqual(GRAMS_PICK);
  });

  it('always opens an unknown weight on the serving count, even with grams-first (R02.1)', () => {
    expect(initialUnit({ basis: servings(2), units: slices, chosenUnit: 'slice' }, true)).toEqual(
      SERVINGS_PICK,
    );
    expect(initialUnit({ basis: servings(2), units: [] }, false)).toEqual(SERVINGS_PICK);
  });
});

describe('switching units', () => {
  it('keeps the amount when the unit changes', () => {
    expect(switchUnit(2, unit('slice', 30), GRAMS_PICK)).toBe(60);
    expect(switchUnit(60, GRAMS_PICK, unit('slice', 30))).toBe(2);
    expect(switchUnit(1, unit('cup', 240), unit('slice', 30))).toBe(8);
    expect(shownAmount(1.5, unit('cup', 240))).toBe(360);
  });
});

describe('withChoice', () => {
  const draft: Pick<NutritionDraft, 'basis' | 'units' | 'chosenUnit' | 'chosenCount'> = {
    basis: grams(60),
    units: [{ unit: 'slice', gramsEach: 30 }],
    chosenUnit: 'cup',
    chosenCount: 3,
  };

  it('records a named unit with its quantity', () => {
    expect(withChoice(draft, pickFor({ unit: 'slice', gramsEach: 30 }), 2)).toEqual({
      ...draft,
      chosenUnit: 'slice',
      chosenCount: 2,
    });
  });

  it('records grams and the serving count by leaving both fields out', () => {
    for (const pick of [GRAMS_PICK, SERVINGS_PICK]) {
      const chosen = withChoice(draft, pick, 60);
      expect(chosen).toEqual({ basis: draft.basis, units: draft.units });
      expect('chosenUnit' in chosen).toBe(false);
      expect('chosenCount' in chosen).toBe(false);
    }
  });
});

describe('unitLabel', () => {
  it('leaves a unit unchanged at one, or within 0.0001 of one, or with no quantity', () => {
    expect(unitLabel(unit('piece', 40), 1, WORDS)).toBe('piece');
    expect(unitLabel(unit('slice', 30), 1.00009, WORDS)).toBe('slice');
    expect(unitLabel(unit('slice', 30), 0.99991, WORDS)).toBe('slice');
    expect(unitLabel(unit('cup', 240), null, WORDS)).toBe('cup');
  });

  it('writes 2 pieces, 3 cups, and keeps a unit that already ends in s', () => {
    expect(unitLabel(unit('piece', 40), 2, WORDS)).toBe('pieces');
    expect(unitLabel(unit('cup', 240), 3, WORDS)).toBe('cups');
    expect(unitLabel(unit('slice', 30), 1.5, WORDS)).toBe('slices');
    expect(unitLabel(unit('glass', 250), 2, WORDS)).toBe('glass');
    expect(unitLabel(unit('slice', 30), 1.0002, WORDS)).toBe('slices');
  });

  it('never pluralises metric and kitchen abbreviations', () => {
    for (const id of ['g', 'gram', 'grams', 'kg', 'mg', 'ml', 'l', 'oz', 'fl oz', 'tbsp', 'tsp']) {
      expect(unitLabel(unit(id, 1), 2, WORDS)).toBe(id);
    }
    expect(unitLabel(GRAMS_PICK, 150, WORDS)).toBe('g');
  });

  it('uses the catalogue serving words for the serving count and a split serving unit', () => {
    expect(unitLabel(SERVINGS_PICK, 1, WORDS)).toBe('serving');
    expect(unitLabel(SERVINGS_PICK, 2, WORDS)).toBe('servings');
    expect(unitLabel(SERVINGS_PICK, null, WORDS)).toBe('serving');
    expect(unitLabel(unit('serving', 250), 2, { one: 'portion', other: 'portions' })).toBe(
      'portions',
    );
  });
});

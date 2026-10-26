import { describe, expect, it } from 'vitest';
import { parseModelJson } from './json';
import { LABEL_REPLY_KEYS, readLabelReply, type LabelReading } from './labelReply';

/** A granola label in our label contract; tests override single keys. */
function label(
  per100g: Record<string, unknown> = {},
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    name: 'Oat and honey granola',
    per100g: {
      kcal: 250,
      protein: 8.3,
      carbs: 61,
      fat: 14.2,
      nutrients: { sodium: 412, fibre: 3.33, sugar: 21.06, creatine: 0 },
      ...per100g,
    },
    servingGrams: 40,
    units: [{ unit: 'Bar', count: 1, gramsEach: 40 }],
    ...overrides,
  };
}

/** The reading for a label at `grams`, failing the test when it was refused. */
function readingOf(reply: unknown, grams: number): LabelReading {
  const result = readLabelReply(reply, grams);
  if (!result.ok) throw new Error(`refused: ${result.error.kind}`);
  return result.value;
}

const REFUSED = { ok: false, error: { kind: 'invalidResponse' } };

describe('readLabelReply: per-100 g values scaled to the serving (R03.24)', () => {
  it('gives 75 kcal for 250 kcal per 100 g at 30 g', () => {
    expect(readingOf(label(), 30).draft.kcal).toBe(75);
  });

  it('gives 110 kcal for 333 kcal per 100 g at 33 g: rounded, not cut down to 109', () => {
    expect(readingOf(label({ kcal: 333 }), 33).draft.kcal).toBe(110);
    expect(readingOf(label({ kcal: 333 }), 15).draft.kcal).toBe(50);
  });

  it('leaves the macros unrounded and rounds nutrients and extras to 0.1', () => {
    const { draft } = readingOf(label(), 30);
    expect(draft.protein).toBeCloseTo(2.49, 10);
    expect(draft.carbs).toBeCloseTo(18.3, 10);
    expect(draft.fat).toBeCloseTo(4.26, 10);
    expect(draft.nutrients).toEqual({ sodium: 123.6, fibre: 1, sugar: 6.3 });
    expect(draft.extras).toEqual({ creatine: 0 });
  });

  it('builds a draft of the serving: its weight known, no parts, not progressive', () => {
    const { draft } = readingOf(label(), 30);
    expect(draft).toMatchObject({
      name: 'Oat and honey granola',
      basis: { kind: 'grams', grams: 30 },
      lines: [],
      progressive: false,
    });
  });

  it('reads numeric strings and an answer wrapped in prose', () => {
    const text = `From the label:\n${JSON.stringify(label({ kcal: '480', protein: '10' }))}`;
    const parsed = parseModelJson(text);
    if (!parsed.ok) throw new Error('did not parse');
    expect(readingOf(parsed.value, 50).draft).toMatchObject({ kcal: 240, protein: 5 });
  });

  it('drops a nutrient that is negative or not a number', () => {
    const { draft } = readingOf(
      label({ nutrients: { sodium: -4, iron: 'some', calcium: null, potassium: 300 } }),
      50,
    );
    expect(draft.nutrients).toEqual({ potassium: 150 });
  });

  it('uses the printed serving when no serving was chosen, and 100 g without one', () => {
    for (const grams of [0, -5, Number.NaN]) {
      expect(readingOf(label(), grams).draft.basis, String(grams)).toEqual({
        kind: 'grams',
        grams: 40,
      });
    }
    const unprinted = readingOf(label({}, { servingGrams: null }), 0).draft;
    expect(unprinted.basis).toEqual({ kind: 'grams', grams: 100 });
    expect(unprinted.kcal).toBe(250);
  });

  it('lists our label keys', () => {
    expect(LABEL_REPLY_KEYS).toEqual({
      name: 'name',
      per100g: 'per100g',
      servingGrams: 'servingGrams',
      units: 'units',
    });
  });
});

describe('readLabelReply: the first unit is chosen, its count from the serving', () => {
  it('chooses the first unit with grams ÷ grams each as its count', () => {
    const reading = readingOf(
      label(
        {},
        {
          units: [
            { unit: 'Bar', count: 1, gramsEach: 40 },
            { unit: 'square', count: 8, gramsEach: 5 },
          ],
        },
      ),
      60,
    );
    expect(reading.needsRepair).toBe(false);
    expect(reading.draft.units).toEqual([
      { unit: 'bar', gramsEach: 40, count: 1.5 },
      { unit: 'square', gramsEach: 5, count: 12 },
    ]);
    expect(reading.draft).toMatchObject({ chosenUnit: 'bar', chosenCount: 1.5 });
  });

  it('checks the units against the printed serving, not the chosen one', () => {
    const fits = readingOf(label({}, { units: [{ unit: 'bar', count: 1, gramsEach: 40 }] }), 90);
    expect(fits.needsRepair).toBe(false);
    const misfit = readingOf(label({}, { units: [{ unit: 'bar', count: 1, gramsEach: 90 }] }), 90);
    expect(misfit.needsRepair).toBe(true);
    expect(misfit.draft.units).toEqual([]);
    expect(misfit.draft).not.toHaveProperty('chosenUnit');
  });

  it('reads an empty list as complete and a mangled one as needing repair', () => {
    expect(readingOf(label({}, { units: [] }), 30)).toMatchObject({
      needsRepair: false,
      draft: { units: [] },
    });
    for (const units of [undefined, ['bar'], [{ unit: 'bar', count: '1', gramsEach: 40 }]]) {
      const reading = readingOf(label({}, { units }), 30);
      expect(reading.needsRepair, JSON.stringify(units)).toBe(true);
      expect(reading.draft.units).toEqual([]);
    }
  });
});

describe('readLabelReply: an unusable label is invalid (D-16.58)', () => {
  it('refuses a missing or blank name', () => {
    expect(readLabelReply(label({}, { name: '  ' }), 30)).toEqual(REFUSED);
    expect(readLabelReply(label({}, { name: undefined }), 30)).toEqual(REFUSED);
  });

  it('refuses a missing per-100 g block', () => {
    expect(readLabelReply(label({}, { per100g: undefined }), 30)).toEqual(REFUSED);
    expect(readLabelReply(label({}, { per100g: [250, 8, 61, 14] }), 30)).toEqual(REFUSED);
  });

  it('refuses kcal or a macro that is missing, not a number or negative', () => {
    const bad: Record<string, unknown>[] = [
      { kcal: undefined },
      { protein: 'lots' },
      { carbs: null },
      { fat: -1 },
      { kcal: true },
    ];
    for (const values of bad) {
      expect(readLabelReply(label(values), 30), JSON.stringify(values)).toEqual(REFUSED);
    }
  });

  it('refuses an answer that is not an object', () => {
    for (const reply of [null, 'granola', [label()]]) {
      expect(readLabelReply(reply, 30)).toEqual(REFUSED);
    }
  });
});

import { describe, expect, it } from 'vitest';
import type { NutrientValues } from '../model';
import { sugarOfDay } from './sugar';

/** A food with these optional nutrients and nothing else. */
const food = (nutrients: NutrientValues = {}) => ({ nutrients });

describe('sugarOfDay (D-16.98)', () => {
  it('sums sugar over the foods that carry it and counts them', () => {
    expect(
      sugarOfDay([food({ sugar: 12 }), food({ sugar: 20.5, fibre: 3 }), food({ sugar: 0.25 })]),
    ).toEqual({ foods: 3, withFigure: 3, grams: 32.75, addedGrams: null });
  });

  it('never counts a food without a sugar figure as 0 g: it is left out and counted apart', () => {
    const day = sugarOfDay([
      food({ sugar: 18 }),
      food({ fibre: 14, sodium: 820 }),
      food({ sugar: 14 }),
      food(),
      food({ sugar: 0 }),
      food({ addedSugar: 6 }),
    ]);
    expect(day).toEqual({ foods: 6, withFigure: 3, grams: 32, addedGrams: 6 });
  });

  it('gives no grams, rather than 0 g, when the day has foods but none has a figure', () => {
    expect(sugarOfDay([food({ fibre: 2 }), food()])).toEqual({
      foods: 2,
      withFigure: 0,
      grams: null,
      addedGrams: null,
    });
  });

  it('takes 0 g as a figure, for sugar and for added sugar', () => {
    expect(sugarOfDay([food({ sugar: 0, addedSugar: 0 }), food()])).toEqual({
      foods: 2,
      withFigure: 1,
      grams: 0,
      addedGrams: 0,
    });
  });

  it('ignores a figure that is not a finite amount of 0 or more', () => {
    const day = sugarOfDay([
      food({ sugar: Number.NaN, addedSugar: Number.NaN }),
      food({ sugar: Number.POSITIVE_INFINITY }),
      food({ sugar: -4, addedSugar: -1 }),
      food({ sugar: 9 }),
    ]);
    expect(day).toEqual({ foods: 4, withFigure: 1, grams: 9, addedGrams: null });
  });

  it('sums added sugar over the foods that carry it, whether or not they carry sugar', () => {
    expect(
      sugarOfDay([food({ sugar: 30, addedSugar: 10 }), food({ addedSugar: 2.5 }), food()]),
    ).toEqual({ foods: 3, withFigure: 1, grams: 30, addedGrams: 12.5 });
  });

  it('has nothing on a day without food', () => {
    expect(sugarOfDay([])).toEqual({ foods: 0, withFigure: 0, grams: null, addedGrams: null });
  });
});

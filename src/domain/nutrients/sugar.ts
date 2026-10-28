// A day's sugar as far as it is known (D-16.98). Sugar is an optional nutrient: the analysis, a
// label or a barcode may give a food a figure, a manual entry never does. A food without the figure
// is unknown, never 0 g, so the sums run only over the foods that have one and say how many did.
// Home's Sugar line and the Coach's facts both read this.

import type { DiaryEntry } from '../model';

export interface DaySugar {
  /** How many food entries the day has. */
  readonly foods: number;
  /** How many of them carry a sugar figure. */
  readonly withFigure: number;
  /** Grams of sugar over the foods with a figure; null when no food has one. */
  readonly grams: number | null;
  /** Grams of added sugar over the foods with that figure; null when no food has one. */
  readonly addedGrams: number | null;
}

/**
 * A stored figure that can be counted: a finite number of 0 or more (0 g is a figure). Every
 * other value, missing included, is no figure. The nutrient sources (D-16.105) read it too.
 */
export function figure(value: number | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

/** The sugar of a day's food entries: the sums over the foods that know it, and the counts. */
export function sugarOfDay(entries: readonly Pick<DiaryEntry, 'nutrients'>[]): DaySugar {
  let withFigure = 0;
  let grams: number | null = null;
  let addedGrams: number | null = null;
  for (const entry of entries) {
    const sugar = figure(entry.nutrients.sugar);
    if (sugar !== null) {
      withFigure += 1;
      grams = (grams ?? 0) + sugar;
    }
    const added = figure(entry.nutrients.addedSugar);
    if (added !== null) addedGrams = (addedGrams ?? 0) + added;
  }
  return { foods: entries.length, withFigure, grams, addedGrams };
}

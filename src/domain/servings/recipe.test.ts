import { describe, expect, it } from 'vitest';
import type { IngredientLine, NutritionDraft } from '../model';
import { lineTotals } from './ingredients';
import {
  canSplit,
  clampServings,
  isLoggedPortion,
  keepSplit,
  SPLIT_MAX,
  SPLIT_MIN,
  splitRecipe,
} from './recipe';
import { draftAtAmount, initialAmount, reviewBase, scaleFor, scaleLine } from './scale';
import { GRAMS_UNIT, withCount, type PickerUnit } from './units';

const line = (name: string, grams: number, kcal: number, protein = 0): IngredientLine => ({
  name,
  grams,
  kcal,
  protein,
  carbs: 0,
  fat: 0,
  photoIds: [],
});

// A 2 kg pot of dal.
const POT: IngredientLine[] = [
  line('Lentils', 1_200, 1_392, 108),
  line('Onion', 300, 120, 3),
  line('Stock', 500, 40, 2),
];

function potDraft(fields: Partial<NutritionDraft> = {}): NutritionDraft {
  const totals = lineTotals(POT);
  return {
    name: 'Dal',
    kcal: totals.kcal,
    protein: totals.protein,
    carbs: totals.carbs,
    fat: totals.fat,
    nutrients: { sodium: 2_000 },
    extras: {},
    basis: { kind: 'grams', grams: totals.grams },
    units: [],
    lines: POT,
    progressive: false,
    ...fields,
  };
}

const servingOf = (gramsEach: number): PickerUnit => ({ kind: 'unit', id: 'serving', gramsEach });

/** The pot's lines as a sheet shows them at `scale`, with the onion changed to `onionGrams`. */
function shownWithOnion(scale: number, onionGrams: number): IngredientLine[] {
  const shown = POT.map((part) => scaleLine(part, scale));
  const onion = shown[1] as IngredientLine;
  shown[1] = scaleLine(onion, onionGrams / onion.grams);
  return shown;
}

describe('clampServings', () => {
  it('holds the stepper to whole numbers from 1 to 50', () => {
    expect([SPLIT_MIN, SPLIT_MAX]).toEqual([1, 50]);
    expect(clampServings(0)).toBe(1);
    expect(clampServings(-3)).toBe(1);
    expect(clampServings(80)).toBe(50);
    expect(clampServings(2.7)).toBe(2);
    expect(clampServings(Number.NaN)).toBe(1);
  });
});

describe('splitRecipe', () => {
  it('splits a 2 kg pot into 8: a 250 g serving first, selected with count 1', () => {
    const split = splitRecipe(potDraft({ units: [{ unit: 'cup', gramsEach: 240 }] }), 8);
    expect(split).not.toBeNull();
    expect(split?.servings).toBe(8);
    expect(split?.draft.units).toEqual([
      { unit: 'serving', gramsEach: 250, count: 8 },
      { unit: 'cup', gramsEach: 240, count: 2_000 / 240 },
    ]);
    expect(split?.shown).toEqual({ unit: servingOf(250), count: 1, amount: 250 });
    expect(split?.draft.chosenUnit).toBe('serving');
    expect(split?.draft.chosenCount).toBe(1);
    // The values still describe the whole pot; one serving is an eighth of it.
    expect(split?.draft.basis).toEqual({ kind: 'grams', grams: 2_000 });
    expect(scaleFor(250, reviewBase(potDraft()))).toBe(0.125);
  });

  it('replaces an earlier serving unit and keeps the others after it', () => {
    const draft = potDraft({
      units: [
        { unit: 'cup', gramsEach: 240 },
        { unit: ' Serving', gramsEach: 400, count: 5 },
      ],
    });
    const units = splitRecipe(draft, 4)?.draft.units ?? [];
    expect(units.map((choice) => choice.unit)).toEqual(['serving', 'cup']);
    expect(units[0]?.gramsEach).toBe(500);
  });

  it('puts the serving first so the four-unit cap keeps it', () => {
    const draft = potDraft({
      units: ['cup', 'bowl', 'ladle', 'mug'].map((unit) => ({ unit, gramsEach: 200 })),
    });
    const units = splitRecipe(draft, 10)?.draft.units ?? [];
    expect(units.map((choice) => choice.unit)).toEqual(['serving', 'cup', 'bowl', 'ladle']);
  });

  it('clamps the servings count', () => {
    expect(splitRecipe(potDraft(), 0)?.shown.amount).toBe(2_000);
    expect(splitRecipe(potDraft(), 80)?.shown.amount).toBe(40);
    expect(splitRecipe(potDraft(), 80)?.servings).toBe(50);
  });

  it('refuses a draft whose weight is unknown', () => {
    expect(splitRecipe(potDraft({ basis: { kind: 'servings', count: 2 } }), 4)).toBeNull();
  });
});

describe('canSplit', () => {
  it('needs two lines and a known weight above 0', () => {
    expect(canSplit(potDraft())).toBe(true);
    expect(canSplit(potDraft({ lines: POT.slice(0, 2) }))).toBe(true);
    expect(canSplit(potDraft({ lines: POT.slice(0, 1) }))).toBe(false);
    expect(canSplit(potDraft({ basis: { kind: 'grams', grams: 0 } }))).toBe(false);
    expect(canSplit(potDraft({ basis: { kind: 'grams', grams: Number.NaN } }))).toBe(false);
    // The serving count of an unknown weight is not a recipe serving (R02.2).
    expect(canSplit(potDraft({ basis: { kind: 'servings', count: 3 } }))).toBe(false);
  });

  it('refuses a re-logged portion, which would divide the portion again (R02.6)', () => {
    const split = splitRecipe(potDraft(), 8);
    expect(split).not.toBeNull();
    if (split === null) return;
    const logged = draftAtAmount(split.draft, split.shown);
    expect(logged.basis).toEqual({ kind: 'grams', grams: 250 });
    expect(logged.lines).toHaveLength(3);
    expect(canSplit(logged)).toBe(false);
    expect(isLoggedPortion(logged.units)).toBe(true);
    expect(isLoggedPortion([{ unit: ' Serving ', gramsEach: 250 }])).toBe(true);

    // Re-logged, the portion offers its serving unit: 2 servings are 500 g, not a split of 250 g.
    const reopened = initialAmount(logged, false);
    expect(reopened).toEqual({ unit: servingOf(250), count: 1, amount: 250 });
    expect(withCount(reopened, 2).amount).toBe(500);

    // A whole meal logged in grams or another unit can still be split.
    expect(isLoggedPortion([])).toBe(false);
    expect(isLoggedPortion([{ unit: 'cup', gramsEach: 240 }])).toBe(false);
    expect(canSplit(potDraft({ units: [{ unit: 'cup', gramsEach: 240 }] }))).toBe(true);
  });
});

describe('keepSplit', () => {
  it('keeps n and shows the edited portion when a line of a split recipe changes (R02.6)', () => {
    const split = splitRecipe(potDraft({ units: [{ unit: 'cup', gramsEach: 240 }] }), 8);
    expect(split).not.toBeNull();
    if (split === null) return;
    const scale = scaleFor(split.shown.amount, reviewBase(split.draft));
    // One serving shows 37.5 g of onion; the person corrects it to 50 g.
    const edited = shownWithOnion(scale, 50);
    const kept = keepSplit(split.draft, edited, scale, split.servings, split.shown.unit);
    expect(kept).not.toBeNull();
    if (kept === null) return;

    expect(kept.servings).toBe(8);
    expect(kept.draft.basis).toEqual({ kind: 'grams', grams: 2_100 });
    expect(kept.draft.lines.map((part) => part.grams)).toEqual([1_200, 400, 500]);
    expect(kept.draft.units.map((choice) => [choice.unit, choice.gramsEach])).toEqual([
      ['serving', 262.5],
      ['cup', 240],
    ]);
    // The shown amount is exactly the edited portion, still one serving.
    expect(kept.shown).toEqual({ unit: servingOf(262.5), count: 1, amount: 262.5 });
    expect(kept.draft.chosenUnit).toBe('serving');
    expect(kept.draft.chosenCount).toBe(1);
    // Logging it stores the edited portion, with its energy as shown.
    const logged = draftAtAmount(kept.draft, kept.shown);
    expect(logged.lines[1]?.grams).toBe(50);
    expect(logged.kcal).toBe(lineTotals(edited).kcal);
    // Nutrients follow the whole pot's weight: 2 000 g → 2 100 g.
    expect(kept.draft.nutrients.sodium).toBeCloseTo(2_100, 10);
    // Moving the stepper again divides the whole pot, never the serving.
    expect(splitRecipe(kept.draft, kept.servings)?.shown.amount).toBe(262.5);
  });

  it('keeps two selected servings and recomputes their count', () => {
    const split = splitRecipe(potDraft(), 8);
    if (split === null) throw new Error('split refused');
    // Two servings shown: 500 g of the 2 000 g pot, a quarter.
    const edited = shownWithOnion(0.25, 100);
    const kept = keepSplit(split.draft, edited, 0.25, 8, split.shown.unit);
    expect(kept?.shown.unit).toEqual(servingOf(2_100 / 8));
    expect(kept?.shown.amount).toBe(525);
    expect(kept?.shown.count).toBeCloseTo(2, 10);
  });

  it('keeps grams when grams were selected', () => {
    const split = splitRecipe(potDraft(), 4);
    if (split === null) throw new Error('split refused');
    // 300 g of the pot shown in grams: 15 %.
    const edited = shownWithOnion(0.15, 60);
    const kept = keepSplit(split.draft, edited, 0.15, 4, GRAMS_UNIT);
    expect(kept?.shown.unit).toEqual(GRAMS_UNIT);
    expect(kept?.shown.count).toBeCloseTo(315, 10);
    expect(kept?.shown.amount).toBeCloseTo(315, 10);
    expect(kept?.draft.units[0]?.unit).toBe('serving');
    expect(kept?.draft.chosenUnit).toBeUndefined();
  });

  it('is null without an active split, with a bad scale or with one line left', () => {
    const draft = potDraft();
    const edited = shownWithOnion(0.125, 50);
    const serving = servingOf(250);
    expect(keepSplit(draft, edited, 0.125, 1, serving)).toBeNull();
    expect(keepSplit(draft, edited, 0, 8, serving)).toBeNull();
    expect(keepSplit(draft, edited, -0.5, 8, serving)).toBeNull();
    expect(keepSplit(draft, edited, Number.NaN, 8, serving)).toBeNull();
    expect(keepSplit(draft, edited.slice(0, 1), 0.125, 8, serving)).toBeNull();
    const weightless = edited.map((part) => ({ ...part, grams: 0 }));
    expect(keepSplit(draft, weightless, 0.125, 8, serving)).toBeNull();
  });
});

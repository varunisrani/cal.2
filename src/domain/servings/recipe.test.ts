import { describe, expect, it } from 'vitest';
import type { IngredientLine, NutritionDraft, UnitChoice } from '../model';
import {
  MAX_SERVINGS,
  applySplitLineChange,
  canSplit,
  clampServings,
  isLoggedPortion,
  splitRecipe,
} from './recipe';
import { initialAmount, reviewBase, scaleDraft, scaleLine, scaleOf } from './scale';
import { GRAMS_PICK, initialUnit, shownAmount, type PickerUnit } from './units';

const line = (name: string, grams: number, kcal: number, protein = 0): IngredientLine => ({
  name,
  grams,
  kcal,
  protein,
  carbs: 0,
  fat: 0,
  photoIds: [],
});

/** A 2 kg pot of stew. */
const STEW = [
  line('Lentils', 1000, 1160, 90),
  line('Pork', 800, 2080, 216),
  line('Onion', 200, 80, 2),
];

function potOf(lines: readonly IngredientLine[] = STEW, units: UnitChoice[] = []): NutritionDraft {
  const grams = lines.reduce((sum, part) => sum + part.grams, 0);
  return {
    name: 'Stew',
    kcal: lines.reduce((sum, part) => sum + part.kcal, 0),
    protein: lines.reduce((sum, part) => sum + part.protein, 0),
    carbs: 0,
    fat: 0,
    nutrients: { sodium: 2000 },
    extras: {},
    basis: { kind: 'grams', grams },
    units,
    lines,
    progressive: false,
  };
}

/** The lines the sheet shows at `scale`, with the pork line corrected to `porkGrams`. */
function editedPortion(scale: number, porkGrams: number): IngredientLine[] {
  const shown = STEW.map((part) => scaleLine(part, scale));
  shown[1] = scaleLine(shown[1]!, porkGrams / shown[1]!.grams);
  return shown;
}

const servingPick = (gramsEach: number): PickerUnit => ({
  kind: 'unit',
  id: 'serving',
  amountEach: gramsEach,
});

describe('splitRecipe', () => {
  it('splits a 2 kg pot into 8 with a 250 g serving unit first, one serving selected', () => {
    const split = splitRecipe(potOf(STEW, [{ unit: 'cup', gramsEach: 240 }]), 8)!;
    expect(split.servings).toBe(8);
    expect(split.draft.units).toEqual([
      { unit: 'serving', gramsEach: 250 },
      { unit: 'cup', gramsEach: 240 },
    ]);
    expect(split.unit).toEqual(servingPick(250));
    expect(split.quantity).toBe(1);
    expect(split.draft.chosenUnit).toBe('serving');
    expect(split.draft.chosenCount).toBe(1);
    // The draft is still the whole pot; one serving is an eighth of it.
    expect(split.draft.basis).toEqual({ kind: 'grams', grams: 2000 });
    expect(scaleOf(shownAmount(split.quantity, split.unit), reviewBase(split.draft))).toBe(0.125);
  });

  it('replaces an earlier serving unit and keeps the others after it', () => {
    const units: UnitChoice[] = [
      { unit: 'cup', gramsEach: 240 },
      { unit: 'Serving', gramsEach: 300, count: 6 },
    ];
    const split = splitRecipe(potOf(STEW, units), 4)!;
    expect(split.draft.units).toEqual([
      { unit: 'serving', gramsEach: 500 },
      { unit: 'cup', gramsEach: 240 },
    ]);
  });

  it('puts the serving first so the four-unit cap keeps it', () => {
    const units = ['cup', 'bowl', 'ladle', 'spoon'].map((unit) => ({ unit, gramsEach: 100 }));
    const split = splitRecipe(potOf(STEW, units), 5)!;
    expect(split.draft.units.map((choice) => choice.unit)).toEqual([
      'serving',
      'cup',
      'bowl',
      'ladle',
    ]);
  });

  it('clamps the servings to whole numbers from 1 to 50', () => {
    expect(splitRecipe(potOf(), 0)!.unit.amountEach).toBe(2000);
    expect(splitRecipe(potOf(), 80)!.servings).toBe(MAX_SERVINGS);
    expect(splitRecipe(potOf(), 80)!.unit.amountEach).toBe(40);
    expect(clampServings(2.6)).toBe(3);
    expect(clampServings(-3)).toBe(1);
    expect(clampServings(Number.NaN)).toBe(1);
    expect(clampServings(Number.POSITIVE_INFINITY)).toBe(MAX_SERVINGS);
  });

  it('re-divides the whole recipe when the stepper moves again, never the serving', () => {
    const once = splitRecipe(potOf(), 8)!;
    const again = splitRecipe(once.draft, 5)!;
    expect(again.unit.amountEach).toBe(400);
    expect(again.draft.units).toEqual([{ unit: 'serving', gramsEach: 400 }]);
  });

  it('has nothing to split when the weight is unknown', () => {
    expect(splitRecipe({ ...potOf(), basis: { kind: 'servings', count: 1 } }, 4)).toBeNull();
  });
});

describe('canSplit', () => {
  it('needs at least two lines and a known weight', () => {
    expect(canSplit(potOf())).toBe(true);
    expect(canSplit(potOf(STEW.slice(0, 2)))).toBe(true);
    expect(canSplit(potOf(STEW.slice(0, 1)))).toBe(false);
    expect(canSplit({ ...potOf(), basis: { kind: 'servings', count: 3 } })).toBe(false);
    expect(canSplit({ ...potOf(), basis: { kind: 'grams', grams: 0 } })).toBe(false);
  });

  it('is not offered for a portion logged from a split recipe (R02.6)', () => {
    const split = splitRecipe(potOf(), 8)!;
    // Logging one serving stores a 250 g portion that keeps the serving unit.
    const portion = scaleDraft(split.draft, scaleOf(250, reviewBase(split.draft)));
    expect(portion.basis).toEqual({ kind: 'grams', grams: 250 });
    expect(portion.lines).toHaveLength(3);
    expect(isLoggedPortion(portion.units)).toBe(true);
    expect(canSplit(portion)).toBe(false);

    // Reopened, two servings are two portions, not a quarter of the portion.
    const unit = initialUnit(portion, false);
    expect(unit).toEqual(servingPick(250));
    expect(initialAmount(portion, unit)).toBe(1);
    expect(scaleOf(shownAmount(2, unit), reviewBase(portion))).toBe(2);
  });

  it('recognises a serving unit by id, and nothing else, as a logged portion', () => {
    expect(isLoggedPortion([{ unit: ' Serving', gramsEach: 250 }])).toBe(true);
    expect(isLoggedPortion([{ unit: 'cup', gramsEach: 240 }])).toBe(false);
    expect(isLoggedPortion([])).toBe(false);
    expect(canSplit(potOf(STEW, [{ unit: 'cup', gramsEach: 240 }]))).toBe(true);
  });
});

describe('applySplitLineChange', () => {
  it('keeps the servings and shows exactly the edited portion after a line edit (R02.6)', () => {
    const split = splitRecipe(potOf(), 5)!;
    const scale = 400 / 2000;
    // One serving shows 160 g of pork; the person corrects it to 180 g.
    const edited = editedPortion(scale, 180);
    const kept = applySplitLineChange(split.draft, edited, scale, split)!;

    expect(kept.servings).toBe(5);
    expect(kept.draft.basis.kind).toBe('grams');
    expect(reviewBase(kept.draft)).toBeCloseTo(2100, 9);
    expect(kept.draft.lines[1]!.grams).toBeCloseTo(900, 9);
    expect(kept.draft.units[0]!.unit).toBe('serving');
    expect(kept.draft.units[0]!.gramsEach).toBeCloseTo(420, 9);
    expect(kept.unit.id).toBe('serving');
    expect(kept.quantity).toBeCloseTo(1, 12);
    expect(kept.draft.chosenUnit).toBe('serving');

    // The amount on screen is the edited portion, not a fifth of it.
    const shown = shownAmount(kept.quantity, kept.unit);
    expect(shown).toBeCloseTo(420, 9);
    const portion = kept.draft.lines.map((part) =>
      scaleLine(part, scaleOf(shown, reviewBase(kept.draft))),
    );
    expect(portion[1]!.grams).toBeCloseTo(180, 9);
    expect(portion.reduce((sum, part) => sum + part.kcal, 0)).toBe(
      edited.reduce((sum, part) => sum + part.kcal, 0),
    );
    // Nutrients follow the whole recipe: 2000 g → 2100 g.
    expect(kept.draft.nutrients.sodium).toBeCloseTo(2100, 9);
    // Moving the stepper again divides the new whole recipe.
    expect(splitRecipe(kept.draft, kept.servings)!.unit.amountEach).toBeCloseTo(420, 9);
  });

  it('keeps a picked count of servings, or grams, with the edited amount', () => {
    const split = splitRecipe(potOf(), 4)!;

    // Two servings (1 000 g of the pot) shown; pork 400 g → 450 g.
    const twoServings = editedPortion(0.5, 450);
    const keptServings = applySplitLineChange(split.draft, twoServings, 0.5, {
      servings: 4,
      unit: split.unit,
    })!;
    expect(keptServings.unit.id).toBe('serving');
    expect(keptServings.quantity).toBeCloseTo(2, 12);
    expect(keptServings.unit.amountEach).toBeCloseTo(525, 9);
    expect(shownAmount(keptServings.quantity, keptServings.unit)).toBeCloseTo(1050, 9);

    // 300 g shown in grams; pork 120 g → 140 g.
    const inGrams = editedPortion(0.15, 140);
    const keptGrams = applySplitLineChange(split.draft, inGrams, 0.15, {
      servings: 4,
      unit: GRAMS_PICK,
    })!;
    expect(keptGrams.unit).toEqual(GRAMS_PICK);
    expect(keptGrams.quantity).toBeCloseTo(320, 9);
    expect(keptGrams.draft.units[0]!.unit).toBe('serving');
    expect('chosenUnit' in keptGrams.draft).toBe(false);
  });

  it('falls back to grams when the picked unit is no longer offered', () => {
    const split = splitRecipe(potOf(), 4)!;
    const kept = applySplitLineChange(split.draft, editedPortion(0.25, 200), 0.25, {
      servings: 4,
      unit: { kind: 'unit', id: 'bowl', amountEach: 350 },
    })!;
    expect(kept.unit).toEqual(GRAMS_PICK);
    expect(kept.quantity).toBeCloseTo(500, 9);
  });

  it('gives no split without an active split, with a broken scale or with nothing left to split', () => {
    const split = splitRecipe(potOf(), 5)!;
    const edited = editedPortion(0.2, 180);
    const active = { servings: 5, unit: split.unit };
    expect(applySplitLineChange(split.draft, edited, 0.2, { ...active, servings: 1 })).toBeNull();
    expect(applySplitLineChange(split.draft, edited, 0, active)).toBeNull();
    expect(applySplitLineChange(split.draft, edited, Number.NaN, active)).toBeNull();
    expect(applySplitLineChange(split.draft, edited.slice(0, 1), 0.2, active)).toBeNull();
    const weightless = edited.map((part) => ({ ...part, grams: 0 }));
    expect(applySplitLineChange(split.draft, weightless, 0.2, active)).toBeNull();
  });
});

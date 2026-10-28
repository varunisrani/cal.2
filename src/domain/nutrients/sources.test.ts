import { describe, expect, it } from 'vitest';
import type { ExtraValues, NutrientValues, Targets } from '../model';
import { DEFAULT_GOAL_VALUES, type GoalValues } from './goalDefaults';
import { figureIn, sourceGoal, sourcesOfDay, type SourceEntry } from './sources';

let made = 0;

/** A food logged `minute` minutes into the day, with these values and nothing else. */
function food(
  minute: number,
  values: Partial<Pick<SourceEntry, 'kcal' | 'protein' | 'carbs' | 'fat'>> & {
    readonly nutrients?: NutrientValues;
    readonly extras?: ExtraValues;
  } = {},
  id = `food-${(made += 1)}`,
): SourceEntry {
  return {
    id,
    loggedAt: Date.UTC(2026, 9, 27) + minute * 60_000,
    kcal: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
    nutrients: {},
    extras: {},
    ...values,
  };
}

/** The ids, amounts and shares of the list, in its order. */
function listed(day: ReturnType<typeof sourcesOfDay>) {
  return day.sources.map(({ entry, amount, share }) => [entry.id, amount, share]);
}

describe('sourcesOfDay (D-16.105)', () => {
  it('lists the foods that gave the nutrient, largest first, with each share of the total', () => {
    const day = sourcesOfDay(
      [
        food(480, { nutrients: { sugar: 6 } }, 'muesli'),
        food(600, { nutrients: { sugar: 21 } }, 'juice'),
        food(780, { nutrients: { sugar: 3 } }, 'dal'),
      ],
      'sugar',
    );
    expect(day.total).toBe(30);
    expect(day.foods).toBe(3);
    expect(day.withoutFigure).toBe(0);
    expect(listed(day)).toEqual([
      ['juice', 21, 0.7],
      ['muesli', 6, 0.2],
      ['dal', 3, 0.1],
    ]);
  });

  it('never counts a food without a figure as 0: it is left out of the total and the list and counted apart', () => {
    const day = sourcesOfDay(
      [
        food(480, { nutrients: { fibre: 7 } }, 'oats'),
        food(600, { nutrients: { sugar: 12 } }, 'banana'),
        food(780, {}, 'manual'),
        food(840, { nutrients: { fibre: 3 } }, 'apple'),
      ],
      'fibre',
    );
    expect(day.total).toBe(10);
    expect(day.withoutFigure).toBe(2);
    expect(listed(day)).toEqual([
      ['oats', 7, 0.7],
      ['apple', 3, 0.3],
    ]);
  });

  it('has no total, rather than 0, when the day has foods but none has a figure', () => {
    const day = sourcesOfDay([food(480, { nutrients: { fibre: 2 } }), food(600)], 'sugar');
    expect(day).toEqual({ foods: 2, withoutFigure: 2, total: null, sources: [] });
  });

  it('counts a figure of 0 toward the total, but does not list a food that gave nothing', () => {
    const day = sourcesOfDay(
      [
        food(480, { nutrients: { sugar: 0 } }, 'water'),
        food(600, { nutrients: { sugar: 4 } }, 'yoghurt'),
        food(660, {}, 'manual'),
      ],
      'sugar',
    );
    expect(day.total).toBe(4);
    expect(day.withoutFigure).toBe(1);
    expect(listed(day)).toEqual([['yoghurt', 4, 1]]);

    const none = sourcesOfDay([food(480, { nutrients: { sugar: 0 } })], 'sugar');
    expect(none).toEqual({ foods: 1, withoutFigure: 0, total: 0, sources: [] });
  });

  it('takes a figure that is not a finite amount of 0 or more as no figure', () => {
    const day = sourcesOfDay(
      [
        food(480, { nutrients: { sodium: Number.NaN } }),
        food(540, { nutrients: { sodium: Number.POSITIVE_INFINITY } }),
        food(600, { nutrients: { sodium: -20 } }),
        food(660, { nutrients: { sodium: 640 } }, 'bowl'),
      ],
      'sodium',
    );
    expect(day.total).toBe(640);
    expect(day.withoutFigure).toBe(3);
    expect(listed(day)).toEqual([['bowl', 640, 1]]);
  });

  it('puts the earlier food first on a tie, then the id', () => {
    const day = sourcesOfDay(
      [
        food(700, { protein: 10 }, 'late'),
        food(500, { protein: 10 }, 'b-early'),
        food(500, { protein: 10 }, 'a-early'),
        food(600, { protein: 20 }, 'big'),
      ],
      'protein',
    );
    expect(day.sources.map((source) => source.entry.id)).toEqual([
      'big',
      'a-early',
      'b-early',
      'late',
    ]);
  });

  it('reads energy in kcal, the macros, an optional nutrient and a sports compound', () => {
    const entries = [
      food(480, { kcal: 380, carbs: 52, fat: 9, extras: { creatine: 5 } }, 'shake'),
      food(780, { kcal: 520, carbs: 40, fat: 21, nutrients: { iron: 4.5 } }, 'curry'),
    ];
    expect(listed(sourcesOfDay(entries, 'kcal')).map(([id]) => id)).toEqual(['curry', 'shake']);
    expect(sourcesOfDay(entries, 'kcal').total).toBe(900);
    expect(sourcesOfDay(entries, 'carbs').total).toBe(92);
    expect(listed(sourcesOfDay(entries, 'fat')).map(([id]) => id)).toEqual(['curry', 'shake']);
    expect(sourcesOfDay(entries, 'iron')).toMatchObject({ total: 4.5, withoutFigure: 1 });
    expect(sourcesOfDay(entries, 'creatine')).toMatchObject({ total: 5, withoutFigure: 1 });
    expect(figureIn(entries[0]!, 'kcal')).toBe(380);
    expect(figureIn(entries[0]!, 'iron')).toBeNull();
    expect(figureIn(entries[1]!, 'creatine')).toBeNull();
  });

  it('has nothing on a day without food', () => {
    expect(sourcesOfDay([], 'kcal')).toEqual({
      foods: 0,
      withoutFigure: 0,
      total: null,
      sources: [],
    });
  });
});

describe('sourceGoal (D-16.105)', () => {
  const targets: Targets = { kcal: 2_200, protein: 120, carbs: 250, fat: 70 };

  it('reads energy and the macros against the targets in effect', () => {
    expect(sourceGoal('kcal', targets, DEFAULT_GOAL_VALUES)).toEqual({
      amount: 2_200,
      kind: 'target',
    });
    expect(sourceGoal('protein', targets, DEFAULT_GOAL_VALUES)).toEqual({
      amount: 120,
      kind: 'target',
    });
  });

  it('has no energy or macro goal without targets', () => {
    expect(sourceGoal('kcal', null, DEFAULT_GOAL_VALUES)).toBeNull();
    expect(sourceGoal('fat', { ...targets, fat: 0 }, DEFAULT_GOAL_VALUES)).toBeNull();
  });

  it('reads the optional goals with their kind: a limit or an amount to reach', () => {
    expect(sourceGoal('sugar', targets, DEFAULT_GOAL_VALUES)).toEqual({
      amount: 50,
      kind: 'limit',
    });
    expect(sourceGoal('sodium', targets, DEFAULT_GOAL_VALUES)).toEqual({
      amount: 2_300,
      kind: 'limit',
    });
    expect(sourceGoal('fibre', targets, DEFAULT_GOAL_VALUES)).toEqual({
      amount: 30,
      kind: 'target',
    });
    const goals: GoalValues = { ...DEFAULT_GOAL_VALUES, creatine: 5 };
    expect(sourceGoal('creatine', targets, goals)).toEqual({ amount: 5, kind: 'target' });
  });

  it('has none for a goal turned off (0) and for the two fats that never have one', () => {
    expect(sourceGoal('sugar', targets, { ...DEFAULT_GOAL_VALUES, sugar: 0 })).toBeNull();
    expect(sourceGoal('creatine', targets, DEFAULT_GOAL_VALUES)).toBeNull();
    expect(sourceGoal('monounsaturatedFat', targets, DEFAULT_GOAL_VALUES)).toBeNull();
    expect(sourceGoal('polyunsaturatedFat', targets, DEFAULT_GOAL_VALUES)).toBeNull();
  });
});

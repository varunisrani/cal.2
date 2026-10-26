import { describe, expect, it } from 'vitest';
import type { Targets } from '../model';
import { macroKcal } from './formulas';
import { MACRO_WHEELS, PLAN_WHEELS, carbsCeiling, editPlan, wheelStart } from './planEdit';

const plan: Targets = { kcal: 2452, protein: 112, carbs: 406, fat: 42 };

describe('wheels', () => {
  it('uses kcal 800–6 000 in steps of 50 and macros in steps of 5 everywhere (D-16.12)', () => {
    expect(PLAN_WHEELS.kcal).toEqual({ min: 800, max: 6000, step: 50 });
    expect(MACRO_WHEELS).toEqual({
      protein: { min: 10, max: 500, step: 5 },
      carbs: { min: 0, max: 800, step: 5 },
      fat: { min: 10, max: 300, step: 5 },
    });
    expect(PLAN_WHEELS.protein).toBe(MACRO_WHEELS.protein);
  });

  it('opens a wheel on the value snapped down onto a row, inside the wheel', () => {
    expect(wheelStart(2452, PLAN_WHEELS.kcal)).toBe(2450);
    expect(wheelStart(112, PLAN_WHEELS.protein)).toBe(110);
    expect(wheelStart(406, PLAN_WHEELS.carbs)).toBe(405);
    expect(wheelStart(42, PLAN_WHEELS.fat)).toBe(40);
    expect(wheelStart(700, PLAN_WHEELS.kcal)).toBe(800);
    expect(wheelStart(1467, PLAN_WHEELS.carbs)).toBe(800);
    expect(wheelStart(4, PLAN_WHEELS.fat)).toBe(10);
  });
});

describe('editPlan', () => {
  it('re-derives carbs when kcal, protein or fat change: kcal 2 000, P 150, F 60 → carbs 215', () => {
    const kcal = editPlan(plan, 'kcal', 2000);
    expect(kcal).toEqual({ kcal: 2000, protein: 112, carbs: 293, fat: 42 });
    const protein = editPlan(kcal, 'protein', 150);
    expect(protein).toEqual({ kcal: 2000, protein: 150, carbs: 255, fat: 42 });
    const fat = editPlan(protein, 'fat', 60);
    expect(fat).toEqual({ kcal: 2000, protein: 150, carbs: 215, fat: 60 });
    expect(macroKcal(fat)).toBe(2000);
  });

  it('re-derives kcal when carbs change: carbs 300 → kcal 2 340', () => {
    const start: Targets = { kcal: 2000, protein: 150, carbs: 215, fat: 60 };
    expect(editPlan(start, 'carbs', 300)).toEqual({
      kcal: 2340,
      protein: 150,
      carbs: 300,
      fat: 60,
    });
  });

  it('keeps carbs at 0 when protein and fat already use all the kcal', () => {
    const start: Targets = { kcal: 1200, protein: 150, carbs: 75, fat: 60 };
    expect(editPlan(start, 'protein', 300).carbs).toBe(0);
    expect(editPlan(start, 'kcal', 800).carbs).toBe(0);
  });

  it('caps the carbs wheel so kcal never passes 6 000', () => {
    const heavy: Targets = { kcal: 5000, protein: 300, carbs: 500, fat: 200 };
    // 6 000 − 1 200 − 1 800 = 3 000 kcal of room → 750 g.
    expect(carbsCeiling(heavy)).toBe(750);
    expect(editPlan(heavy, 'carbs', 800)).toEqual({
      kcal: 6000,
      protein: 300,
      carbs: 750,
      fat: 200,
    });
    // 6 000 − 2 000 − 2 700 = 1 300 kcal of room → 325 g; an odd room snaps down onto a row.
    expect(carbsCeiling({ protein: 500, fat: 300 })).toBe(325);
    expect(carbsCeiling({ protein: 111, fat: 41 })).toBe(800);
    expect(carbsCeiling({ protein: 350, fat: 290 })).toBe(495);
    for (let protein = 10; protein <= 500; protein += 35) {
      for (let fat = 10; fat <= 300; fat += 25) {
        const edited = editPlan({ kcal: 2000, protein, carbs: 0, fat }, 'carbs', 800);
        expect(edited.kcal).toBeLessThanOrEqual(6000);
      }
    }
  });

  it('keeps a value inside its wheel and whole', () => {
    expect(editPlan(plan, 'kcal', 7000).kcal).toBe(6000);
    expect(editPlan(plan, 'kcal', 500).kcal).toBe(800);
    expect(editPlan(plan, 'protein', 2).protein).toBe(10);
    expect(editPlan(plan, 'fat', 400).fat).toBe(300);
    expect(editPlan(plan, 'carbs', -5).carbs).toBe(0);
    expect(editPlan(plan, 'protein', 149.6).protein).toBe(150);
  });

  it('keeps a kcal value between rows (a kJ pick) as it is', () => {
    // 8 400 kJ on the kJ wheel saves as 2 008 kcal.
    expect(editPlan(plan, 'kcal', 2008)).toEqual({
      kcal: 2008,
      protein: 112,
      carbs: 295,
      fat: 42,
    });
  });

  it('keeps 4P + 4C + 9F within 3 kcal of kcal after any edit (R01.7)', () => {
    let current: Targets = plan;
    const steps: Array<[keyof Targets, number]> = [
      ['kcal', 1850],
      ['protein', 140],
      ['fat', 55],
      ['carbs', 210],
      ['kcal', 3001],
      ['fat', 95],
      ['carbs', 455],
    ];
    for (const [field, value] of steps) {
      current = editPlan(current, field, value);
      expect(current.kcal - macroKcal(current)).toBeGreaterThanOrEqual(0);
      expect(current.kcal - macroKcal(current)).toBeLessThan(4);
    }
  });
});

import { describe, expect, it } from 'vitest';
import type { Targets } from '../model';
import { FIXTURE_TODAY, defaultProfile } from './__fixtures__/profiles';
import { formulaPlan } from './formulas';
import { PLAN_WHEELS, carbsWheel, editPlan, wheelStart, type PlanDraft } from './planEdit';
import { macroKcal } from './targets';

const formula = formulaPlan(defaultProfile, FIXTURE_TODAY);

function draft(plan: Targets, touched = false): PlanDraft {
  return { plan, touched };
}

describe('PLAN_WHEELS', () => {
  it('uses the Settings ranges: kcal 800–6 000 in 50s, grams in 5s (D-16.12)', () => {
    expect(PLAN_WHEELS).toEqual({
      kcal: { min: 800, max: 6_000, step: 50 },
      protein: { min: 10, max: 500, step: 5 },
      carbs: { min: 0, max: 800, step: 5 },
      fat: { min: 10, max: 300, step: 5 },
    });
  });
});

describe('editPlan', () => {
  it('re-derives carbs after kcal, protein or fat: 2 000 / 150 / 60 → carbs 215 (R01.7)', () => {
    let state = draft(formula);
    state = editPlan(state, 'kcal', 2_000);
    expect(state.plan).toEqual({ kcal: 2_000, protein: 112, carbs: 293, fat: 42 });
    state = editPlan(state, 'protein', 150);
    expect(state.plan.carbs).toBe(255);
    state = editPlan(state, 'fat', 60);
    expect(state.plan).toEqual({ kcal: 2_000, protein: 150, carbs: 215, fat: 60 });
    expect(state.touched).toBe(true);
  });

  it('re-derives kcal after carbs: carbs 300 → 2 340 kcal (R01.7)', () => {
    const state = editPlan(draft({ kcal: 2_000, protein: 150, carbs: 215, fat: 60 }), 'carbs', 300);
    expect(state.plan).toEqual({ kcal: 2_340, protein: 150, carbs: 300, fat: 60 });
    expect(macroKcal(state.plan)).toBe(state.plan.kcal);
  });

  it('marks the plan touched only when a value changes (R01.7)', () => {
    const same = editPlan(draft(formula), 'protein', formula.protein);
    expect(same.touched).toBe(false);
    expect(same.plan).toEqual(formula);
    expect(editPlan(draft(formula), 'fat', 50).touched).toBe(true);
    expect(editPlan(draft(formula, true), 'fat', formula.fat).touched).toBe(true);
  });

  it('keeps an exact kcal that is off the wheel steps (R06.20)', () => {
    expect(editPlan(draft(formula), 'kcal', 2_037).plan.kcal).toBe(2_037);
  });

  it('holds values inside their wheel ranges', () => {
    expect(editPlan(draft(formula), 'kcal', 9_000).plan.kcal).toBe(6_000);
    expect(editPlan(draft(formula), 'kcal', 500).plan.kcal).toBe(800);
    expect(editPlan(draft(formula), 'protein', 2).plan.protein).toBe(10);
    expect(editPlan(draft(formula), 'fat', 350).plan.fat).toBe(300);
  });

  it('never lets a carbs edit push kcal past 6 000', () => {
    const heavy = { kcal: 4_000, protein: 300, carbs: 0, fat: 250 };
    const state = editPlan(draft(heavy), 'carbs', 900);
    expect(state.plan.carbs).toBe(635);
    expect(state.plan.kcal).toBe(5_990);
  });

  it('gives carbs 0 when protein and fat alone pass the kcal target', () => {
    const state = editPlan(draft({ kcal: 1_000, protein: 150, carbs: 0, fat: 60 }), 'protein', 200);
    expect(state.plan).toEqual({ kcal: 1_000, protein: 200, carbs: 0, fat: 60 });
  });
});

describe('carbsWheel', () => {
  it('tops out where kcal would reach 6 000, on the step grid, and at most 800', () => {
    expect(carbsWheel({ protein: 150, fat: 60 })).toEqual({ min: 0, max: 800, step: 5 });
    expect(carbsWheel({ protein: 500, fat: 300 })).toEqual({ min: 0, max: 325, step: 5 });
    expect(carbsWheel({ protein: 300, fat: 250 }).max).toBe(635);
  });
});

describe('wheelStart', () => {
  it('opens on the value snapped down to a step and kept in range', () => {
    expect(wheelStart(PLAN_WHEELS.kcal, 2_452)).toBe(2_450);
    expect(wheelStart(PLAN_WHEELS.kcal, 790)).toBe(800);
    expect(wheelStart(PLAN_WHEELS.protein, 112)).toBe(110);
    expect(wheelStart(PLAN_WHEELS.fat, 350)).toBe(300);
    expect(wheelStart(carbsWheel({ protein: 300, fat: 250 }), 700)).toBe(635);
  });
});

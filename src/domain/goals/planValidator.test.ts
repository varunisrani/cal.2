import { describe, expect, it } from 'vitest';
import type { Targets } from '../model';
import { FIXTURE_TODAY, defaultProfile, lose100Profile } from './__fixtures__/profiles';
import { formulaPlan } from './formulas';
import { RAW_PLAN_RANGES, checkPlan, type PlanReplyValues } from './planValidator';

const formula = formulaPlan(defaultProfile, FIXTURE_TODAY);
// A formula plan near the replies below, so only the step under test can refuse them.
const near2000: Targets = { kcal: 2_000, protein: 150, carbs: 215, fat: 60 };

function reply(kcal: unknown, protein: unknown, carbs: unknown, fat: unknown): PlanReplyValues {
  return { kcal, protein, carbs, fat };
}

function energy(plan: Targets): number {
  return 4 * plan.protein + 4 * plan.carbs + 9 * plan.fat;
}

describe('checkPlan: accepted replies', () => {
  it('stores 2 000 / 150 / 215 / 61 as 2 000 / 150 / 215 / 60 (R01.2, ACC-C3-1)', () => {
    const result = checkPlan(reply(2_000, 150, 215, 61), near2000);
    expect(result).toEqual({ ok: true, value: { kcal: 2_000, protein: 150, carbs: 215, fat: 60 } });
    if (result.ok) expect(energy(result.value)).toBe(2_000);
  });

  it('keeps 801 / 70 / 29 / 45 exact at 801 kcal', () => {
    const result = checkPlan(reply(801, 70, 29, 45), {
      kcal: 801,
      protein: 70,
      carbs: 29,
      fat: 45,
    });
    expect(result).toEqual({ ok: true, value: { kcal: 801, protein: 70, carbs: 29, fat: 45 } });
    if (result.ok) expect(energy(result.value)).toBe(801);
  });

  it('accepts numeric text, with or without spaces', () => {
    expect(checkPlan(reply('2000', '150', '215', '60'), near2000).ok).toBe(true);
    expect(checkPlan(reply(2_000, ' 150 ', 215, 60), near2000).ok).toBe(true);
    expect(checkPlan(reply('2e3', '1.5e2', '215.0', '60'), near2000)).toMatchObject({
      ok: true,
      value: { kcal: 2_000, protein: 150 },
    });
  });

  it('rounds fractional raw values half up before the exact fit', () => {
    const result = checkPlan(reply(1_999.5, 149.5, 215.2, 59.6), near2000);
    expect(result).toEqual({ ok: true, value: { kcal: 2_000, protein: 150, carbs: 215, fat: 60 } });
  });

  it('moves fat to the nearest amount with the right remainder, the lower one on a tie', () => {
    // kcal 2 000 needs fat ≡ 0 (mod 4): 62 sits between 60 and 64, 63 is nearer 64.
    expect(checkPlan(reply(2_000, 150, 210, 62), near2000)).toMatchObject({
      ok: true,
      value: { fat: 60, carbs: 215 },
    });
    expect(checkPlan(reply(2_000, 150, 206, 63), near2000)).toMatchObject({
      ok: true,
      value: { fat: 64, carbs: 206 },
    });
  });

  it('keeps a reason with text in it, trimmed, and drops a blank or non-text one', () => {
    const base = reply(2_000, 150, 215, 60);
    expect(checkPlan({ ...base, reason: '  Steady cut. ' }, near2000)).toMatchObject({
      value: { reason: 'Steady cut.' },
    });
    for (const reason of ['   ', '', 42, null, undefined]) {
      const result = checkPlan({ ...base, reason }, near2000);
      expect(result.ok && 'reason' in result.value).toBe(false);
    }
  });

  it('never turns protein into a lean-mass rate when body fat is known', () => {
    const withBodyFat = formulaPlan(lose100Profile, FIXTURE_TODAY);
    const withoutBodyFat = formulaPlan({ ...lose100Profile, bodyFat: undefined }, FIXTURE_TODAY);
    expect(withBodyFat.protein).toBe(180);
    expect(withoutBodyFat.protein).toBe(180);
    // 230 g is inside 70–130 % of 180 g; a lean-mass rate (70 kg × 1.8) would refuse it.
    const result = checkPlan(reply(2_200, 230, 185, 60), withBodyFat);
    expect(result).toEqual({ ok: true, value: { kcal: 2_200, protein: 230, carbs: 185, fat: 60 } });
  });
});

describe('checkPlan: refused replies', () => {
  it('refuses a value that is not a number or numeric text (step 1, R01.2)', () => {
    for (const bad of [
      true,
      false,
      null,
      undefined,
      Number.NaN,
      Infinity,
      'abc',
      '12abc',
      '',
      {},
    ]) {
      expect(checkPlan(reply(2_000, bad, 215, 60), near2000)).toEqual({
        ok: false,
        error: { step: 'notNumber', field: 'protein' },
      });
    }
    expect(checkPlan(reply(2_000, 150, 200, undefined), near2000)).toEqual({
      ok: false,
      error: { step: 'notNumber', field: 'fat' },
    });
  });

  it('refuses raw values outside the ranges, before rounding (step 2, R01.2)', () => {
    expect(RAW_PLAN_RANGES).toEqual({
      kcal: { min: 800, max: 6_000 },
      protein: { min: 10, max: 500 },
      carbs: { min: 0, max: 1_500 },
      fat: { min: 10, max: 400 },
    });
    expect(checkPlan(reply(801, 999, 999, 999), near2000)).toMatchObject({
      error: { step: 'outOfRange', field: 'protein', value: 999 },
    });
    expect(checkPlan(reply(2_000, 0, 500, 0), near2000)).toMatchObject({
      error: { step: 'outOfRange', field: 'protein' },
    });
    expect(checkPlan(reply(799.6, 50, 100, 30), near2000)).toMatchObject({
      error: { step: 'outOfRange', field: 'kcal', min: 800, max: 6_000 },
    });
    expect(checkPlan(reply(2_000, 150, -1, 60), near2000)).toMatchObject({
      error: { step: 'outOfRange', field: 'carbs' },
    });
  });

  it('refuses macros whose energy is too far from kcal (step 3, R01.2)', () => {
    expect(checkPlan(reply(2_000, 150, 400, 80), near2000)).toEqual({
      ok: false,
      error: { step: 'incoherent', macroKcal: 2_920, kcal: 2_000, allowed: 300 },
    });
    expect(checkPlan(reply(2_000, 150, 7, 60), near2000)).toMatchObject({
      error: { step: 'incoherent' },
    });
    // The allowance is 15 % of kcal (never under 100): at 800 kcal, macros worth 919 pass and
    // 921 do not.
    const tight = { kcal: 800, protein: 60, carbs: 95, fat: 20 };
    expect(checkPlan(reply(800, 60, 124.75, 20), tight)).toMatchObject({
      ok: true,
      value: { kcal: 800, protein: 60, carbs: 95, fat: 20 },
    });
    expect(checkPlan(reply(800, 60, 125.25, 20), tight)).toMatchObject({
      error: { step: 'incoherent' },
    });
  });

  it('refuses a fit that leaves fat under 10 g (step 5)', () => {
    expect(checkPlan(reply(800, 200, 0, 10), near2000)).toEqual({
      ok: false,
      error: { step: 'belowMinimum', field: 'fat', value: 0, min: 10 },
    });
  });

  it('lowers protein until fat can take the remainder kcal needs (R01.9)', () => {
    // 803 kcal needs fat ≡ 3 (mod 4); at 200 g protein only 3 kcal are left, so protein steps down
    // to 194 g to make room for 3 g of fat, which the minimum then refuses.
    expect(checkPlan(reply(803, 200, 0, 10), near2000)).toEqual({
      ok: false,
      error: { step: 'belowMinimum', field: 'fat', value: 3, min: 10 },
    });
  });

  it('refuses protein 300 for the default profile, which allows 78–146 (step 6, R01.2)', () => {
    expect(checkPlan(reply(2_000, 300, 110, 40), formula)).toEqual({
      ok: false,
      error: { step: 'implausible', field: 'protein', value: 300, min: 78, max: 146 },
    });
  });

  it('refuses 6 000 kcal for the default profile, which allows 1 226–4 904 (step 6)', () => {
    expect(checkPlan(reply(6_000, 112, 1_289, 44), formula)).toEqual({
      ok: false,
      error: { step: 'implausible', field: 'kcal', value: 6_000, min: 1_226, max: 4_904 },
    });
  });

  it('refuses fat outside half to one and a half times the formula fat (step 6)', () => {
    expect(checkPlan(reply(2_400, 112, 340, 100), formula)).toMatchObject({
      error: { step: 'implausible', field: 'fat', min: 21, max: 63 },
    });
  });

  it('holds the kcal reference to 800–6 000 and the macro references to at least 10 g', () => {
    const tiny = { kcal: 300, protein: 5, carbs: 10, fat: 4 };
    expect(checkPlan(reply(800, 10, 163, 12), tiny)).toMatchObject({ ok: true });
    expect(checkPlan(reply(1_601, 10, 361, 13), tiny)).toMatchObject({
      error: { step: 'implausible', field: 'kcal', min: 800, max: 1_600 },
    });
  });
});

describe('checkPlan: exact energy', () => {
  it('gives whole values that sum exactly to kcal for every accepted reply (R01.2)', () => {
    // A seeded sweep of coherent replies with small drift, checked against a matching formula.
    let seed = 0x2f6b_1d3a;
    const random = () => {
      seed = (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0;
      return seed / 2 ** 32;
    };
    let accepted = 0;
    for (let i = 0; i < 4_000; i += 1) {
      const kcal = 800 + random() * 5_200;
      const protein = 10 + random() * Math.min(490, (kcal * 0.5) / 4 - 10);
      const fat = 10 + random() * Math.min(390, (kcal - 4 * protein) / 9 - 10);
      const carbs = Math.max(0, (kcal - 4 * protein - 9 * fat + (random() - 0.5) * 160) / 4);
      const anchor = {
        kcal: Math.round(kcal),
        protein: Math.round(protein),
        carbs: 0,
        fat: Math.round(fat),
      };
      const result = checkPlan(reply(kcal, protein, carbs, fat), anchor);
      if (!result.ok) continue;
      accepted += 1;
      const plan = result.value;
      for (const value of [plan.kcal, plan.protein, plan.carbs, plan.fat]) {
        expect(Number.isInteger(value)).toBe(true);
      }
      expect(energy(plan)).toBe(plan.kcal);
      expect(plan.protein).toBeGreaterThanOrEqual(10);
      expect(plan.fat).toBeGreaterThanOrEqual(10);
      expect(plan.fat).toBeLessThanOrEqual(400);
      expect(plan.carbs).toBeGreaterThanOrEqual(0);
    }
    expect(accepted).toBeGreaterThan(3_000);
  });
});

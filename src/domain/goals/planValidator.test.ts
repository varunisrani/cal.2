import { describe, expect, it } from 'vitest';
import { isOk } from '../../lib/result';
import type { Targets } from '../model';
import { floorMod, formulaPlan, macroKcal } from './formulas';
import {
  REPLY_RANGES,
  checkPlan,
  exactPlan,
  fatWithResidue,
  plausibleRanges,
  readPlanNumber,
  type PlanReply,
} from './planValidator';
import {
  FIXTURE_TODAY,
  defaultProfile,
  lose100Profile,
  smallCutProfile,
} from './__fixtures__/profiles';

const today = FIXTURE_TODAY;
/** Formula plan 2 452 / 112 / 406 / 42: plausible protein 78–146, fat 21–63, kcal 1 226–4 904. */
const defaultRef = formulaPlan(defaultProfile, today);
/** Formula plan 2 207 / 180 / … / 60: plausible protein 126–234, fat 30–90. */
const lose100Ref = formulaPlan(lose100Profile, today);
/** Formula plan 1 370 / 72 / … / 31: plausible protein 50–94, fat 16–47, kcal 800–2 740. */
const smallCutRef = formulaPlan(smallCutProfile, today);

function reply(kcal: unknown, protein: unknown, carbs: unknown, fat: unknown): PlanReply {
  return { kcal, protein, carbs, fat };
}

describe('checkPlan: worked examples', () => {
  it('stores {2000, 150, 215, 61} as 2 000 / 150 / 215 / 60 with 4P + 4C + 9F = 2 000 (ACC-C3-1, R01.2)', () => {
    const result = checkPlan(reply(2000, 150, 215, 61), lose100Ref);
    expect(result).toEqual({ ok: true, value: { kcal: 2000, protein: 150, carbs: 215, fat: 60 } });
    if (isOk(result)) expect(macroKcal(result.value)).toBe(2000);
  });

  it('keeps {801, 70, 29, 45} exact at 801 kcal', () => {
    const result = checkPlan(reply(801, 70, 29, 45), smallCutRef);
    expect(result).toEqual({ ok: true, value: { kcal: 801, protein: 70, carbs: 29, fat: 45 } });
    if (isOk(result)) expect(macroKcal(result.value)).toBe(801);
  });

  it('refuses protein 300 for the default profile (allowed 78–146)', () => {
    expect(checkPlan(reply(2000, 300, 110, 40), defaultRef)).toEqual({
      ok: false,
      error: { step: 'plausibility', field: 'protein', value: 300, allowed: { min: 78, max: 146 } },
    });
  });

  it('refuses 6 000 kcal for the default profile (allowed 1 226–4 904)', () => {
    expect(checkPlan(reply(6000, 112, 1289, 44), defaultRef)).toEqual({
      ok: false,
      error: {
        step: 'plausibility',
        field: 'kcal',
        value: 6000,
        allowed: { min: 1226, max: 4904 },
      },
    });
  });

  it('refuses the incoherent {2000, 150, 400, 80} at the coherence step', () => {
    const result = checkPlan(reply(2000, 150, 400, 80), lose100Ref);
    expect(result).toEqual({
      ok: false,
      error: { step: 'coherence', value: 920, allowed: { min: -300, max: 300 } },
    });
  });

  it('refuses {2000, 150, 7, 60}: the macros explain only 1 168 kcal', () => {
    const result = checkPlan(reply(2000, 150, 7, 60), lose100Ref);
    expect(isOk(result) ? null : result.error.step).toBe('coherence');
  });

  it('refuses {800, 500, 1200, 400}: every value in range, but the macros explain 10 400 kcal', () => {
    expect(checkPlan(reply(800, 500, 1200, 400), lose100Ref)).toEqual({
      ok: false,
      error: { step: 'coherence', value: 9600, allowed: { min: -120, max: 120 } },
    });
  });
});

describe('checkPlan: shape (step 1)', () => {
  it('refuses a boolean protein', () => {
    expect(checkPlan(reply(2000, true, 215, 60), lose100Ref)).toEqual({
      ok: false,
      error: { step: 'shape', field: 'protein', value: true },
    });
    expect(checkPlan(reply(false, 150, 215, 60), lose100Ref)).toMatchObject({
      ok: false,
      error: { step: 'shape', field: 'kcal' },
    });
  });

  it('accepts "150" as protein, and numeric strings for every field', () => {
    expect(checkPlan(reply(2000, '150', 215, 60), lose100Ref)).toEqual({
      ok: true,
      value: { kcal: 2000, protein: 150, carbs: 215, fat: 60 },
    });
    expect(checkPlan(reply(' 2000 ', '150.0', '215', '6.1e1'), lose100Ref)).toEqual({
      ok: true,
      value: { kcal: 2000, protein: 150, carbs: 215, fat: 60 },
    });
  });

  it('refuses a missing macro', () => {
    const missingFat = { kcal: 2000, protein: 150, carbs: 200 } as unknown as PlanReply;
    expect(checkPlan(missingFat, lose100Ref)).toEqual({
      ok: false,
      error: { step: 'shape', field: 'fat', value: undefined },
    });
  });

  it('refuses null, objects, arrays, non-finite numbers and text that is not a plain number', () => {
    for (const bad of [
      null,
      {},
      [150],
      Number.NaN,
      Infinity,
      '',
      '150g',
      'NaN',
      'Infinity',
      '1e999',
      '1,5',
    ]) {
      const result = checkPlan(reply(2000, bad, 215, 60), lose100Ref);
      expect(result).toMatchObject({ ok: false, error: { step: 'shape', field: 'protein' } });
    }
  });

  it('reads plain numbers and numeric strings and nothing else', () => {
    expect(readPlanNumber(150)).toBe(150);
    expect(readPlanNumber(' -2.5 ')).toBe(-2.5);
    expect(readPlanNumber('.5')).toBe(0.5);
    expect(readPlanNumber('1E3')).toBe(1000);
    expect(readPlanNumber(true)).toBeNull();
    expect(readPlanNumber('0x10')).toBeNull();
    expect(readPlanNumber('1 000')).toBeNull();
    expect(readPlanNumber(undefined)).toBeNull();
  });
});

describe('checkPlan: raw ranges (step 2)', () => {
  it('uses kcal 800–6 000, protein 10–500, carbs 0–1 500, fat 10–400', () => {
    expect(REPLY_RANGES).toEqual({
      kcal: { min: 800, max: 6000 },
      protein: { min: 10, max: 500 },
      carbs: { min: 0, max: 1500 },
      fat: { min: 10, max: 400 },
    });
  });

  it('refuses each field just outside either end', () => {
    const cases: Array<[PlanReply, string]> = [
      [reply(799.9, 150, 215, 60), 'kcal'],
      [reply(6000.1, 150, 215, 60), 'kcal'],
      [reply(2000, 9.9, 215, 60), 'protein'],
      [reply(2000, 500.5, 215, 60), 'protein'],
      [reply(2000, 150, -1, 60), 'carbs'],
      [reply(2000, 150, 1500.1, 60), 'carbs'],
      [reply(2000, 150, 215, 9), 'fat'],
      [reply(2000, 150, 215, 401), 'fat'],
    ];
    for (const [values, field] of cases) {
      expect(checkPlan(values, lose100Ref)).toMatchObject({
        ok: false,
        error: { step: 'range', field },
      });
    }
  });

  it('refuses extreme or zero-macro replies instead of clamping them', () => {
    expect(checkPlan(reply(801, 999, 999, 999), lose100Ref)).toMatchObject({
      ok: false,
      error: { step: 'range', field: 'protein', value: 999, allowed: { min: 10, max: 500 } },
    });
    expect(checkPlan(reply(2000, 0, 500, 0), lose100Ref)).toMatchObject({
      ok: false,
      error: { step: 'range', field: 'protein', value: 0 },
    });
  });

  it('lets values on the range ends through to the later steps', () => {
    const ends = [
      reply(800, 10, 167.5, 10),
      reply(6000, 500, 1000, 10),
      reply(6000, 10, 1500, 10),
      reply(6000, 10, 590, 400),
    ];
    for (const values of ends) {
      const result = checkPlan(values, lose100Ref);
      expect(isOk(result) ? 'accepted' : result.error.step).not.toBe('range');
    }
    const low: Targets = { kcal: 800, protein: 10, carbs: 0, fat: 10 };
    expect(checkPlan(reply(800, 10, 160, 11), low)).toEqual({
      ok: true,
      value: { kcal: 800, protein: 10, carbs: 163, fat: 12 },
    });
  });
});

describe('checkPlan: coherence (step 3)', () => {
  it('allows a mismatch up to max(100, 15 % of kcal) either way', () => {
    // 15 % of 2 000 is 300: 4 × 150 + 4 × 290 + 9 × 60 = 2 300 passes; one more carb gram fails.
    expect(checkPlan(reply(2000, 150, 290, 60), lose100Ref)).toMatchObject({ ok: true });
    expect(checkPlan(reply(2000, 150, 290.25, 60), lose100Ref)).toMatchObject({
      ok: false,
      error: { step: 'coherence' },
    });
    // 15 % of the lowest kcal in range (800) is 120, so the 100 kcal floor never decides.
    expect(
      checkPlan(reply(800, 10, 200, 10), { kcal: 800, protein: 10, carbs: 0, fat: 10 }),
    ).toMatchObject({
      ok: false,
      error: { step: 'coherence', allowed: { min: -120, max: 120 } },
    });
  });
});

describe('checkPlan: normalising and low macros (steps 4 and 5)', () => {
  it('rounds kcal and protein, and moves fat to the nearest value with kcal’s remainder mod 4', () => {
    expect(exactPlan({ kcal: 2000.4, protein: 149.6, carbs: 215, fat: 61 })).toEqual({
      kcal: 2000,
      protein: 150,
      carbs: 215,
      fat: 60,
    });
    expect(exactPlan({ kcal: 2001, protein: 150, carbs: 215, fat: 60 })).toEqual({
      kcal: 2001,
      protein: 150,
      carbs: 213,
      fat: 61,
    });
  });

  it('refuses {800, 200, 0, 10}: protein fills the kcal, fat normalises to 0', () => {
    expect(exactPlan({ kcal: 800, protein: 200, carbs: 0, fat: 10 })).toEqual({
      kcal: 800,
      protein: 200,
      carbs: 0,
      fat: 0,
    });
    expect(checkPlan(reply(800, 200, 0, 10), lose100Ref)).toEqual({
      ok: false,
      error: { step: 'lowMacro', field: 'fat', value: 0 },
    });
  });

  it('lowers protein until fat has room for the remainder, then refuses the low fat', () => {
    // 2 003 kcal needs fat ≡ 3 (mod 4): protein drops from 500 to 494 to leave 27 kcal for 3 g fat.
    expect(exactPlan({ kcal: 2003, protein: 500, carbs: 0, fat: 10 })).toEqual({
      kcal: 2003,
      protein: 494,
      carbs: 0,
      fat: 3,
    });
    expect(checkPlan(reply(2003, 500, 0, 10), lose100Ref)).toEqual({
      ok: false,
      error: { step: 'lowMacro', field: 'fat', value: 3 },
    });
  });

  it('caps protein at kcal div 4 and fat at 400 g', () => {
    expect(exactPlan({ kcal: 1000, protein: 300, carbs: 0, fat: 10 }).protein).toBeLessThanOrEqual(
      250,
    );
    const fatCapped = exactPlan({ kcal: 6000, protein: 10, carbs: 0, fat: 400 });
    expect(fatCapped.fat).toBe(400);
    expect(macroKcal(fatCapped)).toBe(6000);
  });
});

describe('fatWithResidue (R01.9)', () => {
  it('picks the nearest value with the remainder, ties to the lower', () => {
    expect(fatWithResidue(61, 0, 155)).toBe(60);
    expect(fatWithResidue(62, 0, 155)).toBe(60);
    expect(fatWithResidue(63, 0, 155)).toBe(64);
    expect(fatWithResidue(61, 1, 155)).toBe(61);
    expect(fatWithResidue(61, 2, 155)).toBe(62);
    expect(fatWithResidue(61, 3, 155)).toBe(59);
  });

  it('stays inside 0…capacity', () => {
    expect(fatWithResidue(63, 0, 63)).toBe(60);
    expect(fatWithResidue(5, 3, 5)).toBe(3);
  });

  it('uses a true floor-mod when the target is below the remainder', () => {
    // floorMod(0 − 2, 4) = 2, so the candidates are −2 and 2; `%` would give −2 and pick 2 + 2 = 4.
    expect((0 - 2) % 4).toBe(-2);
    expect(floorMod(0 - 2, 4)).toBe(2);
    expect(fatWithResidue(0, 2, 10)).toBe(2);
    expect(fatWithResidue(1, 3, 10)).toBe(3);
  });

  it('falls back to the remainder capped at the capacity when nothing fits', () => {
    expect(fatWithResidue(0, 3, 2)).toBe(2);
  });
});

describe('checkPlan: plausibility (step 6)', () => {
  it('derives the spans from the formula plan', () => {
    expect(plausibleRanges(defaultRef)).toEqual({
      protein: { min: 78, max: 146 },
      fat: { min: 21, max: 63 },
      kcal: { min: 1226, max: 4904 },
    });
    expect(plausibleRanges(smallCutRef)).toEqual({
      protein: { min: 50, max: 94 },
      fat: { min: 16, max: 47 },
      kcal: { min: 800, max: 2740 },
    });
  });

  it('uses at least 10 g as the macro reference and clamps the kcal reference to 800–6 000', () => {
    expect(plausibleRanges({ kcal: 300, protein: 4, carbs: 0, fat: 2 })).toEqual({
      protein: { min: 7, max: 13 },
      fat: { min: 5, max: 15 },
      kcal: { min: 800, max: 1600 },
    });
    expect(plausibleRanges({ kcal: 9000, protein: 200, carbs: 0, fat: 100 }).kcal).toEqual({
      min: 3000,
      max: 6000,
    });
  });

  it('refuses fat outside 50–150 % of the formula fat', () => {
    expect(checkPlan(reply(2000, 120, 335, 20), defaultRef)).toEqual({
      ok: false,
      error: { step: 'plausibility', field: 'fat', value: 20, allowed: { min: 21, max: 63 } },
    });
  });

  it('accepts the span ends', () => {
    expect(checkPlan(reply(2003, 146, 208, 63), defaultRef)).toEqual({
      ok: true,
      value: { kcal: 2003, protein: 146, carbs: 213, fat: 63 },
    });
    expect(checkPlan(reply(1226, 78, 179, 21), defaultRef)).toEqual({
      ok: true,
      value: { kcal: 1226, protein: 78, carbs: 179, fat: 22 },
    });
  });
});

describe('checkPlan: reason (step 7)', () => {
  it('keeps a non-blank reason, trimmed', () => {
    const result = checkPlan(
      { ...reply(2000, 150, 215, 61), reason: '  Fits your trend ' },
      lose100Ref,
    );
    expect(result).toMatchObject({ ok: true, value: { reason: 'Fits your trend' } });
  });

  it('drops a blank or non-text reason', () => {
    for (const reason of ['', '   ', 42, null, { text: 'x' }]) {
      const result = checkPlan({ ...reply(2000, 150, 215, 61), reason }, lose100Ref);
      expect(isOk(result) && !('reason' in result.value)).toBe(true);
    }
  });
});

describe('checkPlan: exact energy sweep', () => {
  it('gives 4P + 4C + 9F = kcal for every accepted reply in a sweep of coherent replies', () => {
    // A fixed linear congruential generator, so the sweep is the same on every run.
    let seed = 20_261_026;
    const next = (): number => {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
      return seed / 2_147_483_648;
    };
    let accepted = 0;
    for (let i = 0; i < 3000; i += 1) {
      const protein = 10 + next() * 290;
      const fat = 10 + next() * 190;
      const carbs = next() * 700;
      const kcal = macroKcal({ protein, carbs, fat }) * (0.9 + next() * 0.2);
      if (kcal < 800 || kcal > 6000) continue;
      const reference = {
        kcal: Math.round(kcal),
        protein: Math.round(protein),
        carbs: 0,
        fat: Math.round(fat),
      };
      const result = checkPlan(reply(kcal, protein, carbs, fat), reference);
      if (!isOk(result)) continue;
      accepted += 1;
      const plan = result.value;
      for (const value of [plan.kcal, plan.protein, plan.carbs, plan.fat]) {
        expect(Number.isInteger(value)).toBe(true);
      }
      expect(macroKcal(plan)).toBe(plan.kcal);
      expect(floorMod(plan.fat, 4)).toBe(floorMod(plan.kcal, 4));
      expect(plan.carbs).toBeGreaterThanOrEqual(0);
      expect(plan.fat).toBeLessThanOrEqual(400);
    }
    expect(accepted).toBeGreaterThan(1000);
  });

  it('normalises every kcal from 800 to 6 000 to an exact sum', () => {
    for (let kcal = 800; kcal <= 6000; kcal += 1) {
      const plan = exactPlan({ kcal, protein: 150, carbs: 0, fat: 61 });
      expect(macroKcal(plan)).toBe(kcal);
    }
  });
});

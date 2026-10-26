import { describe, expect, it } from 'vitest';
import { FIXTURE_TODAY, katchProfile } from './__fixtures__/profiles';
import { formulaPlan, paceAdjustment } from './formulas';
import { MAINTENANCE_BAND, balanceOf, estimateMaintenance } from './maintenance';
import { effectiveTargets } from './targets';

describe('estimateMaintenance', () => {
  it('uses the truncated daily burn: 2 102 for the 80 kg lean-mass profile', () => {
    const plan = formulaPlan(katchProfile, FIXTURE_TODAY);
    expect(estimateMaintenance(katchProfile, FIXTURE_TODAY, plan.kcal)).toEqual({
      maintenanceKcal: 2_102,
      targetKcal: 2_102,
      difference: 0,
      balance: 'close',
    });
  });

  it("gives a formula target's pace adjustment as the difference", () => {
    const gaining = { ...katchProfile, goal: 'gain' as const, weeklyKg: 0.25 };
    const losing = { ...katchProfile, goal: 'lose' as const, weeklyKg: 0.5 };
    const gain = estimateMaintenance(
      gaining,
      FIXTURE_TODAY,
      formulaPlan(gaining, FIXTURE_TODAY).kcal,
    );
    const lose = estimateMaintenance(
      losing,
      FIXTURE_TODAY,
      formulaPlan(losing, FIXTURE_TODAY).kcal,
    );
    expect(gain.difference).toBe(paceAdjustment(gaining));
    expect(gain).toMatchObject({ difference: 275, balance: 'surplus' });
    expect(lose).toMatchObject({ difference: -550, balance: 'deficit' });
  });

  it('compares a saved target as the one followed', () => {
    const profile = { ...katchProfile, saved: { kcal: 2_600 } };
    const target = effectiveTargets(profile.saved, formulaPlan(profile, FIXTURE_TODAY)).kcal;
    expect(estimateMaintenance(profile, FIXTURE_TODAY, target)).toEqual({
      maintenanceKcal: 2_102,
      targetKcal: 2_600,
      difference: 498,
      balance: 'surplus',
    });
  });
});

describe('balanceOf', () => {
  it('reads gaps under 50 kcal either way as close', () => {
    expect(MAINTENANCE_BAND).toBe(50);
    expect(balanceOf(-49)).toBe('close');
    expect(balanceOf(-40)).toBe('close');
    expect(balanceOf(0)).toBe('close');
    expect(balanceOf(49)).toBe('close');
  });

  it('reads −50 or lower as a deficit and +50 or higher as a surplus', () => {
    expect(balanceOf(-50)).toBe('deficit');
    expect(balanceOf(-550)).toBe('deficit');
    expect(balanceOf(50)).toBe('surplus');
    expect(balanceOf(498)).toBe('surplus');
  });
});

import { describe, expect, it } from 'vitest';
import type { Profile } from '../model';
import { paceAdjustment } from './formulas';
import {
  MAINTENANCE_TOLERANCE,
  balanceOf,
  compareToMaintenance,
  maintenanceEstimate,
} from './maintenance';
import { FIXTURE_TODAY, defaultProfile, leanMassProfile } from './__fixtures__/profiles';

const today = FIXTURE_TODAY;

describe('balanceOf', () => {
  it('reads −49 and +49 as close, −50 as a deficit and +50 as a surplus', () => {
    expect(MAINTENANCE_TOLERANCE).toBe(50);
    expect(balanceOf(-49)).toBe('close');
    expect(balanceOf(49)).toBe('close');
    expect(balanceOf(0)).toBe('close');
    expect(balanceOf(-50)).toBe('deficit');
    expect(balanceOf(50)).toBe('surplus');
    expect(balanceOf(-550)).toBe('deficit');
    expect(balanceOf(1100)).toBe('surplus');
  });
});

describe('compareToMaintenance', () => {
  it('gives the difference as target minus maintenance', () => {
    expect(compareToMaintenance(2000, 1951)).toEqual({
      maintenance: 2000,
      target: 1951,
      difference: -49,
      balance: 'close',
    });
    expect(compareToMaintenance(2000, 1950).balance).toBe('deficit');
    expect(compareToMaintenance(2000, 2050).balance).toBe('surplus');
  });
});

describe('maintenanceEstimate', () => {
  it('gives 80 kg at 20 % body fat, sedentary, maintenance 2 102 and a formula target 0 kcal away', () => {
    expect(maintenanceEstimate(leanMassProfile, today)).toEqual({
      maintenance: 2102,
      target: 2102,
      difference: 0,
      balance: 'close',
    });
  });

  it('gives a formula target a difference equal to its pace adjustment: +275 surplus, −550 deficit', () => {
    const gain: Profile = { ...leanMassProfile, goal: 'gain', weeklyKg: 0.25 };
    const lose: Profile = { ...leanMassProfile, goal: 'lose', weeklyKg: 0.5 };
    expect(maintenanceEstimate(gain, today).difference).toBe(paceAdjustment('gain', 0.25));
    expect(maintenanceEstimate(gain, today)).toMatchObject({ difference: 275, balance: 'surplus' });
    expect(maintenanceEstimate(lose, today)).toMatchObject({
      difference: -550,
      balance: 'deficit',
    });
    const fast: Profile = { ...defaultProfile, goal: 'lose', weeklyKg: 1 };
    expect(maintenanceEstimate(fast, today)).toMatchObject({
      maintenance: 2452,
      target: 1352,
      difference: -1100,
    });
  });

  it('compares a saved 2 600 kcal target with 2 102: a 498 kcal surplus', () => {
    const saved: Profile = { ...leanMassProfile, saved: { kcal: 2600 } };
    expect(maintenanceEstimate(saved, today)).toEqual({
      maintenance: 2102,
      target: 2600,
      difference: 498,
      balance: 'surplus',
    });
  });

  it('reads an AI-tuned maintain target 30 kcal under maintenance as close, not a deficit', () => {
    const tuned: Profile = { ...defaultProfile, saved: { kcal: 2422, protein: 120 } };
    expect(maintenanceEstimate(tuned, today)).toMatchObject({
      maintenance: 2452,
      difference: -30,
      balance: 'close',
    });
  });
});

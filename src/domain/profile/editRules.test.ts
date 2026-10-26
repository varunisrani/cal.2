import { describe, expect, it } from 'vitest';
import { isOk } from '../../lib/result';
import type { Profile } from '../model';
import {
  checkGoalWeight,
  paceIdOf,
  withBodyFat,
  withGoal,
  withGoalBodyFat,
  withGoalWeight,
  withWeight,
  DEFAULT_WEEKLY_KG,
  PACE_IDS,
  PACE_PRESETS,
} from './editRules';
import { profileDefaults } from './profile';

const base: Profile = {
  ...profileDefaults('2026-10-26'),
  saved: { kcal: 2100, protein: 150 },
  caloriesLocked: true,
  lockedMacros: ['protein'],
};

function losing(goalWeightKg?: number): Profile {
  const profile: Profile = { ...base, goal: 'lose', weeklyKg: 0.5 };
  return goalWeightKg === undefined ? profile : { ...profile, goalWeightKg };
}

function gaining(goalWeightKg?: number): Profile {
  const profile: Profile = { ...base, goal: 'gain', weeklyKg: 0.25 };
  return goalWeightKg === undefined ? profile : { ...profile, goalWeightKg };
}

describe('checkGoalWeight', () => {
  it('refuses a lose target at or above the current weight (R01.6, D-16.11)', () => {
    expect(checkGoalWeight({ goal: 'lose', weightKg: 70 }, 70)).toBe('notBelowCurrent');
    expect(checkGoalWeight({ goal: 'lose', weightKg: 70 }, 72)).toBe('notBelowCurrent');
    expect(checkGoalWeight({ goal: 'lose', weightKg: 70 }, 69.9)).toBeNull();
  });

  it('refuses a gain target at or below the current weight (R01.6, D-16.11)', () => {
    expect(checkGoalWeight({ goal: 'gain', weightKg: 70 }, 70)).toBe('notAboveCurrent');
    expect(checkGoalWeight({ goal: 'gain', weightKg: 70 }, 65)).toBe('notAboveCurrent');
    expect(checkGoalWeight({ goal: 'gain', weightKg: 70 }, 70.1)).toBeNull();
  });

  it('accepts any target for maintain', () => {
    for (const kg of [50, 70, 90]) {
      expect(checkGoalWeight({ goal: 'maintain', weightKg: 70 }, kg)).toBeNull();
    }
  });

  it('refuses a target that is not a number for lose and gain', () => {
    expect(checkGoalWeight({ goal: 'lose', weightKg: 70 }, Number.NaN)).toBe('notBelowCurrent');
    expect(checkGoalWeight({ goal: 'gain', weightKg: 70 }, Number.NaN)).toBe('notAboveCurrent');
  });
});

describe('withGoalWeight', () => {
  it('saves a target on the right side', () => {
    const result = withGoalWeight(losing(), 64);
    expect(isOk(result) && result.value.goalWeightKg).toBe(64);
  });

  it('refuses a target on the wrong side and changes nothing', () => {
    const before = losing(65);
    const result = withGoalWeight(before, 75);
    expect(result).toStrictEqual({ ok: false, error: 'notBelowCurrent' });
    expect(before.goalWeightKg).toBe(65);
    expect(withGoalWeight(gaining(), 60)).toStrictEqual({ ok: false, error: 'notAboveCurrent' });
  });
});

describe('withGoal', () => {
  it('clears pace and target when switching gain to maintain', () => {
    const next = withGoal(gaining(80), 'maintain');
    expect(next.goal).toBe('maintain');
    expect(next).not.toHaveProperty('weeklyKg');
    expect(next).not.toHaveProperty('goalWeightKg');
  });

  it('starts lose and gain at 0.5 kg a week when no pace is set', () => {
    expect(withGoal(base, 'lose').weeklyKg).toBe(0.5);
    expect(withGoal(base, 'gain').weeklyKg).toBe(DEFAULT_WEEKLY_KG);
  });

  it('keeps a pace that is already set', () => {
    expect(withGoal(gaining(), 'lose').weeklyKg).toBe(0.25);
    expect(withGoal({ ...base, weeklyKg: 1 }, 'gain').weeklyKg).toBe(1);
  });

  it('drops a target on the wrong side of the current weight for the new direction', () => {
    expect(withGoal(losing(65), 'gain')).not.toHaveProperty('goalWeightKg');
    expect(withGoal(gaining(80), 'lose')).not.toHaveProperty('goalWeightKg');
  });

  it('keeps a target that still fits the direction', () => {
    expect(withGoal(losing(65), 'lose').goalWeightKg).toBe(65);
    expect(withGoal({ ...base, goalWeightKg: 80 }, 'gain').goalWeightKg).toBe(80);
  });

  it('does not change the profile it was given', () => {
    const before = gaining(80);
    withGoal(before, 'maintain');
    expect(before).toStrictEqual(gaining(80));
  });
});

describe('withWeight', () => {
  it('clears a lose target once a weigh-in reaches it or goes below it', () => {
    expect(withWeight(losing(65), 65)).not.toHaveProperty('goalWeightKg');
    expect(withWeight(losing(65), 64.2)).not.toHaveProperty('goalWeightKg');
  });

  it('keeps a lose target when the new weight is still above it', () => {
    const next = withWeight(losing(65), 72);
    expect(next.weightKg).toBe(72);
    expect(next.goalWeightKg).toBe(65);
  });

  it('clears a gain target once a weigh-in reaches it or goes above it', () => {
    expect(withWeight(gaining(80), 80)).not.toHaveProperty('goalWeightKg');
    expect(withWeight(gaining(80), 81)).not.toHaveProperty('goalWeightKg');
    expect(withWeight(gaining(80), 75).goalWeightKg).toBe(80);
  });

  it('never clears a target for maintain', () => {
    const maintaining: Profile = { ...base, goalWeightKg: 65 };
    expect(withWeight(maintaining, 60).goalWeightKg).toBe(65);
  });
});

describe('withBodyFat and withGoalBodyFat', () => {
  it('clears goal body fat when body fat is cleared', () => {
    const next = withBodyFat({ ...base, bodyFat: 0.22, goalBodyFat: 0.18 }, null);
    expect(next).not.toHaveProperty('bodyFat');
    expect(next).not.toHaveProperty('goalBodyFat');
  });

  it('keeps goal body fat when body fat changes', () => {
    const next = withBodyFat({ ...base, bodyFat: 0.22, goalBodyFat: 0.18 }, 0.21);
    expect(next.bodyFat).toBe(0.21);
    expect(next.goalBodyFat).toBe(0.18);
  });

  it('sets and removes goal body fat next to a body fat value', () => {
    const withFat: Profile = { ...base, bodyFat: 0.22 };
    expect(withGoalBodyFat(withFat, 0.15).goalBodyFat).toBe(0.15);
    expect(withGoalBodyFat({ ...withFat, goalBodyFat: 0.15 }, null)).not.toHaveProperty(
      'goalBodyFat',
    );
  });

  it('keeps no goal body fat without a body fat value', () => {
    expect(withGoalBodyFat(base, 0.15)).not.toHaveProperty('goalBodyFat');
  });
});

describe('pace presets', () => {
  it('are 0.25, 0.5 and 1.0 kg a week', () => {
    expect(PACE_IDS.map((id) => PACE_PRESETS[id])).toStrictEqual([0.25, 0.5, 1]);
  });

  it('name a stored pace only when it matches a preset exactly', () => {
    expect(paceIdOf(0.25)).toBe('slow');
    expect(paceIdOf(0.5)).toBe('steady');
    expect(paceIdOf(1)).toBe('fast');
    expect(paceIdOf(0.75)).toBeNull();
    expect(paceIdOf(undefined)).toBeNull();
  });
});

describe('edits and the plan', () => {
  it('leave the saved targets and locks as they were for every field edit (R01.12)', () => {
    const goalWeight = withGoalWeight(losing(), 60);
    const edited: Profile[] = [
      withGoal(base, 'lose'),
      withGoal(gaining(80), 'maintain'),
      withWeight(losing(65), 64),
      withBodyFat(base, 0.25),
      withBodyFat({ ...base, bodyFat: 0.25 }, null),
      withGoalBodyFat({ ...base, bodyFat: 0.25 }, 0.2),
      ...(isOk(goalWeight) ? [goalWeight.value] : []),
    ];
    expect(edited).toHaveLength(7);
    for (const profile of edited) {
      expect(profile.saved).toStrictEqual({ kcal: 2100, protein: 150 });
      expect(profile.caloriesLocked).toBe(true);
      expect(profile.lockedMacros).toStrictEqual(['protein']);
    }
  });
});

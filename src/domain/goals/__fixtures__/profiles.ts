// Named profiles for the goal, evidence and forecast tests. Our own values: each one is there for a
// worked example in the research spec or a test vector of the plan validator.

import type { Profile } from '../../model';

/** The day the fixtures are read on; every birth date below is relative to it. */
export const FIXTURE_TODAY = '2026-10-26';

/** A new person's profile: male, 25 years old today, 175 cm, 70 kg, moderate, maintain. */
export const defaultProfile: Profile = {
  sex: 'male',
  birthDate: '2001-10-26',
  heightCm: 175,
  weightKg: 70,
  activity: 'moderate',
  goal: 'maintain',
  saved: {},
  allergens: [],
  caloriesLocked: false,
  lockedMacros: [],
};

/** Body fat known, so the lean-mass equation applies: 80 kg, 20 % body fat, sedentary. */
export const leanMassProfile: Profile = {
  ...defaultProfile,
  weightKg: 80,
  bodyFat: 0.2,
  activity: 'sedentary',
};

/** A heavier person losing weight: 100 kg, 30 % body fat, moderate, lose at the default pace. */
export const lose100Profile: Profile = {
  ...defaultProfile,
  weightKg: 100,
  bodyFat: 0.3,
  goal: 'lose',
};

/** A lighter person losing slowly, whose formula plan sits near the low kcal end. */
export const smallCutProfile: Profile = {
  ...defaultProfile,
  sex: 'female',
  birthDate: '1996-03-14',
  heightCm: 158,
  weightKg: 52,
  activity: 'light',
  goal: 'lose',
  weeklyKg: 0.25,
};

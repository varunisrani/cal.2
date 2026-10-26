// Named profiles for the goal, evidence and forecast tests. Ages are worked out against
// `FIXTURE_TODAY`, so pass it as "today" wherever a profile's age matters.

import type { DayKey } from '../../dates/dayKey';
import type { Profile } from '../../model';

/** The day every fixture age is measured on. */
export const FIXTURE_TODAY: DayKey = '2026-10-26';

/** Male, 25 on `FIXTURE_TODAY`, 175 cm, 70 kg, moderate, maintain; nothing saved, no locks. */
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

/** 80 kg at 20 % body fat, sedentary: the lean-mass equation applies. */
export const katchProfile: Profile = {
  ...defaultProfile,
  weightKg: 80,
  bodyFat: 0.2,
  activity: 'sedentary',
};

/** 100 kg at 30 % body fat, moderate, losing at the default pace. */
export const lose100Profile: Profile = {
  ...defaultProfile,
  weightKg: 100,
  bodyFat: 0.3,
  activity: 'moderate',
  goal: 'lose',
};

/** `defaultProfile` with some fields changed. */
export function profileWith(changes: Partial<Profile>): Profile {
  return { ...defaultProfile, ...changes };
}

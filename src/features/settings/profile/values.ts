// How Personal info writes stored values: in the person's units, with the locale's numbers, and
// the wizard's own names for sex, activity and pace.

import { ageOn } from '../../../domain/dates/age';
import type { DayKey } from '../../../domain/dates/dayKey';
import type { Activity, GoalKind, Sex } from '../../../domain/model';
import type { PaceId } from '../../../domain/profile/editRules';
import {
  feetInches,
  formatPace,
  formatWeight,
  heightCmShown,
  type HeightDisplayUnit,
  type WeightDisplayUnit,
} from '../../../domain/units/body';
import { formatDay, formatDecimal, formatInt } from '../../../i18n/format';
import { currentLocale } from '../../../i18n/locale';
import { t, type TKey } from '../../../i18n/t';

export const SEX_KEYS: Readonly<Record<Sex, TKey>> = {
  male: 'onboarding.sex.male',
  female: 'onboarding.sex.female',
  other: 'onboarding.sex.other',
};

export const GOAL_KEYS: Readonly<Record<GoalKind, TKey>> = {
  lose: 'profile.goal.lose',
  maintain: 'profile.goal.maintain',
  gain: 'profile.goal.gain',
};

export const PACE_KEYS: Readonly<Record<PaceId, TKey>> = {
  slow: 'onboarding.pace.slow',
  steady: 'onboarding.pace.steady',
  fast: 'onboarding.pace.fast',
};

export const ACTIVITY_KEYS: Readonly<
  Record<Activity, { readonly name: TKey; readonly about: TKey }>
> = {
  sedentary: {
    name: 'onboarding.activity.levels.sedentary.name',
    about: 'onboarding.activity.levels.sedentary.about',
  },
  light: {
    name: 'onboarding.activity.levels.light.name',
    about: 'onboarding.activity.levels.light.about',
  },
  moderate: {
    name: 'onboarding.activity.levels.moderate.name',
    about: 'onboarding.activity.levels.moderate.about',
  },
  active: {
    name: 'onboarding.activity.levels.active.name',
    about: 'onboarding.activity.levels.active.about',
  },
  hard: {
    name: 'onboarding.activity.levels.hard.name',
    about: 'onboarding.activity.levels.hard.about',
  },
  athlete: {
    name: 'onboarding.activity.levels.athlete.name',
    about: 'onboarding.activity.levels.athlete.about',
  },
};

const WEIGHT_KEYS: Readonly<Record<WeightDisplayUnit, TKey>> = {
  kg: 'profile.value.kg',
};

const PACE_AMOUNT_KEYS: Readonly<Record<WeightDisplayUnit, TKey>> = {
  kg: 'profile.value.paceKg',
};

/** "70.0 kg": one decimal in the person's unit, kg (D-16.91). */
export function weightText(kg: number, unit: WeightDisplayUnit): string {
  return t(WEIGHT_KEYS[unit], { value: formatWeight(kg, unit, currentLocale()) });
}

/** "170 cm" (whole centimetres, truncated) or "5 ft 7 in" (from the nearest inch). */
export function heightText(cm: number, unit: HeightDisplayUnit): string {
  if (unit === 'cm') return t('profile.value.cm', { value: formatInt(heightCmShown(cm)) });
  const { feet, inches } = feetInches(cm);
  return t('profile.value.ftIn', { feet, inches });
}

/** A body-fat fraction as a percentage with at most one decimal: 0.183 → "18.3 %". */
export function percentText(fraction: number): string {
  return t('profile.value.percent', { value: formatDecimal(fraction * 100, 1) });
}

/** "0.5 kg a week". */
export function paceText(kgPerWeek: number, unit: WeightDisplayUnit): string {
  return t(PACE_AMOUNT_KEYS[unit], { amount: formatPace(kgPerWeek, unit) });
}

/** The birth date and the age it gives today: "Mar 14, 1994 (32 years old)". */
export function birthdayText(birthDate: DayKey, today: DayKey): string {
  return t('profile.value.birthday', {
    date: formatDay(birthDate, 'medium'),
    age: ageOn(birthDate, today),
  });
}

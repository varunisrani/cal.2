import { describe, expect, it } from 'vitest';
import { ageOn } from '../dates/age';
import { formulaPlan } from '../goals/formulas';
import type { Profile } from '../model';
import { inTimeZone } from '../../test/time';
import {
  DEFAULT_AGE_YEARS,
  defaultBirthDate,
  defaultProfile,
  sameProfile,
  startingSetup,
} from './profile';

const today = '2026-10-26';

describe('defaultProfile', () => {
  it('starts male, 25 years old, 175 cm, 70 kg, moderate, maintain, with nothing else set', () => {
    expect(defaultProfile(today)).toEqual({
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
    });
    expect(ageOn(defaultProfile(today).birthDate, today)).toBe(DEFAULT_AGE_YEARS);
  });

  it('gives the default plan of 2 452 kcal, 112 / 406 / 42 g (ACC-C1-1)', () => {
    expect(formulaPlan(defaultProfile(today), today)).toEqual({
      kcal: 2452,
      protein: 112,
      carbs: 406,
      fat: 42,
    });
  });

  it('gives each call its own lists and saved targets', () => {
    const a = defaultProfile(today);
    const b = defaultProfile(today);
    expect(a.saved).not.toBe(b.saved);
    expect(a.allergens).not.toBe(b.allergens);
  });
});

describe('defaultBirthDate', () => {
  it('goes back 25 calendar years', () => {
    expect(defaultBirthDate('2026-01-01')).toBe('2001-01-01');
    expect(defaultBirthDate('2026-12-31')).toBe('2001-12-31');
  });

  it('lands on 28 February when 29 February does not exist 25 years earlier', () => {
    expect(defaultBirthDate('2028-02-29')).toBe('2003-02-28');
    expect(defaultBirthDate('2024-02-29')).toBe('1999-02-28');
    expect(defaultBirthDate('2025-02-28')).toBe('2000-02-28');
  });

  it('gives the same birth date in Asia/Tokyo (R01.15)', () => {
    const inTokyo = inTimeZone('Asia/Tokyo', () => defaultBirthDate(today));
    expect(inTokyo).toBe('2001-10-26');
  });
});

describe('startingSetup', () => {
  it('seeds the units from the locale with the default profile', () => {
    expect(startingSetup(today, 'en-US')).toEqual({
      profile: defaultProfile(today),
      units: { energy: 'kcal', height: 'ftIn', weight: 'lb' },
    });
    expect(startingSetup(today, 'de-DE').units).toEqual({
      energy: 'kcal',
      height: 'cm',
      weight: 'kg',
    });
  });
});

describe('sameProfile', () => {
  const base: Profile = {
    ...defaultProfile(today),
    allergens: ['peanut'],
    saved: { kcal: 2000, protein: 150 },
    goal: 'lose',
    weeklyKg: 0.5,
  };

  it('treats a copy as the same profile', () => {
    expect(sameProfile(base, structuredClone(base))).toBe(true);
  });

  it('sees any changed field, nested targets, locks and lists included (R01.4)', () => {
    const changes: Profile[] = [
      { ...base, weightKg: 70.1 },
      { ...base, sex: 'female' },
      { ...base, weeklyKg: 1 },
      { ...base, goalWeightKg: 65 },
      { ...base, saved: { kcal: 2000, protein: 155 } },
      { ...base, saved: { kcal: 2000 } },
      { ...base, caloriesLocked: true },
      { ...base, lockedMacros: ['fat'] },
      { ...base, allergens: ['peanut', 'sesame'] },
      { ...base, allergens: [] },
      { ...base, goalBodyFat: 0.18 },
    ];
    for (const changed of changes) expect(sameProfile(base, changed)).toBe(false);
  });

  it('counts a field set to undefined as missing', () => {
    expect(sameProfile(base, { ...base, bodyFat: undefined })).toBe(true);
    expect(
      sameProfile({ ...base, saved: { kcal: 2000, protein: 150, fat: undefined } }, base),
    ).toBe(true);
  });
});

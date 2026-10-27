import { describe, expect, it } from 'vitest';
import { ageOn } from '../dates/age';
import type { Profile } from '../model';
import {
  birthDateYearsBefore,
  firstRunDefaults,
  profileDefaults,
  sameProfile,
  DEFAULT_AGE_YEARS,
} from './profile';

const TODAY = '2026-10-26';

describe('profileDefaults', () => {
  it('starts a male, moderately active, maintaining person at 175 cm and 70 kg', () => {
    const profile = profileDefaults(TODAY);
    expect(profile.sex).toBe('male');
    expect(profile.heightCm).toBe(175);
    expect(profile.weightKg).toBe(70);
    expect(profile.activity).toBe('moderate');
    expect(profile.goal).toBe('maintain');
  });

  it('is born 25 years before today and is 25 on that day', () => {
    const profile = profileDefaults(TODAY);
    expect(profile.birthDate).toBe('2001-10-26');
    expect(ageOn(profile.birthDate, TODAY)).toBe(DEFAULT_AGE_YEARS);
  });

  it('has no locks, no saved targets, no allergens and no optional body data', () => {
    expect(profileDefaults(TODAY)).toStrictEqual({
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
  });

  it('returns a fresh record on every call', () => {
    const first = profileDefaults(TODAY);
    const second = profileDefaults(TODAY);
    expect(first).not.toBe(second);
    expect(first.saved).not.toBe(second.saved);
  });
});

describe('birthDateYearsBefore', () => {
  it('keeps the month and day', () => {
    expect(birthDateYearsBefore('2026-01-01', 25)).toBe('2001-01-01');
    expect(birthDateYearsBefore('2026-12-31', 25)).toBe('2001-12-31');
  });

  it('turns 29 February into 28 February when the earlier year has none', () => {
    expect(birthDateYearsBefore('2028-02-29', 25)).toBe('2003-02-28');
    expect(ageOn(birthDateYearsBefore('2028-02-29', 25), '2028-02-29')).toBe(25);
    expect(birthDateYearsBefore('2028-02-29', 4)).toBe('2024-02-29');
  });

  it('throws a RangeError for a malformed today', () => {
    expect(() => birthDateYearsBefore('2026-02-30', 25)).toThrow(RangeError);
  });
});

describe('firstRunDefaults', () => {
  it('seeds kg and feet and inches for en-US (D-16.91)', () => {
    const { profile, units } = firstRunDefaults(TODAY, 'en-US');
    expect(profile).toStrictEqual(profileDefaults(TODAY));
    expect(units).toStrictEqual({ energy: 'kcal', height: 'ftIn', weight: 'kg' });
  });

  it('seeds kg and cm together for de-DE and a tag that cannot be read', () => {
    expect(firstRunDefaults(TODAY, 'de-DE').units).toStrictEqual({
      energy: 'kcal',
      height: 'cm',
      weight: 'kg',
    });
    expect(firstRunDefaults(TODAY, 'not a tag').units.weight).toBe('kg');
  });
});

describe('sameProfile', () => {
  const base: Profile = {
    ...profileDefaults(TODAY),
    goal: 'lose',
    weeklyKg: 0.5,
    goalWeightKg: 65,
    saved: { kcal: 2000, protein: 140 },
    allergens: ['peanut', 'milk'],
    lockedMacros: ['protein'],
  };

  it('is true for a copy with new arrays and objects', () => {
    const copy: Profile = {
      ...base,
      saved: { ...base.saved },
      allergens: [...base.allergens],
      lockedMacros: [...base.lockedMacros],
    };
    expect(sameProfile(base, copy)).toBe(true);
  });

  it('treats a key holding undefined as absent', () => {
    expect(sameProfile({ ...base, bodyFat: undefined }, base)).toBe(true);
    expect(sameProfile(base, { ...base, saved: { ...base.saved, carbs: undefined } })).toBe(true);
  });

  it('is false when any field differs (R01.4)', () => {
    const edits: Array<Partial<Profile>> = [
      { weightKg: 70.1 },
      { activity: 'light' },
      { goalBodyFat: 0.18 },
      { allergens: ['peanut'] },
      { allergens: ['milk', 'peanut'] },
      { saved: { kcal: 2000, protein: 145 } },
      { saved: { kcal: 2000, protein: 140, fat: 60 } },
      { caloriesLocked: true },
      { lockedMacros: [] },
      { lockedMacros: ['protein', 'fat'] },
    ];
    for (const edit of edits) {
      expect(sameProfile(base, { ...base, ...edit }), JSON.stringify(edit)).toBe(false);
    }
  });
});

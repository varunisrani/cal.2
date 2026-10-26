import { describe, expect, expectTypeOf, it } from 'vitest';
import type { DayKey } from './dates/dayKey';
import {
  ACTIVITIES,
  COACH_ROLES,
  ENTRY_SOURCES,
  EXTRA_KEYS,
  GOAL_KINDS,
  MACRO_KEYS,
  MAX_LOCKED_MACROS,
  MEAL_KINDS,
  NUTRIENT_KEYS,
  SEXES,
  isActivity,
  isCoachRole,
  isEntrySource,
  isExtraKey,
  isGoalKind,
  isLockedMacros,
  isMacroKey,
  isMealKind,
  isNutrientKey,
  isSex,
  type DiaryEntry,
  type Fast,
  type MacroKey,
  type NutrientValues,
  type Profile,
  type ServingBasis,
} from './model';

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const unions: Array<{
  name: string;
  list: readonly string[];
  guard: (value: unknown) => boolean;
  nearMiss: string;
}> = [
  { name: 'meal kinds', list: MEAL_KINDS, guard: isMealKind, nearMiss: 'Snack' },
  { name: 'entry sources', list: ENTRY_SOURCES, guard: isEntrySource, nearMiss: 'photos' },
  { name: 'nutrient keys', list: NUTRIENT_KEYS, guard: isNutrientKey, nearMiss: 'fiber' },
  { name: 'extra keys', list: EXTRA_KEYS, guard: isExtraKey, nearMiss: 'beta-alanine' },
  { name: 'macro keys', list: MACRO_KEYS, guard: isMacroKey, nearMiss: 'carb' },
  { name: 'sexes', list: SEXES, guard: isSex, nearMiss: 'Female' },
  { name: 'activity levels', list: ACTIVITIES, guard: isActivity, nearMiss: 'very active' },
  { name: 'goal kinds', list: GOAL_KINDS, guard: isGoalKind, nearMiss: 'maintenance' },
  { name: 'coach roles', list: COACH_ROLES, guard: isCoachRole, nearMiss: 'model' },
];

describe('union guards', () => {
  for (const { name, list, guard, nearMiss } of unions) {
    it(`accept every one of the ${name}`, () => {
      for (const member of list) expect(guard(member), member).toBe(true);
    });

    it(`reject near misses of the ${name}`, () => {
      const first = list[0] ?? '';
      const misses: unknown[] = [
        nearMiss,
        '',
        capitalise(first),
        first.toUpperCase(),
        ` ${first}`,
        `${first} `,
        null,
        undefined,
        0,
        [first],
        { [first]: true },
      ];
      for (const miss of misses) expect(guard(miss), JSON.stringify(miss)).toBe(false);
    });
  }

  it('reject the case variant Snack and the empty string as meal kinds', () => {
    expect(isMealKind('Snack')).toBe(false);
    expect(isMealKind('')).toBe(false);
    expect(isMealKind('snack')).toBe(true);
  });
});

describe('closed lists', () => {
  it('have the documented sizes and no repeats', () => {
    const sizes: Array<[readonly string[], number]> = [
      [MEAL_KINDS, 5],
      [ENTRY_SOURCES, 5],
      [NUTRIENT_KEYS, 23],
      [EXTRA_KEYS, 8],
      [MACRO_KEYS, 3],
      [SEXES, 3],
      [ACTIVITIES, 6],
      [GOAL_KINDS, 3],
      [COACH_ROLES, 2],
    ];
    for (const [list, size] of sizes) {
      expect(list).toHaveLength(size);
      expect(new Set(list).size).toBe(size);
    }
  });

  it('keep nutrients, extras and macros apart', () => {
    const all = [...NUTRIENT_KEYS, ...EXTRA_KEYS, ...MACRO_KEYS];
    expect(new Set(all).size).toBe(all.length);
  });

  it('list activity levels from least to most active', () => {
    expect(ACTIVITIES[0]).toBe('sedentary');
    expect(ACTIVITIES[ACTIVITIES.length - 1]).toBe('athlete');
  });
});

describe('isLockedMacros', () => {
  it('accepts no locks, one lock and two different locks', () => {
    expect(isLockedMacros([])).toBe(true);
    expect(isLockedMacros(['fat'])).toBe(true);
    expect(isLockedMacros(['protein', 'carbs'])).toBe(true);
    expect(MAX_LOCKED_MACROS).toBe(2);
  });

  it('rejects three locks, a repeated lock, an unknown key and a non-array', () => {
    expect(isLockedMacros(['protein', 'carbs', 'fat'])).toBe(false);
    expect(isLockedMacros(['fat', 'fat'])).toBe(false);
    expect(isLockedMacros(['protein', 'kcal'])).toBe(false);
    expect(isLockedMacros('protein')).toBe(false);
    expect(isLockedMacros(null)).toBe(false);
    expect(isLockedMacros(new Set(['protein']))).toBe(false);
  });
});

describe('record types', () => {
  it('make ServingBasis a union discriminated by kind', () => {
    expectTypeOf<ServingBasis['kind']>().toEqualTypeOf<'grams' | 'servings'>();
    expectTypeOf<Extract<ServingBasis, { kind: 'grams' }>>().toEqualTypeOf<{
      kind: 'grams';
      grams: number;
    }>();
    expectTypeOf<Extract<ServingBasis, { kind: 'servings' }>>().toEqualTypeOf<{
      kind: 'servings';
      count: number;
    }>();
    // Grams can only be read after narrowing to the grams kind.
    expectTypeOf<ServingBasis>().not.toHaveProperty('grams');

    const describeBasis = (basis: ServingBasis): string =>
      basis.kind === 'grams' ? `${basis.grams} g` : `${basis.count} servings`;
    expect(describeBasis({ kind: 'grams', grams: 180 })).toBe('180 g');
    expect(describeBasis({ kind: 'servings', count: 2 })).toBe('2 servings');
  });

  it('type lockedMacros as a readonly array of macro keys', () => {
    expectTypeOf<Profile['lockedMacros']>().toEqualTypeOf<readonly MacroKey[]>();
    expectTypeOf<Profile['lockedMacros']>().not.toEqualTypeOf<MacroKey[]>();
  });

  it('make optional nutrients partial so absent means unknown', () => {
    expectTypeOf<NutrientValues['sodium']>().toEqualTypeOf<number | undefined>();
    const unknownSodium: NutrientValues = { fibre: 3.2 };
    expect(unknownSodium.sodium).toBeUndefined();
    expect('sodium' in unknownSodium).toBe(false);
  });

  it('store birth dates as day keys and a running fast with a null end', () => {
    expectTypeOf<Profile['birthDate']>().toEqualTypeOf<DayKey>();
    expectTypeOf<Fast['end']>().toEqualTypeOf<number | null>();
    expectTypeOf<DiaryEntry['dayKey']>().toEqualTypeOf<DayKey>();
    expectTypeOf<DiaryEntry['photoIds']>().toEqualTypeOf<readonly string[]>();
  });
});

import { describe, expect, it } from 'vitest';
import { EXTRA_KEYS, MACRO_KEYS, NUTRIENT_KEYS } from '../model';
import {
  CATALOGUE_KEYS,
  GOAL_KEYS,
  NUTRIENT_GROUPS,
  PILLAR_KEYS,
  groupOf,
  isCatalogueKey,
  isGoalKey,
  isPillarKey,
  unitOf,
} from './catalogue';

describe('units', () => {
  it('stores each of the 23 optional nutrients in grams, milligrams or micrograms', () => {
    const byUnit = (unit: string) => NUTRIENT_KEYS.filter((key) => unitOf(key) === unit).sort();
    expect(NUTRIENT_KEYS).toHaveLength(23);
    expect(byUnit('g')).toEqual([
      'addedSugar',
      'fibre',
      'monounsaturatedFat',
      'omega3',
      'polyunsaturatedFat',
      'saturatedFat',
      'sugar',
      'transFat',
    ]);
    expect(byUnit('mg')).toEqual([
      'caffeine',
      'calcium',
      'cholesterol',
      'iron',
      'magnesium',
      'potassium',
      'sodium',
      'vitaminC',
      'vitaminE',
      'zinc',
    ]);
    expect(byUnit('mcg')).toEqual(['folate', 'vitaminA', 'vitaminB12', 'vitaminD', 'vitaminK']);
  });

  it('stores the 8 sports compounds and the macros in grams', () => {
    expect(EXTRA_KEYS).toHaveLength(8);
    for (const key of [...EXTRA_KEYS, ...MACRO_KEYS]) expect(unitOf(key)).toBe('g');
  });
});

describe('catalogue lists', () => {
  it('lists the 31 nutrients and compounds once each, compounds last', () => {
    expect(CATALOGUE_KEYS).toHaveLength(31);
    expect(new Set(CATALOGUE_KEYS)).toEqual(new Set([...NUTRIENT_KEYS, ...EXTRA_KEYS]));
    expect(CATALOGUE_KEYS.slice(-8)).toEqual([...EXTRA_KEYS]);
  });

  it('puts every key in a group and lists the groups in order', () => {
    const groups = CATALOGUE_KEYS.map(groupOf);
    expect(groups.every((group) => NUTRIENT_GROUPS.includes(group))).toBe(true);
    // Display order walks the groups one after another, never going back.
    const firstSeen = [...new Set(groups)];
    expect(firstSeen).toEqual([...NUTRIENT_GROUPS]);
    expect(groupOf('sodium')).toBe('minerals');
    expect(groupOf('folate')).toBe('vitamins');
    expect(groupOf('fibre')).toBe('sugarsAndFats');
    expect(groupOf('creatine')).toBe('sports');
  });

  it('gives 29 goals: every nutrient but mono- and poly-unsaturated fat, plus the compounds', () => {
    expect(GOAL_KEYS).toHaveLength(29);
    expect(GOAL_KEYS).not.toContain('monounsaturatedFat');
    expect(GOAL_KEYS).not.toContain('polyunsaturatedFat');
    expect(GOAL_KEYS.filter((key) => NUTRIENT_KEYS.includes(key as never))).toHaveLength(21);
    for (const key of EXTRA_KEYS) expect(GOAL_KEYS).toContain(key);
  });

  it('offers 32 pillars: the macros first, then the 29 goal keys', () => {
    expect(PILLAR_KEYS).toHaveLength(32);
    expect(PILLAR_KEYS.slice(0, 3)).toEqual(['protein', 'carbs', 'fat']);
    expect(PILLAR_KEYS.slice(3)).toEqual([...GOAL_KEYS]);
    expect(new Set(PILLAR_KEYS).size).toBe(32);
  });
});

describe('guards', () => {
  it('accepts every member of each list', () => {
    expect(CATALOGUE_KEYS.every(isCatalogueKey)).toBe(true);
    expect(GOAL_KEYS.every(isGoalKey)).toBe(true);
    expect(PILLAR_KEYS.every(isPillarKey)).toBe(true);
  });

  it('rejects near misses and keys from other lists', () => {
    for (const miss of ['fiber', 'Fibre', 'lCitrulline', ' sodium', '', null, 3]) {
      expect(isCatalogueKey(miss)).toBe(false);
      expect(isGoalKey(miss)).toBe(false);
      expect(isPillarKey(miss)).toBe(false);
    }
    expect(isGoalKey('monounsaturatedFat')).toBe(false);
    expect(isPillarKey('polyunsaturatedFat')).toBe(false);
    expect(isCatalogueKey('monounsaturatedFat')).toBe(true);
    expect(isGoalKey('protein')).toBe(false);
    expect(isPillarKey('protein')).toBe(true);
    expect(isPillarKey('Protein')).toBe(false);
  });
});

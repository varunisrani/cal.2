import { describe, expect, it } from 'vitest';
import { EXTRA_KEYS, MACRO_KEYS, NUTRIENT_KEYS } from '../model';
import {
  CATALOGUE_IDS,
  catalogueGroupOf,
  EXTRA_UNIT,
  GOAL_KEYS,
  GOAL_NUTRIENT_KEYS,
  GOALLESS_NUTRIENTS,
  isGoalKey,
  isPillarKey,
  NUTRIENT_UNITS,
  PILLAR_KEYS,
  unitOf,
} from './catalogue';

describe('catalogue', () => {
  it('lists 23 optional nutrients and 8 extras, each id once', () => {
    expect(NUTRIENT_KEYS).toHaveLength(23);
    expect(EXTRA_KEYS).toHaveLength(8);
    expect(CATALOGUE_IDS).toHaveLength(3 + 23 + 8);
    expect(new Set(CATALOGUE_IDS).size).toBe(CATALOGUE_IDS.length);
  });

  it('stores each optional nutrient in grams, milligrams or micrograms', () => {
    const byUnit = (unit: string) =>
      NUTRIENT_KEYS.filter((key) => NUTRIENT_UNITS[key] === unit).sort();
    expect(byUnit('g')).toEqual(
      [
        'addedSugar',
        'fibre',
        'monounsaturatedFat',
        'omega3',
        'polyunsaturatedFat',
        'saturatedFat',
        'sugar',
        'transFat',
      ].sort(),
    );
    expect(byUnit('mg')).toEqual(
      [
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
      ].sort(),
    );
    expect(byUnit('mcg')).toEqual(
      ['folate', 'vitaminA', 'vitaminB12', 'vitaminD', 'vitaminK'].sort(),
    );
  });

  it('stores the extras and the macros in grams', () => {
    expect(EXTRA_UNIT).toBe('g');
    for (const key of [...EXTRA_KEYS, ...MACRO_KEYS]) expect(unitOf(key)).toBe('g');
    expect(unitOf('sodium')).toBe('mg');
    expect(unitOf('vitaminD')).toBe('mcg');
  });

  it('names the group of every id', () => {
    expect(catalogueGroupOf('protein')).toBe('macro');
    expect(catalogueGroupOf('fibre')).toBe('nutrient');
    expect(catalogueGroupOf('creatine')).toBe('extra');
    expect(CATALOGUE_IDS.filter((id) => catalogueGroupOf(id) === 'nutrient')).toEqual([
      ...NUTRIENT_KEYS,
    ]);
  });
});

describe('goal and pillar keys', () => {
  it('gives 29 goals: every optional nutrient but the two unsaturated fats, and the 8 extras', () => {
    expect(GOAL_NUTRIENT_KEYS).toHaveLength(21);
    expect(GOAL_KEYS).toHaveLength(29);
    expect(new Set(GOAL_KEYS).size).toBe(29);
    for (const key of GOALLESS_NUTRIENTS) {
      expect(isGoalKey(key)).toBe(false);
      expect(isPillarKey(key)).toBe(false);
    }
    for (const key of EXTRA_KEYS) expect(isGoalKey(key)).toBe(true);
  });

  it('lets Home show 32 nutrients: protein, carbs, fat and the 29 goal keys', () => {
    expect(PILLAR_KEYS).toHaveLength(32);
    expect(new Set(PILLAR_KEYS).size).toBe(32);
    expect(PILLAR_KEYS.slice(0, 3)).toEqual(['protein', 'carbs', 'fat']);
    expect(PILLAR_KEYS.slice(3)).toEqual([...GOAL_KEYS]);
    for (const key of PILLAR_KEYS) expect(isPillarKey(key)).toBe(true);
  });

  it('guards reject near misses', () => {
    for (const value of ['Protein', 'fiber', ' fat', '', 'water', 'citruline', null, 3]) {
      expect(isPillarKey(value)).toBe(false);
    }
    expect(isGoalKey('protein')).toBe(false);
  });
});

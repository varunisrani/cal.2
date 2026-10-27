import { describe, expect, it } from 'vitest';
import type { ProductInfo } from '../model';
import { makeDraft, makeLine } from '../../test/factories';
import {
  ALLERGEN_VERDICTS,
  allergenWords,
  checkAllergens,
  mentionsSensitivity,
  type AllergenFood,
} from './allergens';

/** A product with nothing on it but what `fields` gives. */
function product(fields: Partial<ProductInfo> = {}): ProductInfo {
  return {
    barcode: '5012345678900',
    allergens: [],
    traces: [],
    labels: [],
    categories: [],
    ...fields,
  };
}

/** A food named "Grain bowl" without parts, with `fields` on top. */
function food(fields: Partial<AllergenFood> = {}): AllergenFood {
  return { name: 'Grain bowl', lines: [], ...fields };
}

describe('checkAllergens: the ladder (D24)', () => {
  it('reports "milk" against a declared en:milk ahead of traces and the label', () => {
    const declared = food({
      product: product({ allergens: ['en:milk'], traces: ['en:nuts'], ingredients: 'Oats, nuts' }),
    });
    expect(checkAllergens(declared, ['milk', 'nuts'])).toEqual({
      verdict: 'declared',
      matches: ['milk'],
      evidence: 'allergens',
    });
  });

  it('gives "may contain" when only the traces name a sensitivity', () => {
    const traced = food({ product: product({ allergens: ['Gluten'], traces: ['en:peanuts'] }) });
    expect(checkAllergens(traced, ['peanut'])).toEqual({
      verdict: 'mayContain',
      matches: ['peanut'],
      evidence: 'traces',
    });
  });

  it('finds whey in the ingredient list for "dairy" as a possible allergen (ACC-D24-1)', () => {
    const whey = food({ product: product({ ingredients: 'Water, sugar, whey powder, salt' }) });
    expect(checkAllergens(whey, ['dairy'])).toEqual({
      verdict: 'possible',
      matches: ['dairy'],
      evidence: 'ingredients',
    });
  });

  it('reads the marked ingredient list when the product has one', () => {
    const marked = food({ product: product({ markedIngredients: 'Cocoa, _hazelnuts_, sugar' }) });
    expect(checkAllergens(marked, ['nuts'])).toMatchObject({
      verdict: 'possible',
      evidence: 'ingredients',
    });
  });

  it("then looks at the meal's parts, then at the food's name, still only as possible", () => {
    const parts = food({ lines: [makeLine({ name: 'Toasted sesame seeds' })] });
    expect(checkAllergens(parts, ['sesame'])).toEqual({
      verdict: 'possible',
      matches: ['sesame'],
      evidence: 'lines',
    });
    const named = food({ name: 'Peanut butter on toast' });
    expect(checkAllergens(named, ['peanut'])).toEqual({
      verdict: 'possible',
      matches: ['peanut'],
      evidence: 'name',
    });
  });

  it('cannot assess a food without evidence, or without sensitivities, and never calls it safe', () => {
    const plain = makeDraft({ name: 'Steamed rice', lines: [] });
    expect(checkAllergens(plain, ['milk'])).toEqual({ verdict: 'unknown', matches: [] });
    const declared = food({ product: product({ allergens: ['Milk'] }) });
    expect(checkAllergens(declared, [])).toEqual({ verdict: 'unknown', matches: [] });
    expect(ALLERGEN_VERDICTS).toEqual(['declared', 'mayContain', 'possible', 'unknown']);
  });

  it('skips sensitivities that have no words', () => {
    const declared = food({ product: product({ allergens: ['Milk'] }) });
    expect(checkAllergens(declared, ['—', '  ', '()'])).toEqual({
      verdict: 'unknown',
      matches: [],
    });
  });

  it("lists the matches as typed (trimmed), once each, in the profile's order", () => {
    const both = food({ product: product({ allergens: ['Milk', 'Peanuts'] }) });
    expect(checkAllergens(both, ['  Peanut ', 'Milk', 'Peanut', 'Celery']).matches).toEqual([
      'Peanut',
      'Milk',
    ]);
  });
});

describe('checkAllergens: matching words', () => {
  it('matches "peanuts" and "peanut" either way round, and other plurals too', () => {
    expect(
      checkAllergens(food({ product: product({ allergens: ['Peanut'] }) }), ['peanuts']),
    ).toMatchObject({ verdict: 'declared', matches: ['peanuts'] });
    expect(
      checkAllergens(food({ product: product({ allergens: ['Peanuts'] }) }), ['peanut']),
    ).toMatchObject({ verdict: 'declared', matches: ['peanut'] });
    expect(checkAllergens(food({ name: 'Egg fried rice' }), ['eggs']).verdict).toBe('possible');
    expect(checkAllergens(food({ name: 'Scrambled eggs' }), ['egg']).verdict).toBe('possible');
  });

  it('folds accents and capitals and drops language prefixes on both sides', () => {
    const tagged = food({ product: product({ allergens: ['fr:celeri', 'en:Sésame'] }) });
    expect(checkAllergens(tagged, ['Céleri', 'SESAME']).matches).toEqual(['Céleri', 'SESAME']);
    expect(checkAllergens(food({ name: 'Crème brûlée' }), ['creme']).verdict).toBe('possible');
  });

  it('matches whole words only', () => {
    expect(checkAllergens(food({ name: 'Coconut water' }), ['nut']).verdict).toBe('unknown');
    expect(checkAllergens(food({ name: 'Eggplant curry' }), ['egg']).verdict).toBe('unknown');
  });

  it('needs every word of a sensitivity of several words', () => {
    expect(checkAllergens(food({ name: 'Seeds of sesame' }), ['sesame seeds']).verdict).toBe(
      'possible',
    );
    expect(checkAllergens(food({ name: 'Toasted sesame' }), ['sesame seeds']).verdict).toBe(
      'unknown',
    );
    expect(checkAllergens(food({ name: 'Pumpkin seeds' }), ['sesame seeds']).verdict).toBe(
      'unknown',
    );
  });

  it.each([
    ['dairy', 'Casein'],
    ['dairy', 'Lactose-free cream'],
    ['milk', 'Whey protein'],
    ['milk', 'Dairy spread'],
    ['soy', 'Soybean oil'],
    ['soya', 'Soy lecithin'],
    ['soy', 'Soya flour'],
    ['peanut', 'Groundnut oil'],
    ['peanuts', 'Groundnuts'],
    ['nuts', 'Cashews'],
    ['nuts', 'Brazil nut'],
    ['tree nut', 'Macadamia'],
    ['tree nuts', 'Walnut pieces'],
    ['wheat', 'Gluten'],
    ['gluten', 'Rolled oats'],
    ['gluten', 'Barley malt'],
    ['gluten', 'Rye bread'],
    ['gluten', 'Wheat flour'],
  ])('lets "%s" find %s through its alias group', (typed, name) => {
    expect(checkAllergens(food({ name }), [typed])).toEqual({
      verdict: 'possible',
      matches: [typed],
      evidence: 'name',
    });
  });

  it.each([
    ['wheat', 'Rolled oats'],
    ['soy', 'Milk'],
    ['peanut', 'Almonds'],
    ['milk', 'Soybean oil'],
  ])('keeps "%s" from finding %s', (typed, name) => {
    expect(checkAllergens(food({ name }), [typed]).verdict).toBe('unknown');
  });
});

describe('mentionsSensitivity', () => {
  it('tells whether a text names any sensitivity, aliases included', () => {
    expect(mentionsSensitivity('Sugar, skimmed milk powder', ['soy', 'dairy'])).toBe(true);
    expect(mentionsSensitivity('Sugar, cocoa butter', ['soy', 'dairy'])).toBe(false);
    expect(mentionsSensitivity('Sugar, _milk_', [])).toBe(false);
  });
});

describe('allergenWords', () => {
  it('folds, lower-cases, drops a language prefix and splits at anything else', () => {
    expect(allergenWords('en:Crème-fraîche (30 %)')).toEqual(['creme', 'fraiche', '30']);
    expect(allergenWords('_Weizen_mehl')).toEqual(['weizen', 'mehl']);
    expect(allergenWords('牛乳, 小麦')).toEqual(['牛乳', '小麦']);
    expect(allergenWords(' — ')).toEqual([]);
  });
});

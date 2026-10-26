import { describe, expect, it } from 'vitest';
import { EXTRA_KEYS, NUTRIENT_KEYS, type NutritionDraft } from '../../domain/model';
import foodOkScript from '../../../e2e/fake-ai/scripts/food-ok.json?raw';
import {
  FOOD_REPLY_KEYS,
  PART_REPLY_KEYS,
  readFoodReply,
  UNIT_REPLY_KEYS,
  type FoodReplyContext,
} from './foodReply';
import { parseModelJson } from './json';

/** A complete answer in our contract; tests override single keys. */
function reply(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: 'Chickpea curry with rice',
    emoji: '🍛',
    kcal: 612.4,
    protein: 21.35,
    carbs: 88.2,
    fat: 18.05,
    servingGrams: 450,
    nutrients: { fibre: 11.2, sodium: 740, iron: 4.1, vitaminC: 9, creatine: 0 },
    units: [{ unit: 'plate', count: 1, gramsEach: 450 }],
    parts: [],
    progressive: false,
    ...overrides,
  };
}

/** The draft for a reply, failing the test when it was refused. */
function draftOf(value: unknown, context?: FoodReplyContext): NutritionDraft {
  const result = readFoodReply(value, context);
  if (!result.ok) throw new Error(`refused: ${result.error.kind}`);
  return result.value;
}

const REFUSED = { ok: false, error: { kind: 'invalidResponse' } };

describe('readFoodReply: a usable answer becomes a draft', () => {
  it('maps every contract key to the draft, kcal rounded and macros decimal', () => {
    const draft = draftOf(reply(), { note: '  half portion of rice ', progressive: true });
    expect(draft).toEqual({
      name: 'Chickpea curry with rice',
      emoji: '🍛',
      kcal: 612,
      protein: 21.35,
      carbs: 88.2,
      fat: 18.05,
      basis: { kind: 'grams', grams: 450 },
      nutrients: { fibre: 11.2, sodium: 740, iron: 4.1, vitaminC: 9 },
      extras: { creatine: 0 },
      units: [],
      lines: [],
      note: 'half portion of rice',
      progressive: true,
    });
  });

  it("reads the fake AI's food answer, which uses our contract keys", () => {
    const script = JSON.parse(foodOkScript) as {
      replies: [{ body: { choices: [{ message: { content: string } }] } }];
    };
    const parsed = parseModelJson(script.replies[0].body.choices[0].message.content);
    if (!parsed.ok) throw new Error('the fake answer did not parse');

    const draft = draftOf(parsed.value);
    expect(draft).toMatchObject({
      name: 'Red lentil soup with wholemeal bread',
      emoji: '🍲',
      kcal: 410,
      protein: 22,
      carbs: 65,
      fat: 6.9,
      basis: { kind: 'grams', grams: 420 },
      progressive: false,
    });
    expect(Object.keys(draft.nutrients).sort()).toEqual(
      ['fibre', 'iron', 'potassium', 'saturatedFat', 'sodium', 'sugar'].sort(),
    );
  });

  it('accepts numeric strings for kcal, the macros and the weight', () => {
    const draft = draftOf(
      reply({ kcal: '250', protein: ' 9.5 ', carbs: '30', fat: '0', servingGrams: '180' }),
    );
    expect(draft).toMatchObject({ kcal: 250, protein: 9.5, carbs: 30, fat: 0 });
    expect(draft.basis).toEqual({ kind: 'grams', grams: 180 });
  });

  it('rounds kcal to a whole number and leaves the macros as they came', () => {
    expect(draftOf(reply({ kcal: 410.5 })).kcal).toBe(411);
    expect(draftOf(reply({ kcal: 0.4, protein: 0.04 }))).toMatchObject({ kcal: 0, protein: 0.04 });
  });

  it('trims the name and the emoji, and leaves out a blank emoji and a blank note', () => {
    const draft = draftOf(reply({ name: '  Miso soup ', emoji: '  ' }), { note: '   ' });
    expect(draft.name).toBe('Miso soup');
    expect(draft).not.toHaveProperty('emoji');
    expect(draft).not.toHaveProperty('note');
    expect(draftOf(reply({ emoji: 7 }))).not.toHaveProperty('emoji');
  });

  it("echoes the request's progressive flag, and the answer's only when none was given", () => {
    expect(draftOf(reply({ progressive: true }), { progressive: false }).progressive).toBe(false);
    expect(draftOf(reply({ progressive: false }), { progressive: true }).progressive).toBe(true);
    expect(draftOf(reply({ progressive: true })).progressive).toBe(true);
    expect(draftOf(reply({ progressive: 'yes' })).progressive).toBe(false);
  });

  it('leaves unit choices and parts for their own readers', () => {
    const draft = draftOf(reply({ parts: [{ name: 'Rice', grams: 200, kcal: 260 }] }));
    expect(draft.units).toEqual([]);
    expect(draft.lines).toEqual([]);
    expect(draft).not.toHaveProperty('chosenUnit');
  });
});

describe('readFoodReply: an unusable answer is invalid, so the standby runs (D-16.58)', () => {
  it('refuses an answer without protein', () => {
    const { protein: _, ...rest } = reply();
    expect(readFoodReply(rest)).toEqual(REFUSED);
  });

  it('refuses NaN fat, as a JSON string or a number', () => {
    expect(readFoodReply(reply({ fat: 'NaN' }))).toEqual(REFUSED);
    expect(readFoodReply(reply({ fat: Number.NaN }))).toEqual(REFUSED);
  });

  it('refuses each required value when it is missing, null, a word, a boolean or negative', () => {
    for (const key of ['kcal', 'protein', 'carbs', 'fat']) {
      for (const bad of [undefined, null, 'lots', '12 g', '', true, -1, Number.POSITIVE_INFINITY]) {
        expect(readFoodReply(reply({ [key]: bad })), `${key}: ${String(bad)}`).toEqual(REFUSED);
      }
    }
  });

  it('refuses a missing, blank or non-text name', () => {
    for (const name of [undefined, '', '   ', 42, null]) {
      expect(readFoodReply(reply({ name })), String(name)).toEqual(REFUSED);
    }
  });

  it('refuses an answer that is not an object', () => {
    for (const value of [null, undefined, 'curry', 612, [reply()]]) {
      expect(readFoodReply(value)).toEqual(REFUSED);
    }
  });
});

describe('readFoodReply: a missing weight stays unknown (R03.15)', () => {
  it('describes one serving, never 100 g, when the answer gives no weight', () => {
    const { servingGrams: _, ...rest } = reply();
    const draft = draftOf(rest);
    expect(draft.basis).toEqual({ kind: 'servings', count: 1 });
    expect(draft).not.toHaveProperty('chosenUnit');
    expect(draft).not.toHaveProperty('chosenCount');
    expect(draft).toMatchObject({ kcal: 612, protein: 21.35 });
  });

  it('treats a zero, negative, null or non-numeric weight as unknown', () => {
    for (const servingGrams of [0, -120, null, 'about a bowl', Number.NaN, true]) {
      expect(draftOf(reply({ servingGrams })).basis, String(servingGrams)).toEqual({
        kind: 'servings',
        count: 1,
      });
    }
  });

  it('keeps a known weight with its decimals', () => {
    expect(draftOf(reply({ servingGrams: 37.5 })).basis).toEqual({ kind: 'grams', grams: 37.5 });
  });
});

describe('readFoodReply: optional nutrients and extras', () => {
  it('drops a negative sodium and keeps the rest', () => {
    const draft = draftOf(reply({ nutrients: { sodium: -40, potassium: 310 } }));
    expect(draft.nutrients).toEqual({ potassium: 310 });
  });

  it('drops values that are not finite numbers at least 0, and keeps a known 0', () => {
    const nutrients = {
      sugar: 'NaN',
      fibre: null,
      iron: true,
      zinc: 'some',
      calcium: '120',
      vitaminD: 0,
      taurine: -1,
      betaine: '0.2',
    };
    const draft = draftOf(reply({ nutrients }));
    expect(draft.nutrients).toEqual({ calcium: 120, vitaminD: 0 });
    expect(draft.extras).toEqual({ betaine: 0.2 });
  });

  it('reads every nutrient key and every extra key of the domain model', () => {
    const all = Object.fromEntries([...NUTRIENT_KEYS, ...EXTRA_KEYS].map((key, i) => [key, i]));
    const draft = draftOf(reply({ nutrients: all }));
    expect(Object.keys(draft.nutrients)).toEqual([...NUTRIENT_KEYS]);
    expect(Object.keys(draft.extras)).toEqual([...EXTRA_KEYS]);
  });

  it('ignores unknown keys at the top level and inside nutrients', () => {
    const draft = draftOf(
      reply({
        confidence: 'high',
        calories: 999,
        nutrients: JSON.parse('{"sodium":500,"vitamin_c":30,"glitter":2,"__proto__":{"iron":3}}'),
      }),
    );
    expect(draft.kcal).toBe(612);
    expect(draft.nutrients).toEqual({ sodium: 500 });
    expect(draft).not.toHaveProperty('confidence');
  });

  it("reads only the answer's own keys, not inherited ones", () => {
    const inherited: Record<string, unknown> = Object.create({ iron: 3 }) as Record<
      string,
      unknown
    >;
    inherited.zinc = 1.2;
    expect(draftOf(reply({ nutrients: inherited })).nutrients).toEqual({ zinc: 1.2 });
  });

  it('gives no nutrients when the nutrients key is missing or not an object', () => {
    for (const nutrients of [undefined, null, [1, 2], 'none']) {
      const draft = draftOf(reply({ nutrients }));
      expect(draft.nutrients).toEqual({});
      expect(draft.extras).toEqual({});
    }
  });
});

describe('reply contract keys', () => {
  it('spells each key as its own name, for the prompts and the readers to share', () => {
    for (const keys of [FOOD_REPLY_KEYS, UNIT_REPLY_KEYS, PART_REPLY_KEYS]) {
      for (const [name, spelled] of Object.entries(keys)) expect(spelled).toBe(name);
    }
    expect(Object.values(FOOD_REPLY_KEYS)).toEqual([
      'name',
      'kcal',
      'protein',
      'carbs',
      'fat',
      'servingGrams',
      'emoji',
      'nutrients',
      'units',
      'parts',
      'progressive',
    ]);
  });
});

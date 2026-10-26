import { describe, expect, it } from 'vitest';
import foodOkScript from '../../../e2e/fake-ai/scripts/food-ok.json?raw';
import { EXTRA_KEYS, NUTRIENT_KEYS } from '../../domain/model';
import { FOOD_REPLY_KEYS, PART_REPLY_KEYS, UNIT_REPLY_KEYS } from '../parse/foodReply';
import { isRecord, parseModelJson } from '../parse/json';
import { FOOD_REPLY_CONTRACT, MAX_PARTS, MAX_UNITS, PART_RULES, UNIT_RULES } from './contract';

/** True when `text` names `key` as a whole word. */
function namesKey(text: string, key: string): boolean {
  return new RegExp(`(^|[^A-Za-z0-9])${key}([^A-Za-z0-9]|$)`).test(text);
}

describe('FOOD_REPLY_CONTRACT: the keys', () => {
  it('names every key of the food reply, quoted as the model must write it', () => {
    for (const key of Object.values(FOOD_REPLY_KEYS)) {
      expect(FOOD_REPLY_CONTRACT).toContain(`"${key}"`);
    }
  });

  it('names every key of a unit choice and of a part, quoted', () => {
    for (const key of [...Object.values(UNIT_REPLY_KEYS), ...Object.values(PART_REPLY_KEYS)]) {
      expect(FOOD_REPLY_CONTRACT).toContain(`"${key}"`);
    }
  });

  it('names every optional nutrient key and every sports compound key', () => {
    for (const key of [...NUTRIENT_KEYS, ...EXTRA_KEYS]) {
      expect(namesKey(FOOD_REPLY_CONTRACT, key), key).toBe(true);
    }
  });

  it('asks for the sports compounds inside "nutrients", where the reader looks for them', () => {
    const units = FOOD_REPLY_CONTRACT.slice(
      FOOD_REPLY_CONTRACT.indexOf('Units inside "nutrients"'),
    );
    const gramsLine = units.split('\n').find((line) => line.includes('(g):')) ?? '';
    for (const key of EXTRA_KEYS) expect(namesKey(gramsLine, key), key).toBe(true);
    expect(FOOD_REPLY_CONTRACT).toContain('only when a label prints it or the person names it');
    expect(FOOD_REPLY_CONTRACT).toContain('otherwise 0');
  });

  it("covers every key of the fake AI's food answer, so fixture and contract agree", () => {
    const script = JSON.parse(foodOkScript) as {
      replies: { body: { choices: { message: { content: string } }[] } }[];
    };
    const content = script.replies[0]?.body.choices[0]?.message.content ?? '';
    const parsed = parseModelJson(content);
    if (!parsed.ok || !isRecord(parsed.value)) throw new Error('fixture does not parse');
    const reply = parsed.value;
    const listed = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
    const keys = new Set(Object.keys(reply));
    for (const inner of [reply.nutrients, ...listed(reply.units), ...listed(reply.parts)]) {
      if (isRecord(inner)) for (const key of Object.keys(inner)) keys.add(key);
    }
    expect(keys.size).toBeGreaterThan(15);
    for (const key of keys) expect(namesKey(FOOD_REPLY_CONTRACT, key), key).toBe(true);
  });
});

describe('FOOD_REPLY_CONTRACT: the amounts', () => {
  it('asks for one bare JSON object with JSON numbers', () => {
    expect(FOOD_REPLY_CONTRACT).toContain('one JSON object and nothing else');
    expect(FOOD_REPLY_CONTRACT).toContain('no code fence');
    expect(FOOD_REPLY_CONTRACT).toContain('Every number is a JSON number, never text');
  });

  it('asks for whole kcal, decimal macros and the weight of the whole amount', () => {
    expect(FOOD_REPLY_CONTRACT).toContain('"kcal": whole kilocalories');
    expect(FOOD_REPLY_CONTRACT).toContain('decimals are welcome');
    expect(FOOD_REPLY_CONTRACT).toContain(
      '"servingGrams": the weight in grams of the whole amount',
    );
  });

  it('asks for null when a nutrient cannot be judged, never a made-up 0', () => {
    expect(FOOD_REPLY_CONTRACT).toContain('Use null for any you cannot judge');
  });
});

describe('UNIT_RULES (R03.16)', () => {
  it('asks for complete objects, at most four, best first', () => {
    expect(MAX_UNITS).toBe(4);
    expect(UNIT_RULES).toContain('at most 4');
    expect(UNIT_RULES).toContain('best fit first');
    expect(UNIT_RULES).toContain('{"unit": name, "count": how many, "gramsEach": grams in one}');
    expect(UNIT_RULES).toContain('never a bare word');
  });

  it('asks for count × gramsEach to match the serving weight and forbids gram units', () => {
    expect(UNIT_RULES).toContain('count × gramsEach must come to servingGrams');
    expect(UNIT_RULES).toContain('No gram units (g, gram, grams)');
  });

  it('allows a count only with evidence, and an empty list as a full answer', () => {
    expect(UNIT_RULES).toContain('Never work a count out from the food name or the weight alone');
    expect(UNIT_RULES).toContain('An empty list [] is a complete answer');
    expect(UNIT_RULES).toContain('only when the packaging is in view');
  });

  it('is part of the contract', () => {
    expect(FOOD_REPLY_CONTRACT).toContain(UNIT_RULES);
  });
});

describe('PART_RULES (R03.14)', () => {
  it('caps the parts at 20, never a total row, and empty for a label or one simple food', () => {
    expect(MAX_PARTS).toBe(20);
    expect(PART_RULES).toContain('At most 20 parts');
    expect(PART_RULES).toContain('Never a total or subtotal row');
    expect(PART_RULES).toContain('for one simple food, or when the values come from a label');
  });

  it('asks for positive grams and parts that add up to the totals', () => {
    expect(PART_RULES).toContain('grams above 0');
    expect(PART_RULES).toContain('add up to about the totals');
  });

  it('is part of the contract', () => {
    expect(FOOD_REPLY_CONTRACT).toContain(PART_RULES);
  });
});

import { describe, expect, it } from 'vitest';
import { isRecord, parseModelJson, readNumber } from './json';

/** The parsed value, failing the test when the text was refused. */
function valueOf(text: string): unknown {
  const result = parseModelJson(text);
  if (!result.ok) throw new Error(`refused: ${result.error.kind}`);
  return result.value;
}

const REFUSED = { ok: false, error: { kind: 'invalidResponse' } };

describe('parseModelJson: answers wrapped in prose or a fence (R03.13, ACC-E8-1)', () => {
  it('reads an object with a sentence before and after it', () => {
    const text =
      'Sure! Here is my estimate:\n{"name":"Pear","kcal":95}\nLet me know if it looks off.';
    expect(valueOf(text)).toEqual({ name: 'Pear', kcal: 95 });
  });

  it('reads the inside of a json fence, in any letter case', () => {
    const fenced = 'Estimate below.\n```json\n{"name":"Oat bar","kcal":180}\n```\nEnjoy.';
    expect(valueOf(fenced)).toEqual({ name: 'Oat bar', kcal: 180 });
    expect(valueOf('```JSON\n{"kcal":180}\n```')).toEqual({ kcal: 180 });
  });

  it('reads an answer wrapped in prose and a plain fence with a language word', () => {
    const text = 'I looked at the plate.\n```javascript\n{"name":"Rice bowl"}\n```\nThat is all.';
    expect(valueOf(text)).toEqual({ name: 'Rice bowl' });
    expect(valueOf('```\n{"name":"Rice bowl"}\n```')).toEqual({ name: 'Rice bowl' });
  });

  it('still finds the object when a stray closing fence follows it', () => {
    expect(valueOf('{"name":"Kiwi"}\n```')).toEqual({ name: 'Kiwi' });
  });
});

describe('parseModelJson: the first balanced object, aware of strings (R03.13)', () => {
  it('ignores braces inside a string', () => {
    const text = 'Result: {"name":"Toast with jam } and {butter","kcal":210} (rough)';
    expect(valueOf(text)).toEqual({ name: 'Toast with jam } and {butter', kcal: 210 });
  });

  it('keeps an escaped quote inside a string', () => {
    const text = 'Here: {"name":"The \\"big\\" salad }","kcal":340} done';
    expect(valueOf(text)).toEqual({ name: 'The "big" salad }', kcal: 340 });
  });

  it('ends a string at a quote that follows an escaped backslash', () => {
    const text = '{"name":"Path C:\\\\","kcal":1} trailing } brace';
    expect(valueOf(text)).toEqual({ name: 'Path C:\\', kcal: 1 });
  });

  it('takes the first of two objects, never a span from the first { to the last }', () => {
    const text = '{"name":"First","kcal":100}\nOr maybe:\n{"name":"Second","kcal":200}';
    expect(valueOf(text)).toEqual({ name: 'First', kcal: 100 });
  });

  it('keeps nested objects and arrays whole', () => {
    const text =
      'Done: {"name":"Stew","nutrients":{"iron":2.5,"inner":{"deep":true}},' +
      '"parts":[{"name":"Beans"},{"name":"Carrot"}]} thanks';
    expect(valueOf(text)).toEqual({
      name: 'Stew',
      nutrients: { iron: 2.5, inner: { deep: true } },
      parts: [{ name: 'Beans' }, { name: 'Carrot' }],
    });
  });

  it('parses the whole text when there is no object', () => {
    expect(valueOf('  42 ')).toBe(42);
    expect(valueOf('[1, 2]')).toEqual([1, 2]);
    expect(parseModelJson('I could not see any food in this photo.')).toEqual(REFUSED);
  });

  it('refuses an object that never closes, as from a cut-off answer', () => {
    expect(parseModelJson('```json\n{"name":"Lasagne","kcal":6')).toEqual(REFUSED);
  });

  it('refuses a first object that is not valid JSON instead of looking further', () => {
    expect(parseModelJson('{\'name\':\'Plum\'} {"name":"Plum"}')).toEqual(REFUSED);
    expect(parseModelJson('{"name":"Plum",}')).toEqual(REFUSED);
  });

  it('refuses an empty answer', () => {
    expect(parseModelJson('')).toEqual(REFUSED);
    expect(parseModelJson('  \n ')).toEqual(REFUSED);
    expect(parseModelJson('```json\n```')).toEqual(REFUSED);
  });
});

describe('readNumber and isRecord', () => {
  it('reads JSON numbers and strings that hold only a decimal number', () => {
    expect([250, -1.5, 0, '250', ' 12.5 ', '-3', '.5', '1e3'].map(readNumber)).toEqual([
      250, -1.5, 0, 250, 12.5, -3, 0.5, 1000,
    ]);
  });

  it('refuses everything else', () => {
    const values = [
      undefined,
      null,
      true,
      '',
      ' ',
      '12 g',
      'NaN',
      'Infinity',
      '0x10',
      '1e999',
      Number.NaN,
      Number.POSITIVE_INFINITY,
      [3],
      { value: 3 },
    ];
    expect(values.map(readNumber)).toEqual(values.map(() => undefined));
  });

  it('accepts plain objects only', () => {
    expect([{}, { a: 1 }].map(isRecord)).toEqual([true, true]);
    expect([null, [], 'x', 3, undefined].map(isRecord)).toEqual([
      false,
      false,
      false,
      false,
      false,
    ]);
  });
});

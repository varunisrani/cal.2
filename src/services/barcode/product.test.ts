import { describe, expect, it } from 'vitest';
import {
  gramsInText,
  oneDecimal,
  productName,
  readAmount,
  readNumber,
  readString,
  storedNutrient,
} from './product';

describe('gramsInText', () => {
  it('reads fluid ounces before ounces: "12 fl oz" → 354.9 g, "12 oz" → 340.2 g', () => {
    expect(oneDecimal(gramsInText('12 fl oz') ?? 0)).toBe(354.9);
    expect(oneDecimal(gramsInText('12 FL. OZ (355 mL)') ?? 0)).toBe(354.9);
    expect(oneDecimal(gramsInText('12 fl.oz') ?? 0)).toBe(354.9);
    expect(oneDecimal(gramsInText('12 oz') ?? 0)).toBe(340.2);
  });

  it('takes the first number with a unit, a comma read as a decimal point', () => {
    expect(gramsInText('30 g (1 cup)')).toBe(30);
    expect(gramsInText('3/4 cup (20g)')).toBe(20);
    expect(gramsInText('1,5 kg')).toBe(1500);
    expect(gramsInText('2 L')).toBe(2000);
    expect(gramsInText('330ml')).toBe(330);
    expect(gramsInText('250 mg')).toBeCloseTo(0.25, 10);
    expect(gramsInText('100 grams')).toBe(100);
    expect(gramsInText('30 gr')).toBe(30);
  });

  it('skips a unit that runs on into a word: "1 large egg (50 g)" is 50 g', () => {
    expect(gramsInText('1 large egg (50 g)')).toBe(50);
    expect(gramsInText('2 glasses')).toBeUndefined();
    expect(gramsInText('1 lb')).toBeUndefined();
  });

  it('gives nothing for a text without an amount in a known unit', () => {
    expect(gramsInText('one bowl')).toBeUndefined();
    expect(gramsInText('2 tbsp')).toBeUndefined();
    expect(gramsInText('')).toBeUndefined();
    expect(gramsInText(undefined)).toBeUndefined();
  });
});

describe('reading JSON values', () => {
  it('reads numbers given as numbers or as text with a dot or a comma', () => {
    expect([12, '12.5', ' 10,0 ', '1e3', '-2'].map(readNumber)).toEqual([12, 12.5, 10, 1000, -2]);
    const missing = ['', ' ', 'abc', '12 g', '1,2,3', Number.NaN, Infinity, null, true, {}];
    expect(missing.map(readNumber)).toEqual(missing.map(() => undefined));
  });

  it('treats a negative amount as missing', () => {
    expect([0, '4', -0.1, '-3'].map(readAmount)).toEqual([0, 4, undefined, undefined]);
  });

  it('reads trimmed text and nothing for blank or other values', () => {
    expect([' Oats ', '', '  ', 7, null].map(readString)).toEqual([
      'Oats',
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
  });
});

describe('productName', () => {
  const unnamed = (code: string): string => `Unnamed ${code}`;

  it('puts the brand first unless the name already holds it, in any case', () => {
    expect(productName('Rye Thins', 'Hollow Oak', '1', unnamed)).toBe('Hollow Oak Rye Thins');
    expect(productName('hollow oak rye thins', 'Hollow Oak', '1', unnamed)).toBe(
      'hollow oak rye thins',
    );
  });

  it('falls back to the name, the brand, then the caller’s word with the code', () => {
    expect(productName('Rye Thins', undefined, '1', unnamed)).toBe('Rye Thins');
    expect(productName(undefined, 'Hollow Oak', '1', unnamed)).toBe('Hollow Oak');
    expect(productName(undefined, undefined, '0042', unnamed)).toBe('Unnamed 0042');
  });
});

describe('storedNutrient', () => {
  it('converts grams to the stored unit and rounds to 0.1', () => {
    expect(storedNutrient('sodium', 0.4)).toBe(400);
    expect(storedNutrient('vitaminD', 0.0000012)).toBe(1.2);
    expect(storedNutrient('fibre', 2.19)).toBe(2.2);
    expect(storedNutrient('folate', 0.00009)).toBe(90);
  });
});

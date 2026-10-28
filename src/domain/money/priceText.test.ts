import { describe, expect, it } from 'vitest';
import { priceInputText, readPriceText } from './priceText';

describe('readPriceText: what a Price field holds', () => {
  it('is no price when empty or spaces', () => {
    expect(readPriceText('', 'en-IN')).toEqual({ kind: 'none' });
    expect(readPriceText('   ', 'en-IN')).toEqual({ kind: 'none' });
  });

  it("reads an amount the locale's way, grouping marks and a decimal comma included", () => {
    expect(readPriceText('120', 'en-IN')).toEqual({ kind: 'amount', amount: 120 });
    expect(readPriceText(' 4.50 ', 'en-US')).toEqual({ kind: 'amount', amount: 4.5 });
    expect(readPriceText('4,50', 'en-US')).toEqual({ kind: 'amount', amount: 4.5 });
    expect(readPriceText('1,200', 'en-IN')).toEqual({ kind: 'amount', amount: 1200 });
    expect(readPriceText('1,20,000', 'en-IN')).toEqual({ kind: 'amount', amount: 120000 });
    expect(readPriceText('4,50', 'de-DE')).toEqual({ kind: 'amount', amount: 4.5 });
    expect(readPriceText('0', 'en-IN')).toEqual({ kind: 'amount', amount: 0 });
    expect(readPriceText('2.345', 'en-US')).toEqual({ kind: 'amount', amount: 2.35 });
  });

  it('is invalid for a sign, words or anything after the number', () => {
    for (const text of ['-5', '+5', '-0', 'abc', '12 rupees', '₹120', '1.2.3']) {
      expect(readPriceText(text, 'en-IN')).toEqual({ kind: 'invalid' });
    }
  });
});

describe('priceInputText', () => {
  it('writes a whole amount without decimals and any other with two', () => {
    expect(priceInputText(120)).toBe('120');
    expect(priceInputText(4.5)).toBe('4.50');
    expect(priceInputText(0)).toBe('0');
  });
});

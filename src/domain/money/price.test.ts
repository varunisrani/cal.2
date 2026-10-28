import { describe, expect, it } from 'vitest';
import { currencyCodeOf, currencyForLocale, isCurrencyCode, readPrice } from './price';

describe('readPrice (D-16.107)', () => {
  it('reads an amount of 0 or more with a code, kept to two decimals', () => {
    expect(readPrice({ amount: 120, currency: 'INR' })).toEqual({ amount: 120, currency: 'INR' });
    expect(readPrice({ amount: 4.499, currency: 'USD' })).toEqual({ amount: 4.5, currency: 'USD' });
    expect(readPrice({ amount: 0.105, currency: 'EUR' })).toEqual({
      amount: 0.11,
      currency: 'EUR',
    });
    expect(readPrice({ amount: 0, currency: 'GBP' })).toEqual({ amount: 0, currency: 'GBP' });
    expect(readPrice({ amount: -0, currency: 'GBP' })).toEqual({ amount: 0, currency: 'GBP' });
  });

  it('upper-cases and trims the code; anything else that is not three letters is no price', () => {
    expect(readPrice({ amount: 5, currency: ' usd ' })).toEqual({ amount: 5, currency: 'USD' });
    for (const currency of ['US', 'USDT', 'U$D', '₹', 120, null, undefined]) {
      expect(readPrice({ amount: 5, currency })).toBeUndefined();
    }
  });

  it('is no price without a finite amount of 0 or more, or without an object', () => {
    for (const amount of [-1, Number.NaN, Number.POSITIVE_INFINITY, '120', null, undefined]) {
      expect(readPrice({ amount, currency: 'INR' })).toBeUndefined();
    }
    for (const raw of [null, undefined, 120, 'INR 120', [120, 'INR']]) {
      expect(readPrice(raw)).toBeUndefined();
    }
  });

  it('leaves extra fields behind', () => {
    expect(readPrice({ amount: 3, currency: 'EUR', tip: 1 })).toEqual({
      amount: 3,
      currency: 'EUR',
    });
  });
});

describe('currency codes', () => {
  it('stores three capital letters only', () => {
    expect(isCurrencyCode('INR')).toBe(true);
    expect(isCurrencyCode('inr')).toBe(false);
    expect(isCurrencyCode('IN')).toBe(false);
    expect(currencyCodeOf('jpy')).toBe('JPY');
    expect(currencyCodeOf('yen')).toBe('YEN');
    expect(currencyCodeOf('rupees')).toBeUndefined();
  });
});

describe('currencyForLocale (D-16.107)', () => {
  it.each([
    ['en-IN', 'INR'],
    ['hi-IN', 'INR'],
    ['ta_IN', 'INR'],
    ['en-US', 'USD'],
    ['es-US', 'USD'],
    ['de-DE', 'EUR'],
    ['fr-FR', 'EUR'],
    ['nl-BE', 'EUR'],
    ['hr-HR', 'EUR'],
    ['bg-BG', 'EUR'],
    ['ca-AD', 'EUR'],
    ['en-GB', 'GBP'],
    ['de-CH', 'USD'],
    ['ja-JP', 'USD'],
    ['en-AU', 'USD'],
    ['en', 'USD'],
    ['', 'USD'],
    ['not a tag', 'USD'],
  ])('%j starts in %s', (tag, currency) => {
    expect(currencyForLocale(tag)).toBe(currency);
  });
});

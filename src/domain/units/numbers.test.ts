import { describe, expect, it } from 'vitest';
import {
  clamp,
  formatFixed,
  formatMacro,
  formatQuantity,
  formatTrimmed,
  numberMarks,
  parseDecimal,
  parseLocaleNumber,
  readPlainNumber,
} from './numbers';

describe('numberMarks', () => {
  it('finds the grouping and decimal marks of a locale', () => {
    expect(numberMarks('en-US')).toEqual({ group: ',', decimal: '.' });
    expect(numberMarks('de-DE')).toEqual({ group: '.', decimal: ',' });
    expect(numberMarks('fr-FR')).toEqual({ group: ' ', decimal: ',' });
    expect(numberMarks('de-CH')).toEqual({ group: '’', decimal: '.' });
  });

  it('falls back to en marks for a tag Intl cannot use', () => {
    expect(numberMarks('')).toEqual({ group: ',', decimal: '.' });
    expect(numberMarks('not a locale')).toEqual({ group: ',', decimal: '.' });
  });
});

describe('readPlainNumber', () => {
  it('reads digits with an optional sign and dot fraction', () => {
    expect(readPlainNumber('12')).toBe(12);
    expect(readPlainNumber('-2.5')).toBe(-2.5);
    expect(readPlainNumber('+3')).toBe(3);
    expect(readPlainNumber('.5')).toBe(0.5);
    expect(readPlainNumber('5.')).toBe(5);
    expect(Object.is(readPlainNumber('-0'), 0)).toBe(true);
  });

  it('refuses anything else', () => {
    for (const text of [
      '',
      ' 1',
      '1 ',
      '.',
      '-',
      '1,5',
      '1.2.3',
      '1e3',
      'Infinity',
      'NaN',
      '0x10',
    ]) {
      expect(readPlainNumber(text), text).toBeNull();
    }
    expect(readPlainNumber('9'.repeat(400))).toBeNull();
  });
});

describe('parseLocaleNumber', () => {
  it('reads the grouping and decimal marks of the locale', () => {
    expect(parseLocaleNumber('8,368.4', 'en-US')).toBe(8368.4);
    expect(parseLocaleNumber('8.368,4', 'de-DE')).toBe(8368.4);
    expect(parseLocaleNumber('1,234,567', 'en-US')).toBe(1_234_567);
    expect(parseLocaleNumber('12,34,567', 'en-IN')).toBe(1_234_567);
    expect(parseLocaleNumber(' 418,4 ', 'de-DE')).toBe(418.4);
  });

  it('accepts a typed space or apostrophe for a no-break space or curly apostrophe group', () => {
    expect(parseLocaleNumber('1 234,5', 'fr-FR')).toBe(1234.5);
    expect(parseLocaleNumber('1 234,5', 'fr-FR')).toBe(1234.5);
    expect(parseLocaleNumber("1'234.5", 'de-CH')).toBe(1234.5);
    expect(parseLocaleNumber('1’234.5', 'de-CH')).toBe(1234.5);
  });

  it('only counts group marks between whole digit groups', () => {
    expect(parseLocaleNumber('1,5', 'en-US')).toBeNull();
    expect(parseLocaleNumber('8,3,68', 'en-US')).toBeNull();
    expect(parseLocaleNumber(',368', 'en-US')).toBeNull();
    expect(parseLocaleNumber('1234,567', 'en-US')).toBeNull();
    expect(parseLocaleNumber('1,234.5.6', 'en-US')).toBeNull();
    expect(parseLocaleNumber('1.234', 'de-DE')).toBe(1234);
  });
});

describe('parseDecimal', () => {
  it('reads a plain dot first, in any locale', () => {
    expect(parseDecimal('5', 'en-US')).toBe(5);
    expect(parseDecimal('0.5', 'en-US')).toBe(0.5);
    expect(parseDecimal('1.5', 'en-US')).toBe(1.5);
    expect(parseDecimal('0.500', 'en-US')).toBe(0.5);
    expect(parseDecimal('0.5', 'de-DE')).toBe(0.5);
    expect(parseDecimal('1.000', 'en-US')).toBe(1);
    expect(parseDecimal('1.000', 'de-DE')).toBe(1);
    expect(parseDecimal(' 1000 ', 'en-US')).toBe(1000);
  });

  it('then reads a comma as the decimal mark when there is no dot', () => {
    expect(parseDecimal('0,5', 'de-DE')).toBe(0.5);
    expect(parseDecimal('1,5', 'fr-FR')).toBe(1.5);
    expect(parseDecimal('0,5', 'en-US')).toBe(0.5);
    // The comma step comes before the locale step, so a grouped thousand in en-US reads as 1.
    expect(parseDecimal('1,000', 'en-US')).toBe(1);
  });

  it('then reads the locale marks after removing its grouping', () => {
    expect(parseDecimal('1.234,5', 'de-DE')).toBe(1234.5);
    expect(parseDecimal('1,234.5', 'en-US')).toBe(1234.5);
    expect(parseDecimal('1 234,5', 'fr-FR')).toBe(1234.5);
  });

  it('keeps a sign for the caller to judge', () => {
    expect(parseDecimal('-2.5', 'en-US')).toBe(-2.5);
    expect(parseDecimal('-2,5', 'de-DE')).toBe(-2.5);
  });

  it('gives null for text that is not one number', () => {
    for (const [text, locale] of [
      ['', 'en-US'],
      ['   ', 'en-US'],
      ['abc', 'en-US'],
      ['\u{1F355}', 'en-US'],
      ['1.2.3', 'en-US'],
      ['1,2,3', 'de-DE'],
      ['12abc', 'en-US'],
      ['Infinity', 'en-US'],
    ] as const) {
      expect(parseDecimal(text, locale), `${text} in ${locale}`).toBeNull();
    }
  });
});

describe('formatQuantity', () => {
  it('writes whole numbers bare, below 10 up to two decimals and otherwise up to one', () => {
    expect(formatQuantity(2)).toBe('2');
    expect(formatQuantity(2.345)).toBe('2.35');
    expect(formatQuantity(12.34)).toBe('12.3');
    expect(formatQuantity(0.5)).toBe('0.5');
    expect(formatQuantity(1.5)).toBe('1.5');
    expect(formatQuantity(250)).toBe('250');
    expect(formatQuantity(9.996)).toBe('10');
    expect(formatQuantity(12.96)).toBe('13');
    expect(formatQuantity(2.001)).toBe('2');
  });

  it('never writes -0, and writes nothing for a value that is not finite', () => {
    expect(formatQuantity(-0)).toBe('0');
    expect(formatQuantity(-0.001)).toBe('0');
    expect(formatQuantity(Number.NaN)).toBe('');
    expect(formatQuantity(Number.POSITIVE_INFINITY)).toBe('');
  });

  it('uses the locale decimal mark without grouping, so the text reads back', () => {
    expect(formatQuantity(2.35, 'de-DE')).toBe('2,35');
    expect(formatQuantity(1234.5, 'de-DE')).toBe('1234,5');
    expect(formatQuantity(1234.5, 'en-US')).toBe('1234.5');
    for (const n of [0.25, 1.5, 2.35, 12.3, 250, 1234.5]) {
      for (const locale of ['en-US', 'de-DE', 'fr-FR']) {
        expect(parseDecimal(formatQuantity(n, locale), locale)).toBe(n);
      }
    }
  });
});

describe('formatMacro', () => {
  it('writes a whole number bare and anything else with one decimal', () => {
    expect(formatMacro(12)).toBe('12');
    expect(formatMacro(12.34)).toBe('12.3');
    expect(formatMacro(0.25)).toBe('0.3');
    expect(formatMacro(12.04)).toBe('12');
    expect(formatMacro(12.96)).toBe('13');
    expect(formatMacro(7.5, 'de-DE')).toBe('7,5');
  });
});

describe('formatTrimmed', () => {
  it('drops trailing zeros and a bare dot', () => {
    expect(formatTrimmed(10, 2)).toBe('10');
    expect(formatTrimmed(100.5, 2)).toBe('100.5');
    expect(formatTrimmed(0, 2)).toBe('0');
  });
});

describe('formatFixed', () => {
  it('groups the locale way with exactly the given decimals', () => {
    expect(formatFixed(1000, 0, 'en-US')).toBe('1,000');
    expect(formatFixed(1000, 0, 'de-DE')).toBe('1.000');
    expect(formatFixed(154.3234, 1, 'en-US')).toBe('154.3');
    expect(formatFixed(70, 1, 'de-DE')).toBe('70,0');
    expect(formatFixed(-0.04, 1, 'en-US')).toBe('0.0');
    expect(formatFixed(1000, 0, 'not a locale')).toBe('1,000');
  });
});

describe('clamp', () => {
  it('keeps a value inside the range', () => {
    expect(clamp(5, 1, 10)).toBe(5);
    expect(clamp(-1, 1, 10)).toBe(1);
    expect(clamp(11, 1, 10)).toBe(10);
  });
});

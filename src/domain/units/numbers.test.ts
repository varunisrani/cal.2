import { describe, expect, it } from 'vitest';
import {
  clamp,
  formatMacro,
  formatNumber,
  formatQuantity,
  numberMarks,
  parseDecimal,
  parseLocaleNumber,
  plainText,
} from './numbers';

const NARROW_NBSP = ' ';

describe('numberMarks', () => {
  it('reads the decimal and grouping marks of a locale from Intl', () => {
    expect(numberMarks('en-US')).toEqual({ decimal: '.', group: ',' });
    expect(numberMarks('de-DE')).toEqual({ decimal: ',', group: '.' });
    expect(numberMarks('fr-FR')).toEqual({ decimal: ',', group: NARROW_NBSP });
  });

  it('falls back to en-US marks for a tag Intl refuses instead of throwing', () => {
    expect(numberMarks('not a locale')).toEqual({ decimal: '.', group: ',' });
    expect(numberMarks('')).toEqual({ decimal: '.', group: ',' });
  });
});

describe('parseDecimal', () => {
  it('reads plain numbers with a dot in any locale', () => {
    expect(parseDecimal('5', 'en-US')).toBe(5);
    expect(parseDecimal('0.5', 'en-US')).toBe(0.5);
    expect(parseDecimal('1.5', 'en-US')).toBe(1.5);
    expect(parseDecimal('1000', 'en-US')).toBe(1000);
    expect(parseDecimal('0.500', 'en-US')).toBe(0.5);
    expect(parseDecimal('.5', 'en-US')).toBe(0.5);
    expect(parseDecimal('5.', 'en-US')).toBe(5);
    expect(parseDecimal('0.5', 'de-DE')).toBe(0.5);
  });

  it('reads a dot first, so "1.000" is one in every locale', () => {
    expect(parseDecimal('1.000', 'en-US')).toBe(1);
    expect(parseDecimal('1.000', 'de-DE')).toBe(1);
  });

  it('keeps the sign and trims surrounding spaces', () => {
    expect(parseDecimal('-2.5', 'en-US')).toBe(-2.5);
    expect(parseDecimal('  7.25 ', 'en-US')).toBe(7.25);
  });

  it('reads a comma as the decimal mark when the text has no dot', () => {
    expect(parseDecimal('0,5', 'de-DE')).toBe(0.5);
    expect(parseDecimal('1,5', 'de-DE')).toBe(1.5);
    expect(parseDecimal('1,5', 'fr-FR')).toBe(1.5);
    expect(parseDecimal('0,5', 'en-US')).toBe(0.5);
  });

  it("reads the locale's decimal mark after removing its grouping mark", () => {
    expect(parseDecimal('1.234,5', 'de-DE')).toBe(1234.5);
    expect(parseDecimal(`1${NARROW_NBSP}234,5`, 'fr-FR')).toBe(1234.5);
    // A typed space stands for fr-FR's narrow no-break space.
    expect(parseDecimal('1 234,5', 'fr-FR')).toBe(1234.5);
  });

  it('refuses text with more than one decimal mark', () => {
    expect(parseDecimal('1.2.3', 'en-US')).toBeNull();
    expect(parseDecimal('1,2,3', 'de-DE')).toBeNull();
  });

  it('refuses empty, non-numeric and non-finite text', () => {
    for (const text of ['', '   ', 'abc', '🍕', '12abc', '1e3', 'Infinity', 'NaN', '0x10', '-']) {
      expect(parseDecimal(text, 'en-US'), text).toBeNull();
    }
    expect(parseDecimal('9'.repeat(400), 'en-US')).toBeNull();
  });
});

describe('parseLocaleNumber', () => {
  it("reads the locale's grouping and decimal marks", () => {
    expect(parseLocaleNumber('8,368', 'en-US')).toBe(8368);
    expect(parseLocaleNumber('1,234,567.5', 'en-US')).toBe(1234567.5);
    expect(parseLocaleNumber('8.368', 'de-DE')).toBe(8368);
    expect(parseLocaleNumber('418,4', 'de-DE')).toBe(418.4);
    expect(parseLocaleNumber('1.234,5', 'de-DE')).toBe(1234.5);
    expect(parseLocaleNumber('8 368', 'fr-FR')).toBe(8368);
    expect(parseLocaleNumber(`8${NARROW_NBSP}368,5`, 'fr-FR')).toBe(8368.5);
  });

  it('accepts Indian grouping', () => {
    expect(parseLocaleNumber('12,34,567', 'en-IN')).toBe(1234567);
  });

  it('falls back to a comma as the decimal mark when the grouping is out of place', () => {
    expect(parseLocaleNumber('418,4', 'en-US')).toBe(418.4);
    expect(parseLocaleNumber('8368.4', 'de-DE')).toBe(8368.4);
    expect(parseLocaleNumber('1.5', 'de-DE')).toBe(1.5);
  });

  it('trims, keeps signs and refuses trailing junk', () => {
    expect(parseLocaleNumber(' 8368.4 ', 'en-US')).toBe(8368.4);
    expect(parseLocaleNumber('-5', 'en-US')).toBe(-5);
    for (const text of ['', ' ', 'abc', '12abc', '8,368kJ', 'Infinity', 'NaN', '1e3', '1.2.3']) {
      expect(parseLocaleNumber(text, 'en-US'), text).toBeNull();
    }
    expect(parseLocaleNumber('1,2,3', 'de-DE')).toBeNull();
  });
});

describe('formatQuantity', () => {
  it('writes whole numbers without decimals', () => {
    expect(formatQuantity(2)).toBe('2');
    expect(formatQuantity(150)).toBe('150');
    expect(formatQuantity(0)).toBe('0');
  });

  it('keeps up to two decimals below 10 and one from 10 up, without trailing zeros', () => {
    expect(formatQuantity(2.345)).toBe('2.35');
    expect(formatQuantity(0.5)).toBe('0.5');
    expect(formatQuantity(1.1)).toBe('1.1');
    expect(formatQuantity(9.999)).toBe('10');
    expect(formatQuantity(12.34)).toBe('12.3');
    expect(formatQuantity(12.05)).toBe('12.1');
    expect(formatQuantity(1234.56)).toBe('1234.6');
  });

  it('never writes "-0"', () => {
    expect(formatQuantity(-0.001)).toBe('0');
  });

  it('writes text that parseDecimal reads back in a comma locale', () => {
    for (const n of [2, 2.345, 0.25, 12.34, 1234.56]) {
      const text = formatQuantity(n);
      expect(parseDecimal(text, 'de-DE')).toBe(Number(text));
    }
  });
});

describe('formatMacro', () => {
  it('writes whole grams without decimals and anything else with one decimal', () => {
    expect(formatMacro(12)).toBe('12');
    expect(formatMacro(12.00001)).toBe('12');
    expect(formatMacro(12.34)).toBe('12.3');
    expect(formatMacro(12.04)).toBe('12.0');
    expect(formatMacro(0.25)).toBe('0.3');
    expect(formatMacro(1234.5)).toBe('1234.5');
  });
});

describe('formatNumber', () => {
  it('groups and rounds in the locale', () => {
    expect(formatNumber(8368, 'en-US')).toBe('8,368');
    expect(formatNumber(8368, 'de-DE')).toBe('8.368');
    expect(formatNumber(154.3234, 'en-US', 1, 1)).toBe('154.3');
    expect(formatNumber(70, 'de-DE', 1, 1)).toBe('70,0');
    expect(formatNumber(-0.01, 'en-US', 1, 1)).toBe('0.0');
  });

  it('uses en-US for a tag Intl refuses', () => {
    expect(formatNumber(8368, 'not a locale')).toBe('8,368');
  });
});

describe('plainText', () => {
  it('writes a dot, no grouping and no trailing zeros', () => {
    expect(plainText(0.551155, 2)).toBe('0.55');
    expect(plainText(1.10231, 2)).toBe('1.1');
    expect(plainText(12345.67, 1)).toBe('12345.7');
  });
});

describe('clamp', () => {
  it('holds a value to its bounds and reads NaN as the minimum', () => {
    expect(clamp(5, 1, 10)).toBe(5);
    expect(clamp(-1, 1, 10)).toBe(1);
    expect(clamp(11, 1, 10)).toBe(10);
    expect(clamp(Number.NaN, 1, 10)).toBe(1);
  });
});

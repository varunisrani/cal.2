import { describe, expect, it } from 'vitest';
import { barcodeKey } from './barcodeKey';

describe('barcodeKey', () => {
  it('gives a UPC-A and its EAN-13 form the same key (R02.14)', () => {
    expect(barcodeKey('036000291452')).toBe('36000291452');
    expect(barcodeKey('0036000291452')).toBe('36000291452');
  });

  it('keeps an all-digit code without leading zeros as it is', () => {
    expect(barcodeKey('4006381333931')).toBe('4006381333931');
  });

  it('reads an all-zero code as "0"', () => {
    expect(barcodeKey('0000')).toBe('0');
    expect(barcodeKey('0')).toBe('0');
  });

  it('trims, and lower-cases a code that is not all digits', () => {
    expect(barcodeKey('  0123 ')).toBe('123');
    expect(barcodeKey(' ABC-0012 ')).toBe('abc-0012');
  });

  it('has no key for a blank code', () => {
    expect(barcodeKey('')).toBeUndefined();
    expect(barcodeKey('   ')).toBeUndefined();
  });
});

import { describe, expect, it } from 'vitest';
import { barcodeKey, MAX_TYPED_DIGITS, readTypedBarcode } from './barcode';

describe('barcodeKey (R02.14)', () => {
  it('gives a UPC-A code and its EAN-13 form the same key', () => {
    expect(barcodeKey('036000291452')).toBe('36000291452');
    expect(barcodeKey('0036000291452')).toBe(barcodeKey('036000291452'));
  });

  it('trims before comparing, and keeps a code without leading zeros as it is', () => {
    expect(barcodeKey('  4006381333931\n')).toBe('4006381333931');
  });

  it('reads a code of zeros only as "0"', () => {
    expect(barcodeKey('000')).toBe('0');
    expect(barcodeKey('0')).toBe('0');
  });

  it('lower-cases a code with letters and keeps its zeros', () => {
    expect(barcodeKey(' XY-0042 ')).toBe('xy-0042');
  });

  it('has no key for a blank code', () => {
    expect(barcodeKey('')).toBeUndefined();
    expect(barcodeKey(' \t ')).toBeUndefined();
  });
});

describe('readTypedBarcode (D-16.18)', () => {
  it('drops the spaces printed between groups of digits', () => {
    expect(readTypedBarcode('0 12345 67890 5')).toEqual({ ok: true, value: '012345678905' });
    expect(readTypedBarcode(' 4006381333931 ')).toEqual({ ok: true, value: '4006381333931' });
  });

  it('keeps leading zeros: the code is sent as typed', () => {
    expect(readTypedBarcode('00012')).toEqual({ ok: true, value: '00012' });
  });

  it('refuses letters, punctuation and digits from other scripts', () => {
    for (const text of ['12a45', '0123-4567', '١٢٣٤', '12.5']) {
      expect(readTypedBarcode(text)).toEqual({ ok: false, error: 'notDigits' });
    }
  });

  it('takes 1 to 24 digits and refuses more', () => {
    expect(readTypedBarcode('7').ok).toBe(true);
    expect(readTypedBarcode('9'.repeat(MAX_TYPED_DIGITS)).ok).toBe(true);
    expect(MAX_TYPED_DIGITS).toBe(24);
    expect(readTypedBarcode('9'.repeat(MAX_TYPED_DIGITS + 1))).toEqual({
      ok: false,
      error: 'tooLong',
    });
  });

  it('says when nothing but spaces was typed', () => {
    expect(readTypedBarcode('')).toEqual({ ok: false, error: 'empty' });
    expect(readTypedBarcode('   ')).toEqual({ ok: false, error: 'empty' });
  });
});

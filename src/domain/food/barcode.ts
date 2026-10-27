// Barcode rules every layer shares (02 §3.12): the key two codes are compared by (R02.14), and
// what a person may type in place of a scan (D-16.18). A scanner can read one package as a
// 12-digit UPC-A or as the 13-digit EAN-13 form, which only adds a leading zero, so an all-digit
// code is compared without its leading zeros. Food databases are still sent the code as it was
// read; only comparisons use the key.

import { err, ok, type Result } from '../../lib/result';

/** The most digits a typed code may have: the most the food databases are asked with. */
export const MAX_TYPED_DIGITS = 24;

const ASCII_DIGITS = /^[0-9]+$/;

/**
 * The comparison key of a code: trimmed; an all-digit code without its leading zeros ("0" when
 * it is all zeros); any other code in lower case. Undefined for a blank code.
 */
export function barcodeKey(code: string): string | undefined {
  const trimmed = code.trim();
  if (trimmed === '') return undefined;
  if (!ASCII_DIGITS.test(trimmed)) return trimmed.toLowerCase();
  return trimmed.replace(/^0+/, '') || '0';
}

/** Why typed text is not a code: nothing typed, a character that is not a digit, too many. */
export type TypedCodeProblem = 'empty' | 'notDigits' | 'tooLong';

/**
 * The code in what a person typed: spaces (as printed under a barcode, "0 12345 67890 5") are
 * dropped, then 1–24 ASCII digits are a code and anything else is refused.
 */
export function readTypedBarcode(text: string): Result<string, TypedCodeProblem> {
  const code = text.replace(/\s+/g, '');
  if (code === '') return err('empty');
  if (!ASCII_DIGITS.test(code)) return err('notDigits');
  if (code.length > MAX_TYPED_DIGITS) return err('tooLong');
  return ok(code);
}

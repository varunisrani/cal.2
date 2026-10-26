// The key two barcodes are compared by (R02.14). A scanner may read the same package as a 12-digit
// UPC-A or as its 13-digit EAN-13 form, which only adds a leading zero, so an all-digit code drops
// its leading zeros. Anything else is compared without regard to case.

const DIGITS_ONLY = /^[0-9]+$/;

/**
 * The comparison key of a scanned code: trimmed; an all-digit code without leading zeros ("0"
 * when it is all zeros); any other code in lower case. Undefined for a blank code.
 */
export function barcodeKey(code: string): string | undefined {
  const trimmed = code.trim();
  if (trimmed === '') return undefined;
  if (!DIGITS_ONLY.test(trimmed)) return trimmed.toLowerCase();
  const significant = trimmed.replace(/^0+/, '');
  return significant === '' ? '0' : significant;
}

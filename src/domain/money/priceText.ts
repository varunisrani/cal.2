// A Price field's text (D-16.107), for the review and the entry editor: what typed text means, and
// an amount as the field shows it to edit.

import { parseLocaleNumber } from '../units/numbers';
import { roundedAmount } from './price';

/** What a Price field holds: nothing (no price), an amount, or text that is not one. */
export type TypedPrice =
  | { readonly kind: 'none' }
  | { readonly kind: 'amount'; readonly amount: number }
  | { readonly kind: 'invalid' };

/**
 * A Price field's text in `locale`: empty or spaces is no price; a number of 0 or more, with the
 * locale's grouping marks or a comma for decimals ("1,200", "4,50"), is an amount kept to two
 * decimals; anything else (a sign, words, a second number) is invalid.
 */
export function readPriceText(text: string, locale: string): TypedPrice {
  if (text.trim() === '') return { kind: 'none' };
  const value = parseLocaleNumber(text, locale);
  if (value === null || value < 0 || /^\s*[+-]/.test(text)) return { kind: 'invalid' };
  return { kind: 'amount', amount: roundedAmount(value) };
}

/** An amount as a Price field shows it to edit: "120", "4.50" (a dot, no grouping). */
export function priceInputText(amount: number): string {
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
}

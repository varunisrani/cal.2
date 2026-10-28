// A food's price (D-16.107): reading one from storage or a reply, and the currency a first run
// starts with (a typed one is read by `priceText.ts`, fetched with the screens that type it). A
// price is an amount in a currency's major unit with an ISO 4217 code; it is never converted, and
// a food without one has no price at all, never 0.

import type { Price } from '../model';

/** An ISO 4217 code as stored: three capital letters. */
const CODE = /^[A-Z]{3}$/;

/** True for a currency code as stored ("INR"). */
export function isCurrencyCode(value: unknown): value is string {
  return typeof value === 'string' && CODE.test(value);
}

/** A code written in any case or with spaces around it ("inr ") as stored, or undefined. */
export function currencyCodeOf(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const code = value.trim().toUpperCase();
  return CODE.test(code) ? code : undefined;
}

/** `amount` kept to two decimals (hundredths), never -0. */
export function roundedAmount(amount: number): number {
  return Math.round(amount * 100) / 100 + 0;
}

/** A finite amount of 0 or more, rounded to hundredths; else undefined. */
export function priceAmountOf(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? roundedAmount(value)
    : undefined;
}

/**
 * A stored or received price: an object with an amount of 0 or more (kept to two decimals) and a
 * currency code (upper-cased); anything else is no price.
 */
export function readPrice(raw: unknown): Price | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined;
  const fields = raw as Record<string, unknown>;
  const amount = priceAmountOf(fields.amount);
  const currency = currencyCodeOf(fields.currency);
  return amount === undefined || currency === undefined ? undefined : { amount, currency };
}

/** The regions of the euro area, and the four states that use the euro by agreement. */
const EURO_REGIONS: ReadonlySet<string> = new Set([
  'AT',
  'BE',
  'BG',
  'CY',
  'DE',
  'EE',
  'ES',
  'FI',
  'FR',
  'GR',
  'HR',
  'IE',
  'IT',
  'LT',
  'LU',
  'LV',
  'MT',
  'NL',
  'PT',
  'SI',
  'SK',
  'AD',
  'MC',
  'SM',
  'VA',
]);

/** The fallback for any other region, and for a tag without one. */
export const DEFAULT_CURRENCY = 'USD';

/**
 * The currency a first run starts with for a BCP 47 tag (normally `navigator.language`): rupees
 * in India, dollars in the United States, euros in the euro area, pounds in Britain, else dollars
 * (also for a tag without a region or one that cannot be read).
 */
export function currencyForLocale(tag: string): string {
  let region: string | undefined;
  try {
    region = new Intl.Locale(tag.trim().replaceAll('_', '-')).region;
  } catch {
    return DEFAULT_CURRENCY;
  }
  if (region === 'IN') return 'INR';
  if (region === 'GB') return 'GBP';
  if (region !== undefined && EURO_REGIONS.has(region)) return 'EUR';
  return DEFAULT_CURRENCY;
}

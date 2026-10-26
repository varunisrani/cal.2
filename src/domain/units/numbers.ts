// Reading numbers people type and writing numbers back into fields and labels.
//
// The locale is always an argument (a BCP 47 tag such as 'de-DE'); nothing here reads the
// browser. A locale's grouping and decimal marks come from `Intl` once per tag and are cached.
// Readers return null for anything that is not a number, never throw, and only accept ASCII
// digits.

/** The marks a locale writes numbers with: "1,234.5" (en-US), "1.234,5" (de-DE). */
export interface NumberMarks {
  /** Thousands separator, or null for a locale that never groups. */
  group: string | null;
  decimal: string;
}

/** A wheel or picker range in display units. `min` sits on the step grid. */
export interface StepRange {
  min: number;
  max: number;
  step: number;
}

const FALLBACK_LOCALE = 'en';
const FALLBACK_MARKS: NumberMarks = { group: ',', decimal: '.' };
const marksCache = new Map<string, NumberMarks>();
const fixedFormatCache = new Map<string, Intl.NumberFormat>();

/** Keeps `n` inside `[min, max]`. */
export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** The grouping and decimal marks of `locale`; en marks when `Intl` cannot use the tag. */
export function numberMarks(locale: string): NumberMarks {
  const cached = marksCache.get(locale);
  if (cached) return cached;
  let marks = FALLBACK_MARKS;
  try {
    // Seven digits so every locale shows a group, whatever its minimum grouping size.
    const parts = new Intl.NumberFormat(locale).formatToParts(1_234_567.5);
    marks = {
      group: parts.find((part) => part.type === 'group')?.value ?? null,
      decimal: parts.find((part) => part.type === 'decimal')?.value ?? '.',
    };
  } catch {
    // Not a usable tag: keep the en marks.
  }
  marksCache.set(locale, marks);
  return marks;
}

const PLAIN_NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)$/;

/**
 * A number written the plain way: an optional sign, ASCII digits and an optional dot fraction
 * ("12", "-2.5", ".5", "5."). No spaces, grouping, exponents, "Infinity" or "NaN".
 */
export function readPlainNumber(text: string): number | null {
  if (!PLAIN_NUMBER.test(text)) return null;
  const value = Number(text);
  if (!Number.isFinite(value)) return null;
  return value === 0 ? 0 : value;
}

// What people type for a locale's own group mark: any space for a no-break space (fr-FR), a
// straight apostrophe for a curly one (de-CH).
const SPACE_LIKE = /\s/u;
const APOSTROPHE_LIKE = /['’]/u;

/** Splits a whole-number part on the locale's group mark and the marks typed for it. */
function splitGroups(whole: string, group: string | null): string[] {
  if (group === null) return [whole];
  if (SPACE_LIKE.test(group)) return whole.split(/\s/u);
  if (APOSTROPHE_LIKE.test(group)) return whole.split(/['’]/u);
  return whole.split(group);
}

/**
 * The digits of a whole-number part once its group marks are gone, or null when the groups are
 * not where the locale puts them. The first group has 1–3 digits, later ones 2 or 3 (Indian
 * grouping uses 2), and the last exactly 3, so "1,5" in en-US is not fifteen.
 */
function ungroup(whole: string, group: string | null): string | null {
  const groups = splitGroups(whole, group);
  const [first, ...rest] = groups;
  if (first === undefined || !/^\d*$/.test(first)) return null;
  if (rest.length === 0) return first;
  if (first.length < 1 || first.length > 3) return null;
  const last = rest[rest.length - 1];
  if (last === undefined || last.length !== 3) return null;
  return rest.every((digits) => /^\d{2,3}$/.test(digits)) ? groups.join('') : null;
}

/**
 * A number written the way `locale` writes it: its group marks between digit groups and its
 * decimal mark ("8,368.4" in en-US, "8.368,4" in de-DE). Surrounding spaces are ignored.
 */
export function parseLocaleNumber(text: string, locale: string): number | null {
  const { group, decimal } = numberMarks(locale);
  const trimmed = text.trim();
  const sign = trimmed.startsWith('-') || trimmed.startsWith('+') ? trimmed.charAt(0) : '';
  const body = trimmed.slice(sign.length);
  const decimalAt = body.indexOf(decimal);
  const whole = decimalAt < 0 ? body : body.slice(0, decimalAt);
  const fraction = decimalAt < 0 ? '' : body.slice(decimalAt + decimal.length);
  if (!/^\d*$/.test(fraction)) return null;
  const digits = ungroup(whole, group);
  if (digits === null) return null;
  return readPlainNumber(decimalAt < 0 ? `${sign}${digits}` : `${sign}${digits}.${fraction}`);
}

/**
 * Reads a typed decimal in three tries: plain with a dot; with a comma as the decimal mark when
 * the text has a comma and no dot; then the locale's own marks. Signs are allowed; callers that
 * need a positive amount check it.
 */
export function parseDecimal(text: string, locale: string): number | null {
  const trimmed = text.trim();
  const plain = readPlainNumber(trimmed);
  if (plain !== null) return plain;
  if (trimmed.includes(',') && !trimmed.includes('.')) {
    const withComma = readPlainNumber(trimmed.replaceAll(',', '.'));
    if (withComma !== null) return withComma;
  }
  return parseLocaleNumber(trimmed, locale);
}

/**
 * `n` with at most `maxDigits` decimals, trailing zeros and a bare decimal mark removed, never
 * grouped, "-0" written as "0". The decimal mark is the locale's, or a dot without a locale.
 */
export function formatTrimmed(n: number, maxDigits: number, locale?: string): string {
  if (!Number.isFinite(n)) return '';
  let text = n.toFixed(maxDigits);
  if (text.includes('.')) text = text.replace(/\.?0+$/, '');
  if (text === '-0') text = '0';
  const mark = locale === undefined ? '.' : numberMarks(locale).decimal;
  return mark === '.' ? text : text.replace('.', mark);
}

/**
 * Text for a serving quantity field: whole numbers bare, below 10 up to two decimals, otherwise
 * up to one (2 → "2", 2.345 → "2.35", 12.34 → "12.3"). Reads back through `parseDecimal`.
 */
export function formatQuantity(n: number, locale?: string): string {
  const maxDigits = Number.isInteger(n) ? 0 : Math.abs(n) < 10 ? 2 : 1;
  return formatTrimmed(n, maxDigits, locale);
}

/** A macro amount in grams: rounded to a tenth, shown whole when that tenth is 0. */
export function formatMacro(n: number, locale?: string): string {
  return formatTrimmed(n, 1, locale);
}

/** `n` grouped the locale's way with exactly `digits` decimals ("1,000", "154.3", "8,5"). */
export function formatFixed(n: number, digits: number, locale: string): string {
  const key = `${locale}|${digits}`;
  let format = fixedFormatCache.get(key);
  if (!format) {
    const options = { minimumFractionDigits: digits, maximumFractionDigits: digits };
    try {
      format = new Intl.NumberFormat(locale, options);
    } catch {
      format = new Intl.NumberFormat(FALLBACK_LOCALE, options);
    }
    fixedFormatCache.set(key, format);
  }
  // `Intl` writes "-0.0" for a small negative that rounds to zero.
  return format.format(Math.abs(n) < 0.5 * 10 ** -digits ? 0 : n);
}

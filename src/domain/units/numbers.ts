// Reading and writing plain numbers. The locale is always an argument (a BCP 47 tag) and nothing
// here looks at the browser: the decimal and grouping marks of a locale come from `Intl`, so any
// locale it knows works, and a tag it refuses reads as en-US instead of throwing.
//
// Two ways to read typed text exist because the fields differ. Quantity fields (servings, water)
// use `parseDecimal`, which tries a dot first. Amount fields that people type with thousands
// marks (energy) use `parseLocaleNumber`, which reads the locale's own grouped form first.

const FALLBACK_LOCALE = 'en-US';

/** The marks a locale writes numbers with. `group` is empty when the locale has none. */
export interface NumberMarks {
  readonly decimal: string;
  readonly group: string;
}

/** A wheel picker's bounds and step, in the unit it shows. */
export interface WheelRange {
  readonly min: number;
  readonly max: number;
  readonly step: number;
}

const formats = new Map<string, Intl.NumberFormat>();
const marksByLocale = new Map<string, NumberMarks>();

function numberFormat(locale: string, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = `${locale}|${JSON.stringify(options)}`;
  let format = formats.get(key);
  if (format === undefined) {
    try {
      format = new Intl.NumberFormat(locale, options);
    } catch {
      format = new Intl.NumberFormat(FALLBACK_LOCALE, options);
    }
    formats.set(key, format);
  }
  return format;
}

/** The decimal and grouping marks of `locale`: de-DE → `{decimal: ',', group: '.'}`. */
export function numberMarks(locale: string): NumberMarks {
  let marks = marksByLocale.get(locale);
  if (marks === undefined) {
    const parts = numberFormat(locale, {}).formatToParts(1234567.5);
    marks = {
      decimal: parts.find((part) => part.type === 'decimal')?.value ?? '.',
      group: parts.find((part) => part.type === 'group')?.value ?? '',
    };
    marksByLocale.set(locale, marks);
  }
  return marks;
}

/** `n` held to `[min, max]`; NaN becomes `min`. */
export function clamp(n: number, min: number, max: number): number {
  if (Number.isNaN(n)) return min;
  return Math.min(max, Math.max(min, n));
}

// ASCII digits, at most one dot, an optional leading sign. No exponent, no Infinity, no spaces.
const PLAIN_NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)$/;

function readPlain(text: string): number | null {
  if (!PLAIN_NUMBER.test(text)) return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

const SPACES = /\s/g;

/**
 * Text with the locale's grouping marks taken out. When the mark is a space of some kind (fr-FR
 * writes U+202F, ru-RU U+00A0) every typed space counts as one, since nobody types U+202F.
 */
function withoutGroupMarks(text: string, group: string): string {
  if (group === '') return text;
  if (/^\s$/.test(group)) return text.replace(SPACES, '');
  return text.split(group).join('');
}

/**
 * A quantity typed in `locale`, or null. Tried in order: a plain number with a dot ("1.5",
 * "-2.5", "1.000" is 1); a comma as the decimal mark when the text has a comma and no dot
 * ("0,5"); the locale's own decimal mark after removing its grouping mark ("1 234,5" in fr-FR).
 * Signs pass through; callers refuse negatives where they make no sense.
 */
export function parseDecimal(text: string, locale: string): number | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;

  const plain = readPlain(trimmed);
  if (plain !== null) return plain;

  if (trimmed.includes(',') && !trimmed.includes('.')) {
    const withComma = readPlain(trimmed.replaceAll(',', '.'));
    if (withComma !== null) return withComma;
  }

  const { decimal, group } = numberMarks(locale);
  if (decimal === '.' || !trimmed.includes(decimal)) return null;
  const ungrouped = group === decimal ? trimmed : withoutGroupMarks(trimmed, group);
  return readPlain(ungrouped.replaceAll(decimal, '.'));
}

/**
 * True when `whole` (digits and group marks only) uses its marks in grouping places: the first
 * group has 1–3 digits, inner groups 2–3 (Indian grouping) and the last exactly 3.
 */
function isGroupedWhole(whole: string, group: string): boolean {
  const groups = whole.split(group);
  return groups.every((digits, index) => {
    if (!/^\d+$/.test(digits)) return false;
    if (index === 0) return digits.length <= 3;
    if (index === groups.length - 1) return digits.length === 3;
    return digits.length === 2 || digits.length === 3;
  });
}

function readGrouped(text: string, marks: NumberMarks): number | null {
  const sign = text.startsWith('-') || text.startsWith('+') ? text.charAt(0) : '';
  const body = text.slice(sign.length);
  const pieces = body.split(marks.decimal);
  if (pieces.length > 2) return null;
  const [whole = '', fraction] = pieces;
  let digits = whole;
  if (marks.group !== '' && marks.group !== marks.decimal && whole.includes(marks.group)) {
    if (!isGroupedWhole(whole, marks.group)) return null;
    digits = whole.split(marks.group).join('');
  }
  return readPlain(fraction === undefined ? `${sign}${digits}` : `${sign}${digits}.${fraction}`);
}

/**
 * A number typed the way `locale` writes it, grouping marks included ("8,368" in en-US, "8.368"
 * and "418,4" in de-DE), or null. Text the locale cannot read that way falls back to a comma as
 * the decimal mark ("418,4" in en-US is 418.4, not 4 184). Leading and trailing spaces are
 * trimmed; anything after the number makes it null.
 */
export function parseLocaleNumber(text: string, locale: string): number | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  const marks = numberMarks(locale);
  // A space-like grouping mark also matches the spaces people actually type.
  const spaceGroup = /^\s$/.test(marks.group);
  const normalised = spaceGroup ? trimmed.replace(SPACES, ' ') : trimmed;
  const readable = spaceGroup ? { decimal: marks.decimal, group: ' ' } : marks;
  return readGrouped(normalised, readable) ?? readPlain(trimmed.replaceAll(',', '.'));
}

/** `n` with a value that rounds to zero at `digits` decimals passed as 0, so nothing reads "-0". */
function noNegativeZero(n: number, digits: number): number {
  return Math.abs(n) < 0.5 * 10 ** -digits ? 0 : n;
}

/** Up to `digits` decimals, a dot, no grouping, trailing zeros dropped: (2.345, 2) → "2.35". */
export function plainText(n: number, digits: number): string {
  const format = numberFormat(FALLBACK_LOCALE, {
    maximumFractionDigits: digits,
    useGrouping: false,
  });
  return format.format(noNegativeZero(n, digits));
}

/**
 * `n` as `locale` writes it, with grouping and between `minDigits` and `maxDigits` decimals:
 * (8368, 'de-DE') → "8.368"; (154.32, 'en-US', 1, 1) → "154.3".
 */
export function formatNumber(n: number, locale: string, maxDigits = 0, minDigits = 0): string {
  const format = numberFormat(locale, {
    minimumFractionDigits: minDigits,
    maximumFractionDigits: maxDigits,
  });
  return format.format(noNegativeZero(n, maxDigits));
}

/**
 * The text a quantity field shows for an amount: whole numbers with no decimals, below 10 up to
 * two decimals, otherwise up to one, trailing zeros dropped (2 → "2", 2.345 → "2.35", 12.34 →
 * "12.3"). Always a dot and no grouping, so `parseDecimal` reads it back in every locale.
 */
export function formatQuantity(n: number): string {
  return plainText(n, Math.abs(n) < 10 ? 2 : 1);
}

/**
 * Macro grams: a whole number (within 0.0001) without decimals, anything else with exactly one
 * decimal and a dot (12 → "12", 12.34 → "12.3", 12.04 → "12.0").
 */
export function formatMacro(n: number): string {
  const whole = Math.round(n);
  if (Math.abs(n - whole) < 0.0001) return plainText(whole, 0);
  return numberFormat(FALLBACK_LOCALE, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
    useGrouping: false,
  }).format(noNegativeZero(n, 1));
}

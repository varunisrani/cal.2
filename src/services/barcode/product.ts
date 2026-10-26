/**
 * What a barcode lookup hands the review sheet, and the reading rules the Open Food Facts and
 * FoodData Central clients share: numbers that may arrive as text, grams written in a serving or
 * package text, the name made of product name and brand, and gram amounts converted to the units
 * the diary stores (rounded to 0.1). No words live here: the name of a product without one comes
 * from the caller.
 */
import type { EntrySource, NutrientKey, NutritionDraft } from '../../domain/model';
import { NUTRIENT_UNITS, type MassUnit } from '../../domain/nutrients/catalogue';
import type { RequestDeps } from './http';

/** The emoji of a packaged product's entry. */
export const LABEL_EMOJI = '🏷️';

/** kcal in one kJ, for databases that give energy only in kilojoules. */
export const KCAL_PER_KJ = 0.23900573614;

/** A product found by barcode, ready for the review sheet. */
export interface BarcodeProduct {
  /** One serving (or 100 g, or one serving of unknown weight) with the product block filled in. */
  readonly draft: NutritionDraft;
  /** How the entry's numbers were obtained. */
  readonly source: Extract<EntrySource, 'barcode'>;
  /**
   * The ingredient text with the database's allergen markup, when it has one (Open Food Facts),
   * for the label markers of the product block. `draft.product.ingredients` holds the plain text.
   */
  readonly ingredientsMarkup?: string;
}

/** What both clients need from their caller. */
export interface LookupDeps extends RequestDeps {
  /** The name of a product the database names nowhere, e.g. "Barcode 0123" (a catalogue word). */
  readonly unnamed: (code: string) => string;
}

/** A draft for a packaged product: no ingredient lines, the label emoji. */
export function productDraft(
  values: Omit<NutritionDraft, 'lines' | 'emoji' | 'progressive'>,
): NutritionDraft {
  return { ...values, lines: [], emoji: LABEL_EMOJI, progressive: false };
}

// ---- Reading JSON values --------------------------------------------------------------------

/** A JSON object (not an array, not null). */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A plain decimal, optionally signed, optionally with an exponent. */
const DECIMAL = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;

/**
 * A finite number given as a number or as text ("12.5", " 10,0 "); undefined for anything else,
 * empty text included.
 */
export function readNumber(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value !== 'string') return undefined;
  const text = value.trim().replace(',', '.');
  if (!DECIMAL.test(text)) return undefined;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** An amount: a number of 0 or more (`readNumber`); a negative one counts as missing. */
export function readAmount(value: unknown): number | undefined {
  const n = readNumber(value);
  return n !== undefined && n >= 0 ? n : undefined;
}

/** Trimmed text, or undefined for anything that is not text with something in it. */
export function readString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  return text === '' ? undefined : text;
}

// ---- Grams in free text ---------------------------------------------------------------------

/** Grams in one of each unit a serving or package text may use. Millilitres count as grams. */
const GRAMS_PER_TEXT_UNIT: Readonly<Record<string, number>> = {
  g: 1,
  gr: 1,
  gram: 1,
  grams: 1,
  ml: 1,
  l: 1000,
  kg: 1000,
  mg: 0.001,
  oz: 28.3495,
  'fl oz': 29.5735,
};

// A number, optional space, then a unit that does not run on into a letter: "1 large egg (50 g)"
// is 50 g, not one litre. "fl oz" is its own unit, so fluid ounces never read as ounces.
const AMOUNT_WITH_UNIT = /(\d+(?:\.\d+)?)\s*(fl oz|grams|gram|gr|kg|mg|ml|oz|g|l)(?![a-z])/;

/**
 * Grams in a free text such as "30 g (1 cup)" or "12 fl. oz": the first number followed by a known
 * unit, with a comma read as a decimal point. Undefined when the text has none.
 */
export function gramsInText(text: string | undefined): number | undefined {
  if (text === undefined) return undefined;
  const plain = text
    .toLocaleLowerCase('en-US')
    .replaceAll(',', '.')
    .replace(/fl\.?\s*oz/g, 'fl oz');
  const found = AMOUNT_WITH_UNIT.exec(plain);
  if (!found) return undefined;
  const [, amount = '', unit = ''] = found;
  const perUnit = GRAMS_PER_TEXT_UNIT[unit];
  return perUnit === undefined ? undefined : Number(amount) * perUnit;
}

// ---- Names ----------------------------------------------------------------------------------

/**
 * The entry name: "Brand Name" when both are known and the name does not already hold the brand
 * (in any case); else the name, the brand, or the caller's word for an unnamed product.
 */
export function productName(
  name: string | undefined,
  brand: string | undefined,
  code: string,
  unnamed: (code: string) => string,
): string {
  if (name !== undefined && brand !== undefined) {
    const holdsBrand = name.toLocaleLowerCase('en-US').includes(brand.toLocaleLowerCase('en-US'));
    return holdsBrand ? name : `${brand} ${name}`;
  }
  return name ?? brand ?? unnamed(code);
}

// ---- Units ------------------------------------------------------------------------------------

/** `value` rounded to one decimal place. */
export function oneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

const PER_GRAM: Readonly<Record<MassUnit, number>> = { g: 1, mg: 1_000, mcg: 1_000_000 };

/** An amount in grams in the unit `key` is stored in, rounded to 0.1 of that unit. */
export function storedNutrient(key: NutrientKey, grams: number): number {
  return oneDecimal(grams * PER_GRAM[NUTRIENT_UNITS[key]]);
}

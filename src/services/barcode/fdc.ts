/**
 * The FoodData Central client (02 §3.12): the second food database, asked only with the person's
 * own key. Nothing is sent without a stored key and a code that can be a GTIN; the key travels in
 * the `X-Api-Key` header and nowhere else, and a key a header cannot carry is refused here
 * (R02.18). The search ORs every spelling of the code, and only a Branded food with exactly this
 * GTIN is used (R02.14). With a known serving weight, label values win over scaled per-100 g
 * values; without one, the two sets are never mixed (R02.16).
 */
import { barcodeKey } from '../../data/barcodeKey';
import { FDC_SLOT, type SecretsRepo } from '../../data/repos/secretsRepo';
import type {
  NutrientKey,
  NutrientValues,
  NutritionDraft,
  ProductInfo,
  ServingBasis,
  UnitChoice,
} from '../../domain/model';
import { SERVING_UNIT } from '../../domain/servings/units';
import { err, ok, type Result } from '../../lib/result';
import { fetchWithin, isSuccess, readTextReply } from './http';
import {
  gramsInText,
  isRecord,
  KCAL_PER_KJ,
  productDraft,
  productName,
  readAmount,
  readNumber,
  readString,
  storedNutrient,
  type BarcodeProduct,
  type LookupDeps,
} from './product';

export const FDC_SEARCH_URL = 'https://api.nal.usda.gov/fdc/v1/foods/search';

/** Our limit for one search. */
export const FDC_TIMEOUT_MS = 15_000;

/** How many foods one search returns. */
const PAGE_SIZE = 25;

export type FdcFailureKind =
  'noKey' | 'invalid' | 'notFound' | 'keyRefused' | 'unavailable' | 'cancelled';

/**
 * Why FoodData Central gave no product. Only `keyRefused` has its own message; the lookup shows
 * Open Food Facts' failure for the others, and `cancelled` (the person's Cancel) shows nothing.
 */
export interface FdcFailure {
  readonly kind: FdcFailureKind;
}

export interface FdcDeps extends LookupDeps {
  /** The stored keys; the food-database key is in the `fdc` slot. */
  readonly secrets: Pick<SecretsRepo, 'get'>;
}

const fail = (kind: FdcFailureKind): Result<never, FdcFailure> => err({ kind });

/** Every character of a key a request header can carry: printable ASCII, no spaces. */
const HEADER_SAFE = /^[\x21-\x7E]+$/;

/**
 * Searches FoodData Central for a scanned code. No key → `noKey` and a code that cannot be a GTIN
 * → `invalid`, both without a request; a key with a character outside printable ASCII →
 * `keyRefused` without a request. 401/403 → `keyRefused`; every other failure, our 15 s limit
 * included, → `unavailable`; no exact Branded match with nutrition → `notFound`.
 */
export async function lookupFdc(
  scanned: string,
  deps: FdcDeps,
): Promise<Result<BarcodeProduct, FdcFailure>> {
  const code = scanned.trim();
  const spellings = gtinSpellings(code);
  if (spellings.length === 0) return fail('invalid');
  const key = await storedKey(deps.secrets);
  if (key === undefined) return fail('noKey');
  if (!HEADER_SAFE.test(key)) return fail('keyRefused');

  const reply = await fetchWithin(
    FDC_SEARCH_URL,
    {
      method: 'POST',
      headers: { 'X-Api-Key': key, 'Content-Type': 'application/json', Accept: 'application/json' },
      // The words are OR-ed, so one search covers every spelling the database may store.
      body: JSON.stringify({
        query: spellings.join(' '),
        dataType: ['Branded'],
        requireAllWords: false,
        pageSize: PAGE_SIZE,
      }),
    },
    deps,
    FDC_TIMEOUT_MS,
    readTextReply,
  );
  if (!reply.ok) return fail(reply.error === 'cancelled' ? 'cancelled' : 'unavailable');

  const { status, body } = reply.value;
  if (status === 401 || status === 403) return fail('keyRefused');
  if (!isSuccess(status)) return fail('unavailable');
  const foods = foodList(body);
  if (foods === undefined) return fail('unavailable');

  for (const food of foods) {
    if (!isRecord(food) || !isBranded(food) || !sameGtin(food.gtinUpc, code)) continue;
    const draft = readFood(food, code, deps.unnamed);
    if (draft !== undefined) return ok({ draft, source: 'barcode' });
  }
  return fail('notFound');
}

/** The stored key, trimmed; undefined when there is none or the keys cannot be read. */
async function storedKey(secrets: Pick<SecretsRepo, 'get'>): Promise<string | undefined> {
  try {
    return readString(await secrets.get(FDC_SLOT));
  } catch {
    return undefined;
  }
}

/** The `foods` list of a search reply, or undefined when the body is not one. */
function foodList(body: string): readonly unknown[] | undefined {
  try {
    const parsed: unknown = JSON.parse(body);
    return isRecord(parsed) && Array.isArray(parsed.foods) ? parsed.foods : undefined;
  } catch {
    return undefined;
  }
}

/** A Branded food, or one that does not say its type. */
function isBranded(food: Record<string, unknown>): boolean {
  const type = readString(food.dataType);
  return type === undefined || type.toLocaleLowerCase('en-US') === 'branded';
}

// ---- GTINs ------------------------------------------------------------------------------------

/** The longest GTIN (GTIN-14). */
const MAX_GTIN_DIGITS = 14;
/** The GTIN widths a code is padded to: GTIN-8, UPC-A (GTIN-12), EAN-13 and GTIN-14. */
const GTIN_WIDTHS = [8, 12, 13, 14] as const;
const ASCII_DIGITS = /^[0-9]+$/;

/**
 * Every spelling FoodData Central may store a code under: as scanned, without leading zeros, and
 * zero-padded to 8, 12, 13 and 14 digits where it fits; no spelling longer than 14 digits, no
 * repeats. Empty (so no request) for anything but digits, all zeros, or more than 14 significant
 * digits.
 */
export function gtinSpellings(code: string): string[] {
  if (!ASCII_DIGITS.test(code)) return [];
  const significant = code.replace(/^0+/, '');
  if (significant === '' || significant.length > MAX_GTIN_DIGITS) return [];
  const padded = GTIN_WIDTHS.filter((width) => significant.length <= width).map((width) =>
    significant.padStart(width, '0'),
  );
  const spellings = [code, significant, ...padded].filter(
    (spelling) => spelling.length <= MAX_GTIN_DIGITS,
  );
  return [...new Set(spellings)];
}

/** Whether a stored GTIN is the scanned code once leading zeros are ignored. */
export function sameGtin(stored: unknown, scanned: string): boolean {
  if (typeof stored !== 'string') return false;
  const wanted = barcodeKey(scanned);
  return wanted !== undefined && barcodeKey(stored) === wanted;
}

// ---- Reading a food ---------------------------------------------------------------------------

/** One nutrient entry: its value and its unit name in capitals. */
interface Reading {
  readonly value: number;
  readonly unit: string;
}

/**
 * One set of values to read from: the entries (per 100 g) multiplied by `scale`, and the label
 * values (per serving) as they are. Either part may be empty.
 */
interface Panel {
  readonly entries: ReadonlyMap<number, Reading>;
  readonly label: Readonly<Record<string, unknown>>;
  readonly scale: number;
}

const NO_ENTRIES: ReadonlyMap<number, Reading> = new Map();

/** Grams in one of each entry unit. */
const GRAMS_PER_ENTRY_UNIT: ReadonlyMap<string, number> = new Map([
  ['G', 1],
  ['MG', 0.001],
  ['UG', 0.000_001],
  ['MCG', 0.000_001],
]);

/** Energy ids in kcal, the first one present wins; the kJ id is used only without them. */
const KCAL_IDS = [1008, 2047, 2048] as const;
const KJ_ID = 1062;

/** Vitamin D in International Units, used only without the microgram id; 1 IU = 0.025 µg. */
const VITAMIN_D_IU_ID = 1110;
const VITAMIN_D_GRAMS_PER_IU = 0.025e-6;

/** Where a value is read: entry ids (first present wins) and the label key, if the label has it. */
interface Source {
  readonly ids: readonly number[];
  readonly label?: string;
  /** The label gives this one in milligrams. */
  readonly labelMg?: true;
}

const PROTEIN: Source = { ids: [1003], label: 'protein' };
const CARBS: Source = { ids: [1005, 1050], label: 'carbohydrates' };
const FAT: Source = { ids: [1004], label: 'fat' };

/** The optional nutrients FoodData Central has (no omega-3), by nutrient id. */
const NUTRIENT_SOURCES: Readonly<Partial<Record<NutrientKey, Source>>> = {
  addedSugar: { ids: [1235], label: 'addedSugar' },
  fibre: { ids: [1079], label: 'fiber' },
  monounsaturatedFat: { ids: [1292] },
  polyunsaturatedFat: { ids: [1293] },
  saturatedFat: { ids: [1258], label: 'saturatedFat' },
  sugar: { ids: [2000, 1063], label: 'sugars' },
  transFat: { ids: [1257], label: 'transFat' },
  caffeine: { ids: [1057] },
  calcium: { ids: [1087], label: 'calcium', labelMg: true },
  cholesterol: { ids: [1253], label: 'cholesterol', labelMg: true },
  iron: { ids: [1089], label: 'iron', labelMg: true },
  magnesium: { ids: [1090] },
  potassium: { ids: [1092], label: 'potassium', labelMg: true },
  sodium: { ids: [1093], label: 'sodium', labelMg: true },
  vitaminC: { ids: [1162] },
  vitaminE: { ids: [1109] },
  zinc: { ids: [1095] },
  folate: { ids: [1190, 1177] },
  vitaminA: { ids: [1106] },
  vitaminB12: { ids: [1178] },
  vitaminD: { ids: [1114] },
  vitaminK: { ids: [1185] },
};

/** The entries by nutrient id. The first usable entry per id counts: older panels follow it. */
function readEntries(list: unknown): Map<number, Reading> {
  const entries = new Map<number, Reading>();
  if (!Array.isArray(list)) return entries;
  for (const item of list) {
    if (!isRecord(item)) continue;
    const id = item.nutrientId;
    if (typeof id !== 'number' || !Number.isInteger(id) || entries.has(id)) continue;
    const value = readAmount(item.value);
    if (value === undefined) continue;
    entries.set(id, { value, unit: readString(item.unitName)?.toLocaleUpperCase('en-US') ?? '' });
  }
  return entries;
}

function labelValue(panel: Panel, key: string): number | undefined {
  const field = panel.label[key];
  return isRecord(field) ? readAmount(field.value) : undefined;
}

/** Grams of a nutrient in the panel's amount: the label value first, else the first entry. */
function gramsOf(panel: Panel, source: Source): number | undefined {
  const onLabel = source.label === undefined ? undefined : labelValue(panel, source.label);
  if (onLabel !== undefined) return source.labelMg ? onLabel / 1000 : onLabel;
  for (const id of source.ids) {
    const reading = panel.entries.get(id);
    const perUnit = reading === undefined ? undefined : GRAMS_PER_ENTRY_UNIT.get(reading.unit);
    if (reading !== undefined && perUnit !== undefined)
      return reading.value * perUnit * panel.scale;
  }
  return undefined;
}

function kcalOf(panel: Panel): number | undefined {
  const onLabel = labelValue(panel, 'calories');
  if (onLabel !== undefined) return onLabel;
  for (const id of KCAL_IDS) {
    const reading = panel.entries.get(id);
    if (reading?.unit === 'KCAL') return reading.value * panel.scale;
  }
  const kilojoules = panel.entries.get(KJ_ID);
  return kilojoules?.unit === 'KJ' ? kilojoules.value * KCAL_PER_KJ * panel.scale : undefined;
}

/** kcal, protein, carbs and fat as read from a panel. */
function coreOf(panel: Panel): (number | undefined)[] {
  return [kcalOf(panel), gramsOf(panel, PROTEIN), gramsOf(panel, CARBS), gramsOf(panel, FAT)];
}

function coreCount(panel: Panel): number {
  return coreOf(panel).filter((value) => value !== undefined).length;
}

/** Grams in one of each serving unit code, case-insensitive. Millilitres count as grams. */
const GRAMS_PER_SERVING_UNIT: ReadonlyMap<string, number> = new Map([
  ['g', 1],
  ['gram', 1],
  ['grams', 1],
  ['grm', 1],
  ['ml', 1],
  ['mlt', 1],
  ['kg', 1000],
  ['l', 1000],
  ['ltr', 1000],
  ['mg', 0.001],
  ['oz', 28.3495],
  ['onz', 28.3495],
  ['fl oz', 29.5735],
  ['foz', 29.5735],
]);

/**
 * The serving weight in grams: the size in a known unit, else grams in the household text
 * ("1 bar (40 g)"); any positive weight counts, below 1 g too. Undefined when unknown.
 */
function servingWeight(food: Record<string, unknown>): number | undefined {
  const size = readNumber(food.servingSize);
  const unit = readString(food.servingSizeUnit)?.toLocaleLowerCase('en-US');
  const perUnit = unit === undefined ? undefined : GRAMS_PER_SERVING_UNIT.get(unit);
  const weight =
    size !== undefined && size > 0 && perUnit !== undefined
      ? size * perUnit
      : gramsInText(readString(food.householdServingFullText));
  return weight !== undefined && Number.isFinite(weight) && weight > 0 ? weight : undefined;
}

/** The draft's amount and which values describe it. */
interface Amount {
  readonly panel: Panel;
  readonly basis: ServingBasis;
  readonly units: readonly UnitChoice[];
}

function amountOf(food: Record<string, unknown>): Amount {
  const entries = readEntries(food.foodNutrients);
  const label = isRecord(food.labelNutrients) ? food.labelNutrients : {};
  const weight = servingWeight(food);
  if (weight !== undefined) {
    return {
      panel: { entries, label, scale: weight / 100 },
      basis: { kind: 'grams', grams: weight },
      units: [{ unit: SERVING_UNIT, gramsEach: weight, count: 1 }],
    };
  }
  // Label values are per serving and entries per 100 g: without the weight neither converts to
  // the other, so one set alone is used (R02.16).
  const labelOnly: Panel = { entries: NO_ENTRIES, label, scale: 0 };
  const per100g: Panel = { entries, label: {}, scale: 1 };
  const labelCore = coreCount(labelOnly);
  if (labelCore > 0 && labelCore >= coreCount(per100g)) {
    return { panel: labelOnly, basis: { kind: 'servings', count: 1 }, units: [] };
  }
  return { panel: per100g, basis: { kind: 'grams', grams: 100 }, units: [] };
}

/** A food as a review draft; undefined when it has no kcal, protein, carbs or fat. */
function readFood(
  food: Record<string, unknown>,
  code: string,
  unnamed: (code: string) => string,
): NutritionDraft | undefined {
  const { panel, basis, units } = amountOf(food);
  const [kcal, protein, carbs, fat] = coreOf(panel);
  if (kcal === undefined && protein === undefined && carbs === undefined && fat === undefined) {
    return undefined;
  }

  const nutrients: NutrientValues = {};
  for (const [key, source] of Object.entries(NUTRIENT_SOURCES) as [NutrientKey, Source][]) {
    const grams = gramsOf(panel, source);
    if (grams !== undefined) nutrients[key] = storedNutrient(key, grams);
  }
  if (nutrients.vitaminD === undefined) {
    const iu = panel.entries.get(VITAMIN_D_IU_ID);
    if (iu?.unit === 'IU') {
      nutrients.vitaminD = storedNutrient(
        'vitaminD',
        iu.value * VITAMIN_D_GRAMS_PER_IU * panel.scale,
      );
    }
  }

  const description = readString(food.description);
  const brand = readString(food.brandName) ?? readString(food.brandOwner);
  const name = productName(
    description === undefined ? undefined : englishTitleCase(description),
    brand === undefined ? undefined : englishTitleCase(brand),
    code,
    unnamed,
  );

  // One serving is picked when there is a serving unit; a 100 g basis opens in grams.
  const servingPicked = units.length > 0;
  return productDraft({
    name,
    kcal: Math.round(kcal ?? 0),
    protein: protein ?? 0,
    carbs: carbs ?? 0,
    fat: fat ?? 0,
    nutrients,
    extras: {},
    basis,
    units,
    ...(servingPicked ? { chosenUnit: SERVING_UNIT, chosenCount: 1 } : {}),
    product: productInfo(food, code),
  });
}

function productInfo(food: Record<string, unknown>, code: string): ProductInfo {
  const category = readString(food.foodCategory);
  const info: ProductInfo = {
    barcode: code,
    allergens: [],
    traces: [],
    labels: [],
    categories: category === undefined ? [] : [category],
    source: 'fdc',
  };
  const ingredients = readString(food.ingredients);
  if (ingredients !== undefined) info.ingredients = ingredients;
  return info;
}

/**
 * Title case for a name written in capitals ("GREEK YOGURT" → "Greek Yogurt"); a name with any
 * lower-case letter is kept as it is. English casing rules whatever the device language, so a
 * capital I never becomes a dotless ı (R02.18). A word starts after a space or punctuation other
 * than an apostrophe.
 */
export function englishTitleCase(text: string): string {
  if (/\p{Ll}/u.test(text)) return text;
  return text
    .toLocaleLowerCase('en-US')
    .replace(
      /(^|[^\p{L}\p{N}'’])(\p{L})/gu,
      (_match, before: string, letter: string) => before + letter.toLocaleUpperCase('en-US'),
    );
}

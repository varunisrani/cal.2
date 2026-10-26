/**
 * The Open Food Facts client (02 §3.12): one product request per scanned code, its reply sorted
 * into a product or a failure kind, and the product read as a review draft for one serving
 * (R02.16). The code goes out exactly as scanned, leading zeros kept (R02.14). Failures are values;
 * the lookup screen picks the words.
 */
import type {
  ExtraKey,
  ExtraValues,
  NovaGroup,
  NutrientKey,
  NutrientValues,
  ProductInfo,
} from '../../domain/model';
import { normaliseChoices, SERVING_UNIT } from '../../domain/servings/units';
import { err, ok, type Result } from '../../lib/result';
import { fetchWithin, isSuccess, readTextReply, type RequestDeps } from './http';
import {
  gramsInText,
  isRecord,
  KCAL_PER_KJ,
  oneDecimal,
  productDraft,
  productName,
  readAmount,
  readNumber,
  readString,
  storedNutrient,
  type BarcodeProduct,
  type LookupDeps,
} from './product';

/** The product endpoint; the code and `.json` follow. */
export const OFF_PRODUCT_URL = 'https://world.openfoodfacts.org/api/v2/product/';

/** How the app names itself to Open Food Facts: browsers may not set a User-Agent (02-Q4). */
export const OFF_APP_NAME = 'Platewise';

/** Our limit for one Open Food Facts request, the product photo included. */
export const OFF_TIMEOUT_MS = 30_000;

/** The largest product photo kept. */
export const MAX_PHOTO_BYTES = 5_000_000;

/** The only host product photos are taken from. */
const PHOTO_HOST = 'images.openfoodfacts.org';

/** The product fields asked for (02 §2); the API ignores their order. */
export const OFF_FIELDS = [
  'allergens_tags',
  'brands',
  'categories_tags',
  'ecoscore_grade',
  'generic_name',
  'image_front_url',
  'ingredients_text',
  'ingredients_text_with_allergens',
  'labels_tags',
  'nova_group',
  'nutriments',
  'nutriscore_grade',
  'product_name',
  'product_quantity',
  'product_quantity_unit',
  'quantity',
  'serving_quantity',
  'serving_size',
  'traces_tags',
] as const;

export type OffFailureKind =
  | 'invalid'
  | 'notFound'
  | 'noNutrition'
  | 'rateLimited'
  | 'unavailable'
  | 'unexpected'
  | 'offline'
  | 'timeout'
  | 'network'
  | 'cancelled';

/** Why Open Food Facts gave no product. `cancelled` is the person's Cancel and is never shown. */
export interface OffFailure {
  readonly kind: OffFailureKind;
}

export interface OffDeps extends LookupDeps {
  /** A BCP 47 tag for `lc`; the browser's language when left out. */
  readonly language?: string;
}

/** The longest code sent. */
const MAX_CODE_DIGITS = 24;
const ASCII_DIGITS = /^[0-9]+$/;

/** The code as it is sent: trimmed, 1–24 ASCII digits; undefined for anything else. */
export function offCode(scanned: string): string | undefined {
  const code = scanned.trim();
  return code.length <= MAX_CODE_DIGITS && ASCII_DIGITS.test(code) ? code : undefined;
}

/** The primary language subtag `lc` carries: "pt" for "pt-BR"; "en" when there is none. */
export function offLanguage(tag: string | undefined): string {
  const primary = (tag ?? '').trim().split(/[-_]/)[0]?.toLowerCase() ?? '';
  return /^[a-z]{2,3}$/.test(primary) ? primary : 'en';
}

function browserLanguage(): string | undefined {
  return typeof navigator === 'undefined' ? undefined : navigator.language;
}

/** The request URL for a checked code. */
export function offUrl(code: string, language: string | undefined): string {
  const query = new URLSearchParams({
    fields: OFF_FIELDS.join(','),
    lc: offLanguage(language),
    app_name: OFF_APP_NAME,
  });
  return `${OFF_PRODUCT_URL}${code}.json?${query.toString()}`;
}

const fail = (kind: OffFailureKind): Result<never, OffFailure> => err({ kind });

/**
 * Looks a scanned code up in Open Food Facts. A code that is not 1–24 ASCII digits sends nothing.
 * 404 is `notFound`, 429 `rateLimited`, 5xx `unavailable`, any other non-2xx or an unreadable body
 * `unexpected`; `status` 0 or no product is `notFound`; a product without kcal, protein, carbs or
 * fat is `noNutrition`.
 */
export async function lookupOff(
  scanned: string,
  deps: OffDeps,
): Promise<Result<BarcodeProduct, OffFailure>> {
  const code = offCode(scanned);
  if (code === undefined) return fail('invalid');

  const reply = await fetchWithin(
    offUrl(code, deps.language ?? browserLanguage()),
    { headers: { Accept: 'application/json' } },
    deps,
    OFF_TIMEOUT_MS,
    readTextReply,
  );
  if (!reply.ok) return fail(reply.error);

  const { status, body } = reply.value;
  if (status === 404) return fail('notFound');
  if (status === 429) return fail('rateLimited');
  if (status >= 500 && status <= 599) return fail('unavailable');
  if (!isSuccess(status)) return fail('unexpected');

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return fail('unexpected');
  }
  if (!isRecord(parsed)) return fail('unexpected');
  if (readNumber(parsed.status) === 0 || !isRecord(parsed.product)) return fail('notFound');
  return readProduct(parsed.product, code, deps.unnamed);
}

// ---- Reading a product ------------------------------------------------------------------------

/** The nutriment key of each optional nutrient; OFF gives all of them in grams. */
const NUTRIENT_FIELDS: Readonly<Record<NutrientKey, string>> = {
  addedSugar: 'added-sugars',
  fibre: 'fiber',
  monounsaturatedFat: 'monounsaturated-fat',
  omega3: 'omega-3-fat',
  polyunsaturatedFat: 'polyunsaturated-fat',
  saturatedFat: 'saturated-fat',
  sugar: 'sugars',
  transFat: 'trans-fat',
  caffeine: 'caffeine',
  calcium: 'calcium',
  cholesterol: 'cholesterol',
  iron: 'iron',
  magnesium: 'magnesium',
  potassium: 'potassium',
  sodium: 'sodium',
  vitaminC: 'vitamin-c',
  vitaminE: 'vitamin-e',
  zinc: 'zinc',
  folate: 'folates',
  vitaminA: 'vitamin-a',
  vitaminB12: 'vitamin-b12',
  vitaminD: 'vitamin-d',
  vitaminK: 'vitamin-k',
};

/** The nutriment key of each sports compound, in grams. */
const EXTRA_FIELDS: Readonly<Record<ExtraKey, string>> = {
  arginine: 'l-arginine',
  betaAlanine: 'beta-alanine',
  betaine: 'betaine',
  carnitine: 'l-carnitine',
  citrulline: 'l-citrulline',
  creatine: 'creatine',
  hmb: 'hmb',
  taurine: 'taurine',
};

/** Package weights closer than this to the serving add no "package" unit. */
const SAME_WEIGHT_GRAMS = 0.01;

function readProduct(
  product: Record<string, unknown>,
  code: string,
  unnamed: (code: string) => string,
): Result<BarcodeProduct, OffFailure> {
  const nutriments = product.nutriments;
  if (!isRecord(nutriments)) return fail('noNutrition');

  // A serving below 1 g would turn a per-100 g label into near-zero numbers.
  const servingGrams = Math.max(
    positive(readNumber(product.serving_quantity)) ??
      positive(gramsInText(readString(product.serving_size))) ??
      100,
    1,
  );
  // Per serving: the database's own per-serving figure, else its per-100 g figure scaled.
  const perServing = (key: string): number | undefined => {
    const given = readAmount(nutriments[`${key}_serving`]);
    if (given !== undefined) return given;
    const per100 = readAmount(nutriments[`${key}_100g`]);
    return per100 === undefined ? undefined : (per100 * servingGrams) / 100;
  };

  const kilojoules = perServing('energy');
  const kcal =
    perServing('energy-kcal') ?? (kilojoules === undefined ? undefined : kilojoules * KCAL_PER_KJ);
  const protein = perServing('proteins');
  const carbs = perServing('carbohydrates');
  const fat = perServing('fat');
  if (kcal === undefined && protein === undefined && carbs === undefined && fat === undefined) {
    return fail('noNutrition');
  }

  const nutrients: NutrientValues = {};
  for (const [key, field] of Object.entries(NUTRIENT_FIELDS) as [NutrientKey, string][]) {
    const grams = perServing(field);
    if (grams !== undefined) nutrients[key] = storedNutrient(key, grams);
  }
  const extras: ExtraValues = {};
  for (const [key, field] of Object.entries(EXTRA_FIELDS) as [ExtraKey, string][]) {
    const grams = perServing(field);
    if (grams !== undefined) extras[key] = oneDecimal(grams);
  }

  const packageGrams = packageWeight(product);
  const units = normaliseChoices(
    [
      { unit: SERVING_UNIT, gramsEach: servingGrams },
      ...(packageGrams !== undefined && Math.abs(packageGrams - servingGrams) > SAME_WEIGHT_GRAMS
        ? [{ unit: 'package', gramsEach: packageGrams }]
        : []),
    ],
    servingGrams,
  );

  const name = readString(product.product_name) ?? readString(product.generic_name);
  const brand = readString(readString(product.brands)?.split(',')[0]);
  const ingredientsMarkup = readString(product.ingredients_text_with_allergens);

  return ok({
    draft: productDraft({
      name: productName(name, brand, code, unnamed),
      kcal: Math.round(kcal ?? 0),
      protein: protein ?? 0,
      carbs: carbs ?? 0,
      fat: fat ?? 0,
      nutrients,
      extras,
      basis: { kind: 'grams', grams: servingGrams },
      units,
      chosenUnit: SERVING_UNIT,
      chosenCount: 1,
      product: productInfo(product, code),
    }),
    source: 'barcode',
    ...(ingredientsMarkup === undefined ? {} : { ingredientsMarkup }),
  });
}

function positive(value: number | undefined): number | undefined {
  return value !== undefined && value > 0 ? value : undefined;
}

/** Grams in one of each `product_quantity_unit` read directly. */
const GRAMS_PER_PACKAGE_UNIT: ReadonlyMap<string, number> = new Map([
  ['g', 1],
  ['kg', 1000],
  ['mg', 0.001],
  ['ml', 1],
  ['l', 1000],
]);

/** A package text that is one number and one unit, nothing else ("400 g", "1,5 L"). */
const PLAIN_QUANTITY = /^\d+(?:[.,]\d+)?\s*(?:kg|mg|g|oz|ml|l)$/i;

/** The package weight: the numeric quantity and its unit, else a plain quantity text. */
function packageWeight(product: Record<string, unknown>): number | undefined {
  const amount = readNumber(product.product_quantity);
  const unit = readString(product.product_quantity_unit)?.toLocaleLowerCase('en-US');
  const perUnit = unit === undefined ? undefined : GRAMS_PER_PACKAGE_UNIT.get(unit);
  if (amount !== undefined && perUnit !== undefined) return positive(amount * perUnit);
  const text = readString(product.quantity);
  return text !== undefined && PLAIN_QUANTITY.test(text) ? positive(gramsInText(text)) : undefined;
}

/** Most tags kept per list. */
const TAG_LIMITS = { allergens: 16, traces: 16, labels: 12, categories: 8 } as const;

function productInfo(product: Record<string, unknown>, code: string): ProductInfo {
  const info: ProductInfo = {
    barcode: code,
    allergens: displayTags(product.allergens_tags, TAG_LIMITS.allergens),
    traces: displayTags(product.traces_tags, TAG_LIMITS.traces),
    labels: displayTags(product.labels_tags, TAG_LIMITS.labels),
    categories: displayTags(product.categories_tags, TAG_LIMITS.categories),
  };
  const packageText = readString(product.quantity);
  if (packageText !== undefined) info.package = packageText;
  const ingredients = readString(product.ingredients_text);
  if (ingredients !== undefined) info.ingredients = ingredients;
  const nutri = scoreGrade(product.nutriscore_grade);
  if (nutri !== undefined) info.nutri = nutri;
  const nova = novaGroup(product.nova_group);
  if (nova !== undefined) info.nova = nova;
  const eco = scoreGrade(product.ecoscore_grade);
  if (eco !== undefined) info.eco = eco;
  const imageUrl = readString(product.image_front_url);
  if (imageUrl !== undefined) info.imageUrl = imageUrl;
  return info;
}

/**
 * Tags as the product block shows them: the `xx:` language prefix dropped, hyphens and
 * underscores read as spaces, the first letter upper-cased; empty ones and repeats (ignoring
 * case) left out; at most `limit`.
 */
export function displayTags(tags: unknown, limit: number): string[] {
  if (!Array.isArray(tags)) return [];
  const shown: string[] = [];
  const seen = new Set<string>();
  for (const tag of tags) {
    if (shown.length >= limit) break;
    if (typeof tag !== 'string') continue;
    const words = tag
      .replace(/^[a-z]{2}:/, '')
      .replace(/[-_]/g, ' ')
      .trim();
    const key = words.toLocaleLowerCase('en-US');
    if (words === '' || seen.has(key)) continue;
    seen.add(key);
    shown.push(words.charAt(0).toLocaleUpperCase('en-US') + words.slice(1));
  }
  return shown;
}

/** A Nutri-Score or Eco-Score grade in capitals; none for "unknown" and "not-applicable". */
function scoreGrade(value: unknown): string | undefined {
  const grade = readString(value);
  if (grade === undefined) return undefined;
  const lower = grade.toLocaleLowerCase('en-US');
  return lower === 'unknown' || lower === 'not-applicable'
    ? undefined
    : grade.toLocaleUpperCase('en-US');
}

function novaGroup(value: unknown): NovaGroup | undefined {
  const group = readNumber(value);
  return group === 1 || group === 2 || group === 3 || group === 4 ? group : undefined;
}

// ---- Product photo ----------------------------------------------------------------------------

/**
 * The product's front photo, or undefined: only an https URL on Open Food Facts' image host, a 2xx
 * reply with an image type and at most `MAX_PHOTO_BYTES` bytes. Every other outcome (a CORS
 * refusal, a time-out, a Cancel) is simply no photo.
 */
export async function downloadProductPhoto(
  url: string | undefined,
  deps: RequestDeps,
): Promise<Blob | undefined> {
  if (!isPhotoUrl(url)) return undefined;
  const reply = await fetchWithin(url, {}, deps, OFF_TIMEOUT_MS, readPhoto);
  return reply.ok ? reply.value : undefined;
}

function isPhotoUrl(url: string | undefined): url is string {
  if (url === undefined) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.host === PHOTO_HOST;
  } catch {
    return false;
  }
}

async function readPhoto(response: Response): Promise<Blob | undefined> {
  const type = response.headers.get('content-type')?.trim().toLowerCase() ?? '';
  const declared = readNumber(response.headers.get('content-length') ?? undefined);
  const body = response.body;
  if (
    !isSuccess(response.status) ||
    !type.startsWith('image/') ||
    (declared !== undefined && declared > MAX_PHOTO_BYTES) ||
    body === null
  ) {
    await response.body?.cancel();
    return undefined;
  }
  // Read up to the cap, whatever the declared size said.
  const reader = body.getReader();
  const parts: Uint8Array<ArrayBuffer>[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_PHOTO_BYTES) {
      await reader.cancel();
      return undefined;
    }
    parts.push(value.slice());
  }
  return size === 0 ? undefined : new Blob(parts, { type });
}

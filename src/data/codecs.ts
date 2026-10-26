// Lenient codecs: an unknown stored value in, one of our records (or null when it cannot be read)
// out. Fields we do not know are left out; an unknown choice falls back to the field's default;
// whole and decimal numbers are both fine; list items that cannot be read are dropped while the
// record stays. Only the fields a record cannot do without make it unreadable.

import { dayKeyOf, isDayKey } from '../domain/dates/dayKey';
import {
  MAX_LOCKED_MACROS,
  isActivity,
  isCoachRole,
  isEntrySource,
  isExtraKey,
  isGoalKind,
  isMacroKey,
  isMealKind,
  isNutrientKey,
  isSex,
  type AnalysisDraft,
  type BodyFatReading,
  type CoachMessage,
  type CoachMessageState,
  type DiaryEntry,
  type EntrySource,
  type ExtraValues,
  type Fast,
  type IngredientLine,
  type MacroKey,
  type NovaGroup,
  type NutrientValues,
  type NutritionDraft,
  type ProductInfo,
  type Profile,
  type SavedMeal,
  type SavedTargets,
  type ServingBasis,
  type UnitChoice,
  type WaterLog,
  type WeighIn,
} from '../domain/model';
import type { Codec } from './guard';
import type { PhotoRow } from './schema';
import { isBlobLike } from './values';

// ---- Field readers --------------------------------------------------------------------------------

type Fields = Record<string, unknown>;

/** The fields of a record, or null when the value is not an object. */
function fieldsOf(value: unknown): Fields | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Fields)
    : null;
}

function finite(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function positive(value: unknown): number | undefined {
  const n = finite(value);
  return n !== undefined && n > 0 ? n : undefined;
}

/** A fraction strictly between 0 and 1 (body fat). */
function fraction(value: unknown): number | undefined {
  const n = finite(value);
  return n !== undefined && n > 0 && n < 1 ? n : undefined;
}

// The range a Date can hold; an instant outside it has no calendar day.
const MAX_INSTANT = 8.64e15;

function instant(value: unknown): number | undefined {
  const n = finite(value);
  return n !== undefined && Math.abs(n) <= MAX_INSTANT ? n : undefined;
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/** A string with something other than spaces in it (ids, names of units). */
function filled(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

/** The strings of a list; anything else in it is dropped, and a non-list reads as empty. */
function texts(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

/** Reads every item of a list with `read`, dropping the items it cannot read. */
function listOf<T>(value: unknown, read: (item: unknown) => T | undefined): T[] {
  if (!Array.isArray(value)) return [];
  const out: T[] = [];
  for (const item of value) {
    const got = read(item);
    if (got !== undefined) out.push(got);
  }
  return out;
}

/** The entries of `value` whose key passes `isKey` and whose value is a finite number. */
function amounts<K extends string>(
  value: unknown,
  isKey: (key: unknown) => key is K,
): Partial<Record<K, number>> {
  const fields = fieldsOf(value);
  const out: Partial<Record<K, number>> = {};
  if (!fields) return out;
  for (const [key, amount] of Object.entries(fields)) {
    const n = finite(amount);
    if (isKey(key) && n !== undefined) out[key] = n;
  }
  return out;
}

type Defined<T> = { [K in keyof T]?: Exclude<T[K], undefined> };

/** `fields` without the keys whose value is undefined, so optional fields stay absent. */
function present<T extends Fields>(fields: T): Defined<T> {
  return Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined),
  ) as Defined<T>;
}

// ---- Food ---------------------------------------------------------------------------------------

/** A grams basis only for finite grams above 0; anything else is a number of servings. */
function readBasis(value: unknown): ServingBasis {
  const fields = fieldsOf(value);
  if (fields?.kind === 'grams') {
    const grams = positive(fields.grams);
    if (grams !== undefined) return { kind: 'grams', grams };
  }
  if (fields?.kind === 'servings') {
    return { kind: 'servings', count: positive(fields.count) ?? 1 };
  }
  return { kind: 'servings', count: 1 };
}

const MAX_UNITS = 4;

function readUnit(value: unknown): UnitChoice | undefined {
  const fields = fieldsOf(value);
  const unit = filled(fields?.unit);
  const gramsEach = positive(fields?.gramsEach);
  if (!fields || unit === undefined || gramsEach === undefined) return undefined;
  return { unit, gramsEach, ...present({ count: positive(fields.count) }) };
}

function readLine(value: unknown): IngredientLine | undefined {
  const fields = fieldsOf(value);
  if (!fields) return undefined;
  const name = text(fields.name);
  const kcal = finite(fields.kcal);
  const protein = finite(fields.protein);
  const carbs = finite(fields.carbs);
  const fat = finite(fields.fat);
  if (name === undefined || kcal === undefined) return undefined;
  if (protein === undefined || carbs === undefined || fat === undefined) return undefined;
  const grams = finite(fields.grams);
  return {
    name,
    grams: grams !== undefined && grams >= 0 ? grams : 0,
    kcal: Math.round(kcal),
    protein,
    carbs,
    fat,
    photoIds: texts(fields.photoIds),
    ...present({ emoji: text(fields.emoji) }),
  };
}

function readNova(value: unknown): NovaGroup | undefined {
  return value === 1 || value === 2 || value === 3 || value === 4 ? value : undefined;
}

function readProduct(value: unknown): ProductInfo | undefined {
  const fields = fieldsOf(value);
  const barcode = filled(fields?.barcode);
  if (!fields || barcode === undefined) return undefined;
  return {
    barcode,
    allergens: texts(fields.allergens),
    traces: texts(fields.traces),
    labels: texts(fields.labels),
    categories: texts(fields.categories),
    ...present({
      package: text(fields.package),
      ingredients: text(fields.ingredients),
      nutri: text(fields.nutri),
      nova: readNova(fields.nova),
      eco: text(fields.eco),
      imageUrl: text(fields.imageUrl),
      source: fields.source === 'fdc' ? ('fdc' as const) : undefined,
    }),
  };
}

function readDraftFields(fields: Fields): NutritionDraft | null {
  const name = text(fields.name);
  const kcal = finite(fields.kcal);
  const protein = finite(fields.protein);
  const carbs = finite(fields.carbs);
  const fat = finite(fields.fat);
  if (name === undefined || kcal === undefined) return null;
  if (protein === undefined || carbs === undefined || fat === undefined) return null;
  return {
    name,
    kcal: Math.round(kcal),
    protein,
    carbs,
    fat,
    nutrients: amounts(fields.nutrients, isNutrientKey) satisfies NutrientValues,
    extras: amounts(fields.extras, isExtraKey) satisfies ExtraValues,
    basis: readBasis(fields.basis),
    units: listOf(fields.units, readUnit).slice(0, MAX_UNITS),
    lines: listOf(fields.lines, readLine),
    progressive: fields.progressive === true,
    ...present({
      chosenUnit: filled(fields.chosenUnit),
      chosenCount: positive(fields.chosenCount),
      emoji: text(fields.emoji),
      note: text(fields.note),
      product: readProduct(fields.product),
    }),
  };
}

/** How the numbers were obtained; an unknown source reads as `manual`. */
function readSource(value: unknown): EntrySource {
  return isEntrySource(value) ? value : 'manual';
}

/** The food values of a draft, an entry or a saved meal. */
export const decodeDraft: Codec<NutritionDraft> = (raw) => {
  const fields = fieldsOf(raw);
  return fields ? readDraftFields(fields) : null;
};

/** A diary row. A missing or unknown meal reads as `other`; a bad day key is derived again. */
export const decodeEntry: Codec<DiaryEntry> = (raw) => {
  const fields = fieldsOf(raw);
  if (!fields) return null;
  const draft = readDraftFields(fields);
  const id = filled(fields.id);
  const loggedAt = instant(fields.loggedAt);
  if (!draft || id === undefined || loggedAt === undefined) return null;
  return {
    ...draft,
    id,
    loggedAt,
    dayKey: isDayKey(fields.dayKey) ? fields.dayKey : dayKeyOf(loggedAt),
    meal: isMealKind(fields.meal) ? fields.meal : 'other',
    source: readSource(fields.source),
    photoIds: texts(fields.photoIds),
  };
};

export const decodeSavedMeal: Codec<SavedMeal> = (raw) => {
  const fields = fieldsOf(raw);
  if (!fields) return null;
  const draft = readDraftFields(fields);
  const id = filled(fields.id);
  if (!draft || id === undefined) return null;
  return {
    ...draft,
    id,
    order: finite(fields.order) ?? 0,
    source: readSource(fields.source),
    photoIds: texts(fields.photoIds),
    ...present({ originEntryId: filled(fields.originEntryId) }),
  };
};

export const decodeAnalysisDraft: Codec<AnalysisDraft> = (raw) => {
  const fields = fieldsOf(raw);
  const draft = decodeDraft(fields?.draft);
  if (!fields || !draft) return null;
  return {
    draft,
    photoIds: texts(fields.photoIds),
    createdAt: instant(fields.createdAt) ?? 0,
    fromSavedLabel: fields.fromSavedLabel === true,
    ...present({ source: isEntrySource(fields.source) ? fields.source : undefined }),
  };
};

export const decodePhoto: Codec<PhotoRow> = (raw) => {
  const fields = fieldsOf(raw);
  const id = filled(fields?.id);
  const blob = fields?.blob;
  if (!fields || id === undefined || !isBlobLike(blob)) return null;
  const thumb = isBlobLike(fields.thumb) ? fields.thumb : undefined;
  return {
    id,
    blob,
    width: finite(fields.width) ?? 0,
    height: finite(fields.height) ?? 0,
    bytes: finite(fields.bytes) ?? blob.size + (thumb?.size ?? 0),
    createdAt: instant(fields.createdAt) ?? 0,
    ...present({ thumb }),
  };
};

// ---- Trackers -------------------------------------------------------------------------------------

export const decodeWeighIn: Codec<WeighIn> = (raw) => {
  const fields = fieldsOf(raw);
  const id = filled(fields?.id);
  const at = instant(fields?.at);
  const kg = positive(fields?.kg);
  if (id === undefined || at === undefined || kg === undefined) return null;
  return { id, at, kg };
};

export const decodeBodyFat: Codec<BodyFatReading> = (raw) => {
  const fields = fieldsOf(raw);
  const id = filled(fields?.id);
  const at = instant(fields?.at);
  const share = fraction(fields?.fraction);
  if (id === undefined || at === undefined || share === undefined) return null;
  return { id, at, fraction: share };
};

export const decodeWater: Codec<WaterLog> = (raw) => {
  const fields = fieldsOf(raw);
  const id = filled(fields?.id);
  const at = instant(fields?.at);
  const ml = positive(fields?.ml);
  if (!fields || id === undefined || at === undefined || ml === undefined) return null;
  return { id, at, dayKey: isDayKey(fields.dayKey) ? fields.dayKey : dayKeyOf(at), ml };
};

/**
 * A fast. `end` must be an instant or empty (still running): a damaged end is unreadable rather
 * than a running fast, because a running fast blocks food logging.
 */
export const decodeFast: Codec<Fast> = (raw) => {
  const fields = fieldsOf(raw);
  const id = filled(fields?.id);
  const start = instant(fields?.start);
  const goalMin = positive(fields?.goalMin);
  if (!fields || id === undefined || start === undefined || goalMin === undefined) return null;
  const running = fields.end === null || fields.end === undefined;
  const end = running ? null : instant(fields.end);
  if (end === undefined) return null;
  return { id, start, end, goalMin: Math.round(goalMin) };
};

// ---- Coach ----------------------------------------------------------------------------------------

function readMessageState(value: unknown): CoachMessageState | undefined {
  const fields = fieldsOf(value);
  const kind = text(fields?.kind);
  if (!fields || fields.status !== 'failed' || kind === undefined) return undefined;
  return { status: 'failed', kind, ...present({ details: text(fields.details) }) };
}

/** A Coach message; an unknown role reads as `assistant`. */
export const decodeCoachMessage: Codec<CoachMessage> = (raw) => {
  const fields = fieldsOf(raw);
  const id = filled(fields?.id);
  const body = text(fields?.text);
  const at = instant(fields?.at);
  if (!fields || id === undefined || body === undefined || at === undefined) return null;
  return {
    id,
    role: isCoachRole(fields.role) ? fields.role : 'assistant',
    text: body,
    at,
    ...present({
      thumb: isBlobLike(fields.thumb) ? fields.thumb : undefined,
      state: readMessageState(fields.state),
    }),
  };
};

// ---- Profile --------------------------------------------------------------------------------------

function readSaved(value: unknown): SavedTargets {
  const fields = fieldsOf(value);
  const saved: SavedTargets = {};
  if (!fields) return saved;
  for (const key of ['kcal', 'protein', 'carbs', 'fat'] as const) {
    const n = finite(fields[key]);
    if (n !== undefined && n >= 0) saved[key] = Math.round(n);
  }
  return saved;
}

/** Distinct macro keys, at most `MAX_LOCKED_MACROS`, in their stored order. */
function readLocks(value: unknown): MacroKey[] {
  const keys = Array.isArray(value) ? value.filter(isMacroKey) : [];
  return [...new Set(keys)].slice(0, MAX_LOCKED_MACROS);
}

/**
 * The profile record. Unknown choices read as the wizard's defaults (spec 01 §3.1): sex `male`,
 * activity `moderate`, goal `maintain`. The `id` of the stored row is not part of the record.
 */
export const decodeProfile: Codec<Profile> = (raw) => {
  const fields = fieldsOf(raw);
  const heightCm = positive(fields?.heightCm);
  const weightKg = positive(fields?.weightKg);
  if (!fields || !isDayKey(fields.birthDate)) return null;
  if (heightCm === undefined || weightKg === undefined) return null;
  return {
    sex: isSex(fields.sex) ? fields.sex : 'male',
    birthDate: fields.birthDate,
    heightCm,
    weightKg,
    activity: isActivity(fields.activity) ? fields.activity : 'moderate',
    goal: isGoalKind(fields.goal) ? fields.goal : 'maintain',
    saved: readSaved(fields.saved),
    allergens: texts(fields.allergens),
    caloriesLocked: fields.caloriesLocked === true,
    lockedMacros: readLocks(fields.lockedMacros),
    ...present({
      bodyFat: fraction(fields.bodyFat),
      goalBodyFat: fraction(fields.goalBodyFat),
      weeklyKg: positive(fields.weeklyKg),
      goalWeightKg: positive(fields.goalWeightKg),
    }),
  };
};

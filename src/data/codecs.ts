// Lenient readers for stored rows. A codec keeps everything it can understand and builds a fresh
// record from it: unknown fields are left behind, an unknown or missing enum value becomes the
// field's default, whole and decimal numbers both read, and an optional part that does not parse
// is left out (an unknown nutrient is absent, never 0). Only a row whose identity, time or core
// numbers cannot be read is unreadable: the codec returns null and the guard keeps the raw row.

import { dayKeyOf, isDayKey, type DayKey } from '../domain/dates/dayKey';
import {
  EXTRA_KEYS,
  MAX_LOCKED_MACROS,
  NUTRIENT_KEYS,
  isActivity,
  isCoachRole,
  isEntrySource,
  isGoalKind,
  isMacroKey,
  isMealKind,
  isReminderCardStatus,
  isSex,
  type AnalysisDraft,
  type BodyFatReading,
  type CoachChat,
  type CoachMessage,
  type CoachMessageState,
  type CoachReminderCard,
  type DiaryEntry,
  type EntrySource,
  type Fast,
  type IngredientLine,
  type MacroKey,
  type NovaGroup,
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
import { WEEKDAYS, isTimeOfDay, isWeekday } from '../domain/reminders/custom';
import { UNMEASURED_WALK_MET } from '../domain/walks/mets';
import type { SpeedSource, Walk, WalkHeartRate, WalkScoreParts } from '../domain/walks/model';
import type { PhotoRow } from './schema';

/** Reads a raw stored value into a record, or returns null when it is unreadable. */
export type Codec<T> = (raw: unknown) => T | null;

/** Defaults for enum fields whose stored value is missing or unknown. */
export const ENUM_DEFAULTS = {
  meal: 'other',
  source: 'manual',
  sex: 'male',
  activity: 'moderate',
  goal: 'maintain',
} as const;

/** Goal length of a fast whose stored goal is missing or not a positive number: 16 h. */
export const DEFAULT_FAST_GOAL_MIN = 960;

// ---- Field readers ---------------------------------------------------------------------------

type Fields = Record<string, unknown>;

function fieldsOf(raw: unknown): Fields | null {
  return typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Fields) : null;
}

/** A finite number, int or decimal. */
function finite(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** A finite number that is not negative. */
function amount(value: unknown): number | undefined {
  const n = finite(value);
  return n !== undefined && n >= 0 ? n : undefined;
}

/** A finite number above 0. */
function positive(value: unknown): number | undefined {
  const n = finite(value);
  return n !== undefined && n > 0 ? n : undefined;
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/** A record id: a non-empty string. */
function id(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

/** The strings of a list; anything else in it is skipped, a non-list reads as empty. */
function texts(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

/** The ids of a list (non-empty strings only). */
function ids(value: unknown): string[] {
  return texts(value).filter((item) => item !== '');
}

function flag(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/** Sets `key` on `target` only when `value` is defined, so absent stays absent. */
function put<T extends object, K extends keyof T>(
  target: T,
  key: K,
  value: T[K] | undefined,
): void {
  if (value !== undefined) target[key] = value;
}

/** True for a Blob, from this realm or another (checked by shape, not by class). */
export function isBlobLike(value: unknown): value is Blob {
  if (typeof value !== 'object' || value === null) return false;
  const blob = value as { size?: unknown; type?: unknown; arrayBuffer?: unknown };
  return (
    typeof blob.size === 'number' &&
    typeof blob.type === 'string' &&
    typeof blob.arrayBuffer === 'function'
  );
}

function dayKeyFor(stored: unknown, instant: number): DayKey {
  return isDayKey(stored) ? stored : dayKeyOf(instant);
}

// ---- Food -----------------------------------------------------------------------------------

function decodeValues<K extends string>(
  raw: unknown,
  keys: readonly K[],
): Partial<Record<K, number>> {
  const fields = fieldsOf(raw);
  const values: Partial<Record<K, number>> = {};
  if (!fields) return values;
  for (const key of keys) put(values, key, amount(fields[key]));
  return values;
}

function decodeBasis(raw: unknown): ServingBasis {
  const fields = fieldsOf(raw);
  if (fields?.kind === 'grams') {
    // A weight that is missing, zero or not finite means the weight is unknown.
    const grams = positive(fields.grams);
    if (grams !== undefined) return { kind: 'grams', grams };
  }
  if (fields?.kind === 'servings') {
    const count = positive(fields.count);
    if (count !== undefined) return { kind: 'servings', count };
  }
  return { kind: 'servings', count: 1 };
}

function decodeUnitChoice(raw: unknown): UnitChoice | null {
  const fields = fieldsOf(raw);
  const unit = text(fields?.unit);
  const gramsEach = positive(fields?.gramsEach);
  if (!fields || !unit || gramsEach === undefined) return null;
  const choice: UnitChoice = { unit, gramsEach };
  put(choice, 'count', positive(fields.count));
  return choice;
}

function decodeLine(raw: unknown): IngredientLine | null {
  const fields = fieldsOf(raw);
  const name = text(fields?.name);
  if (!fields || name === undefined) return null;
  const line: IngredientLine = {
    name,
    grams: amount(fields.grams) ?? 0,
    kcal: Math.round(amount(fields.kcal) ?? 0),
    protein: amount(fields.protein) ?? 0,
    carbs: amount(fields.carbs) ?? 0,
    fat: amount(fields.fat) ?? 0,
    photoIds: ids(fields.photoIds),
  };
  put(line, 'emoji', text(fields.emoji));
  return line;
}

function isNovaGroup(value: unknown): value is NovaGroup {
  return value === 1 || value === 2 || value === 3 || value === 4;
}

function decodeProduct(raw: unknown): ProductInfo | undefined {
  const fields = fieldsOf(raw);
  const barcode = id(fields?.barcode);
  if (!fields || !barcode) return undefined;
  const product: ProductInfo = {
    barcode,
    allergens: texts(fields.allergens),
    traces: texts(fields.traces),
    labels: texts(fields.labels),
    categories: texts(fields.categories),
  };
  put(product, 'package', text(fields.package));
  put(product, 'ingredients', text(fields.ingredients));
  put(product, 'markedIngredients', text(fields.markedIngredients));
  put(product, 'nutri', text(fields.nutri));
  put(product, 'nova', isNovaGroup(fields.nova) ? fields.nova : undefined);
  put(product, 'eco', text(fields.eco));
  put(product, 'imageUrl', text(fields.imageUrl));
  put(product, 'source', fields.source === 'fdc' ? 'fdc' : undefined);
  return product;
}

function present<T>(items: readonly (T | null)[]): T[] {
  return items.filter((item): item is T => item !== null);
}

/** The food values shared by entries, saved meals and drafts. Name and core numbers required. */
export const decodeNutritionDraft: Codec<NutritionDraft> = (raw) => {
  const fields = fieldsOf(raw);
  if (!fields) return null;
  const name = text(fields.name);
  const kcal = amount(fields.kcal);
  const protein = amount(fields.protein);
  const carbs = amount(fields.carbs);
  const fat = amount(fields.fat);
  if (
    name === undefined ||
    kcal === undefined ||
    protein === undefined ||
    carbs === undefined ||
    fat === undefined
  ) {
    return null;
  }
  const draft: NutritionDraft = {
    name,
    kcal: Math.round(kcal),
    protein,
    carbs,
    fat,
    nutrients: decodeValues(fields.nutrients, NUTRIENT_KEYS),
    extras: decodeValues(fields.extras, EXTRA_KEYS),
    basis: decodeBasis(fields.basis),
    units: Array.isArray(fields.units) ? present(fields.units.map(decodeUnitChoice)) : [],
    lines: Array.isArray(fields.lines) ? present(fields.lines.map(decodeLine)) : [],
    progressive: flag(fields.progressive, false),
  };
  put(draft, 'chosenUnit', text(fields.chosenUnit));
  put(draft, 'chosenCount', positive(fields.chosenCount));
  put(draft, 'emoji', text(fields.emoji));
  put(draft, 'note', text(fields.note));
  put(draft, 'product', decodeProduct(fields.product));
  return draft;
};

function sourceOf(value: unknown): EntrySource {
  return isEntrySource(value) ? value : ENUM_DEFAULTS.source;
}

export const decodeEntry: Codec<DiaryEntry> = (raw) => {
  const draft = decodeNutritionDraft(raw);
  const fields = fieldsOf(raw);
  const entryId = id(fields?.id);
  const loggedAt = finite(fields?.loggedAt);
  if (!draft || !fields || !entryId || loggedAt === undefined) return null;
  return {
    ...draft,
    id: entryId,
    loggedAt,
    dayKey: dayKeyFor(fields.dayKey, loggedAt),
    meal: isMealKind(fields.meal) ? fields.meal : ENUM_DEFAULTS.meal,
    source: sourceOf(fields.source),
    photoIds: ids(fields.photoIds),
  };
};

export const decodeSavedMeal: Codec<SavedMeal> = (raw) => {
  const draft = decodeNutritionDraft(raw);
  const fields = fieldsOf(raw);
  const mealId = id(fields?.id);
  if (!draft || !fields || !mealId) return null;
  const meal: SavedMeal = {
    ...draft,
    id: mealId,
    order: finite(fields.order) ?? 0,
    source: sourceOf(fields.source),
    photoIds: ids(fields.photoIds),
  };
  put(meal, 'originEntryId', id(fields.originEntryId));
  return meal;
};

export const decodeAnalysisDraft: Codec<AnalysisDraft> = (raw) => {
  const fields = fieldsOf(raw);
  const draft = decodeNutritionDraft(fields?.draft);
  if (!fields || !draft) return null;
  const stored: AnalysisDraft = {
    draft,
    photoIds: ids(fields.photoIds),
    createdAt: finite(fields.createdAt) ?? 0,
    fromSavedLabel: flag(fields.fromSavedLabel, false),
  };
  put(stored, 'source', isEntrySource(fields.source) ? fields.source : undefined);
  return stored;
};

// ---- Profile ----------------------------------------------------------------------------------

function decodeSavedTargets(raw: unknown): SavedTargets {
  const fields = fieldsOf(raw);
  const saved: SavedTargets = {};
  if (!fields) return saved;
  for (const key of ['kcal', 'protein', 'carbs', 'fat'] as const) {
    const value = amount(fields[key]);
    put(saved, key, value === undefined ? undefined : Math.round(value));
  }
  return saved;
}

function decodeLocks(raw: unknown): MacroKey[] {
  const locks: MacroKey[] = [];
  if (!Array.isArray(raw)) return locks;
  for (const item of raw) {
    if (locks.length === MAX_LOCKED_MACROS) break;
    if (isMacroKey(item) && !locks.includes(item)) locks.push(item);
  }
  return locks;
}

/** The profile row's body data; the row key (`id`) is not part of the record. */
export const decodeProfile: Codec<Profile> = (raw) => {
  const fields = fieldsOf(raw);
  const heightCm = positive(fields?.heightCm);
  const weightKg = positive(fields?.weightKg);
  if (!fields || !isDayKey(fields.birthDate) || heightCm === undefined || weightKg === undefined) {
    return null;
  }
  const profile: Profile = {
    sex: isSex(fields.sex) ? fields.sex : ENUM_DEFAULTS.sex,
    birthDate: fields.birthDate,
    heightCm,
    weightKg,
    activity: isActivity(fields.activity) ? fields.activity : ENUM_DEFAULTS.activity,
    goal: isGoalKind(fields.goal) ? fields.goal : ENUM_DEFAULTS.goal,
    saved: decodeSavedTargets(fields.saved),
    allergens: texts(fields.allergens),
    caloriesLocked: flag(fields.caloriesLocked, false),
    lockedMacros: decodeLocks(fields.lockedMacros),
  };
  put(profile, 'bodyFat', positive(fields.bodyFat));
  put(profile, 'goalBodyFat', positive(fields.goalBodyFat));
  put(profile, 'weeklyKg', amount(fields.weeklyKg));
  put(profile, 'goalWeightKg', positive(fields.goalWeightKg));
  return profile;
};

// ---- Trackers ---------------------------------------------------------------------------------

export const decodeWeighIn: Codec<WeighIn> = (raw) => {
  const fields = fieldsOf(raw);
  const rowId = id(fields?.id);
  const at = finite(fields?.at);
  const kg = positive(fields?.kg);
  return rowId && at !== undefined && kg !== undefined ? { id: rowId, at, kg } : null;
};

export const decodeBodyFat: Codec<BodyFatReading> = (raw) => {
  const fields = fieldsOf(raw);
  const rowId = id(fields?.id);
  const at = finite(fields?.at);
  const fraction = positive(fields?.fraction);
  return rowId && at !== undefined && fraction !== undefined ? { id: rowId, at, fraction } : null;
};

export const decodeWater: Codec<WaterLog> = (raw) => {
  const fields = fieldsOf(raw);
  const rowId = id(fields?.id);
  const at = finite(fields?.at);
  const ml = positive(fields?.ml);
  if (!fields || !rowId || at === undefined || ml === undefined) return null;
  return { id: rowId, at, dayKey: dayKeyFor(fields.dayKey, at), ml };
};

export const decodeFast: Codec<Fast> = (raw) => {
  const fields = fieldsOf(raw);
  const rowId = id(fields?.id);
  const start = finite(fields?.start);
  if (!fields || !rowId || start === undefined) return null;
  // Only a missing or null end means "still running": a damaged end must not turn into a
  // running fast, which would block food logging.
  let end: number | null = null;
  if (fields.end !== undefined && fields.end !== null) {
    const stored = finite(fields.end);
    if (stored === undefined || stored < start) return null;
    end = stored;
  }
  return { id: rowId, start, end, goalMin: positive(fields.goalMin) ?? DEFAULT_FAST_GOAL_MIN };
};

// ---- Coach and photos ---------------------------------------------------------------------------

function decodeMessageState(raw: unknown): CoachMessageState | undefined {
  const fields = fieldsOf(raw);
  const kind = text(fields?.kind);
  if (!fields || fields.status !== 'failed' || kind === undefined) return undefined;
  const state: CoachMessageState = { status: 'failed', kind };
  put(state, 'details', text(fields.details));
  return state;
}

/**
 * A reminder card under a reply (P13): words, a time, and either weekdays or a date, with a known
 * status. A card missing any of them is left out rather than guessed, so it can never be added
 * twice or with the wrong timing.
 */
function decodeReminderCard(raw: unknown): CoachReminderCard | null {
  const fields = fieldsOf(raw);
  const words = text(fields?.text)?.trim();
  if (!fields || !words || !isTimeOfDay(fields.time) || !isReminderCardStatus(fields.status)) {
    return null;
  }
  const card: CoachReminderCard = { text: words, time: fields.time, status: fields.status };
  const { days, date } = fields;
  if (Array.isArray(days) && date === undefined) {
    if (days.length === 0 || !days.every(isWeekday)) return null;
    card.days = WEEKDAYS.filter((day) => days.includes(day));
  } else if (isDayKey(date) && days === undefined) {
    card.date = date;
  } else {
    return null;
  }
  put(card, 'reminderId', id(fields.reminderId));
  return card;
}

/** The readable cards of a stored list; absent when none can be read. */
function decodeReminderCards(raw: unknown): CoachReminderCard[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const cards = raw.map(decodeReminderCard).filter((card) => card !== null);
  return cards.length > 0 ? cards : undefined;
}

/**
 * A message with an unknown role is unreadable: there is no safe side to show it on; one without
 * its chat (P16-02) likewise: there is no chat to show it in.
 */
export const decodeCoachMessage: Codec<CoachMessage> = (raw) => {
  const fields = fieldsOf(raw);
  const rowId = id(fields?.id);
  const chatId = id(fields?.chatId);
  const at = finite(fields?.at);
  if (!fields || !rowId || !chatId || at === undefined || !isCoachRole(fields.role)) return null;
  const message: CoachMessage = {
    id: rowId,
    chatId,
    role: fields.role,
    text: text(fields.text) ?? '',
    at,
  };
  put(message, 'thumb', isBlobLike(fields.thumb) ? fields.thumb : undefined);
  put(message, 'state', decodeMessageState(fields.state));
  put(message, 'reminders', decodeReminderCards(fields.reminders));
  return message;
};

/**
 * A Coach chat (P16-02): unreadable only without its id or either time. A title that cannot be
 * read is empty (the screens' "Earlier chat"); it counts as the person's only when marked so.
 */
export const decodeCoachChat: Codec<CoachChat> = (raw) => {
  const fields = fieldsOf(raw);
  const rowId = id(fields?.id);
  const createdAt = finite(fields?.createdAt);
  const updatedAt = finite(fields?.updatedAt);
  if (!fields || !rowId || createdAt === undefined || updatedAt === undefined) return null;
  return {
    id: rowId,
    title: text(fields.title) ?? '',
    titleByPerson: fields.titleByPerson === true,
    createdAt,
    updatedAt,
  };
};

export const decodePhoto: Codec<PhotoRow> = (raw) => {
  const fields = fieldsOf(raw);
  const rowId = id(fields?.id);
  if (!fields || !rowId || !isBlobLike(fields.blob)) return null;
  const photo: PhotoRow = {
    id: rowId,
    blob: fields.blob,
    width: amount(fields.width) ?? 0,
    height: amount(fields.height) ?? 0,
    bytes: amount(fields.bytes) ?? fields.blob.size,
    createdAt: finite(fields.createdAt) ?? 0,
  };
  put(photo, 'thumb', isBlobLike(fields.thumb) ? fields.thumb : undefined);
  return photo;
};

// ---- Walks --------------------------------------------------------------------------------------

const SPEED_SOURCES: readonly SpeedSource[] = ['route', 'steps', 'none'];

/** A number of 0 or more, else null. */
function amountOrNull(value: unknown): number | null {
  return amount(value) ?? null;
}

/** A list of numbers of 0 or more, else null (one bad item makes the list unreadable). */
function amounts(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  const read = value.map(amount);
  return read.every((item) => item !== undefined) ? (read as number[]) : null;
}

function decodeScoreParts(raw: unknown): WalkScoreParts {
  const fields = fieldsOf(raw);
  return {
    brisk: amountOrNull(fields?.brisk),
    duration: amount(fields?.duration) ?? 0,
    intensity: amountOrNull(fields?.intensity),
    pace: amountOrNull(fields?.pace),
  };
}

function decodeHeartRate(raw: unknown): WalkHeartRate | null {
  const fields = fieldsOf(raw);
  const avgBpm = positive(fields?.avgBpm);
  const maxBpm = positive(fields?.maxBpm);
  const maxHr = positive(fields?.maxHr);
  const zoneSeconds = amounts(fields?.zoneSeconds);
  if (avgBpm === undefined || maxBpm === undefined || maxHr === undefined) return null;
  if (zoneSeconds === null || zoneSeconds.length !== 5) return null;
  return { avgBpm, maxBpm, maxHr, zoneSeconds };
}

/**
 * A recorded walk (P15-02). Unreadable only without its id, its start and end (the end not before
 * the start) or its active time; every figure after them reads leniently.
 */
export const decodeWalk: Codec<Walk> = (raw) => {
  const fields = fieldsOf(raw);
  const rowId = id(fields?.id);
  const startedAt = finite(fields?.startedAt);
  const endedAt = finite(fields?.endedAt);
  const activeSeconds = amount(fields?.activeSeconds);
  if (!fields || !rowId || startedAt === undefined || endedAt === undefined) return null;
  if (endedAt < startedAt || activeSeconds === undefined) return null;
  const distanceM = amountOrNull(fields.distanceM);
  const steps = amountOrNull(fields.steps);
  const speedFrom = SPEED_SOURCES.find((source) => source === fields.speedFrom) ?? 'none';
  const score = amount(fields.score);
  const splits = fieldsOf(fields.splits);
  return {
    id: rowId,
    startedAt,
    endedAt,
    activeSeconds,
    distanceM,
    steps,
    speedFrom,
    speedKmh: speedFrom === 'none' ? null : (positive(fields.speedKmh) ?? null),
    cadence: amountOrNull(fields.cadence),
    briskMinutes: amount(fields.briskMinutes) ?? 0,
    briskKnown: flag(fields.briskKnown, steps !== null || distanceM !== null),
    met: positive(fields.met) ?? UNMEASURED_WALK_MET,
    weightKg: amount(fields.weightKg) ?? 0,
    kcal: amount(fields.kcal) ?? 0,
    activeKcal: amount(fields.activeKcal) ?? 0,
    score: score !== undefined && score <= 100 ? score : null,
    parts: decodeScoreParts(fields.parts),
    paceRatio: positive(fields.paceRatio) ?? null,
    splits: { metres: amounts(splits?.metres), steps: amounts(splits?.steps) },
    route: text(fields.route) ?? '',
    heartRate: decodeHeartRate(fields.heartRate),
    writtenToHealth: flag(fields.writtenToHealth, false),
  };
};

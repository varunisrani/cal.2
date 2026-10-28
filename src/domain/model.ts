// The records every layer shares. Types only, plus the closed lists of string values and one
// runtime guard per list: storage codecs and AI reply parsers use the guards before an untrusted
// string becomes one of these unions. Units are canonical everywhere (kcal, grams, mg, mcg, kg,
// cm, ml, body fat as a fraction); instants are epoch milliseconds.

import type { DayKey } from './dates/dayKey';
import type { Weekday } from './reminders/custom';

/** Builds a guard that accepts exactly the members of `list` (case-sensitive, no trimming). */
function guardFor<T extends string>(list: readonly T[]): (value: unknown) => value is T {
  const members = new Set<string>(list);
  return (value: unknown): value is T => typeof value === 'string' && members.has(value);
}

// ---- Closed lists -------------------------------------------------------------------------

export const MEAL_KINDS = ['breakfast', 'lunch', 'dinner', 'snack', 'other'] as const;
/** The diary section an entry belongs to. `other` is never picked automatically. */
export type MealKind = (typeof MEAL_KINDS)[number];
export const isMealKind = guardFor(MEAL_KINDS);

export const ENTRY_SOURCES = ['photo', 'label', 'barcode', 'text', 'manual'] as const;
/** How an entry's numbers were obtained. */
export type EntrySource = (typeof ENTRY_SOURCES)[number];
export const isEntrySource = guardFor(ENTRY_SOURCES);

/**
 * The 23 optional nutrients, grouped by storage unit: grams first, then milligrams, then
 * micrograms (alphabetical inside each group). Units and labels live in `nutrients/catalogue.ts`.
 */
export const NUTRIENT_KEYS = [
  // grams
  'addedSugar',
  'fibre',
  'monounsaturatedFat',
  'omega3',
  'polyunsaturatedFat',
  'saturatedFat',
  'sugar',
  'transFat',
  // milligrams
  'caffeine',
  'calcium',
  'cholesterol',
  'iron',
  'magnesium',
  'potassium',
  'sodium',
  'vitaminC',
  'vitaminE',
  'zinc',
  // micrograms
  'folate',
  'vitaminA',
  'vitaminB12',
  'vitaminD',
  'vitaminK',
] as const;
export type NutrientKey = (typeof NUTRIENT_KEYS)[number];
export const isNutrientKey = guardFor(NUTRIENT_KEYS);

/** The 8 sports compounds an entry may carry, all in grams. */
export const EXTRA_KEYS = [
  'arginine',
  'betaAlanine',
  'betaine',
  'carnitine',
  'citrulline',
  'creatine',
  'hmb',
  'taurine',
] as const;
export type ExtraKey = (typeof EXTRA_KEYS)[number];
export const isExtraKey = guardFor(EXTRA_KEYS);

export const MACRO_KEYS = ['protein', 'carbs', 'fat'] as const;
export type MacroKey = (typeof MACRO_KEYS)[number];
export const isMacroKey = guardFor(MACRO_KEYS);

export const SEXES = ['male', 'female', 'other'] as const;
export type Sex = (typeof SEXES)[number];
export const isSex = guardFor(SEXES);

/** Activity levels, least active first (the formula tables follow this order). */
export const ACTIVITIES = ['sedentary', 'light', 'moderate', 'active', 'hard', 'athlete'] as const;
export type Activity = (typeof ACTIVITIES)[number];
export const isActivity = guardFor(ACTIVITIES);

export const GOAL_KINDS = ['lose', 'maintain', 'gain'] as const;
/** The direction the person wants their weight to move. */
export type GoalKind = (typeof GOAL_KINDS)[number];
export const isGoalKind = guardFor(GOAL_KINDS);

export const COACH_ROLES = ['user', 'assistant'] as const;
export type CoachRole = (typeof COACH_ROLES)[number];
export const isCoachRole = guardFor(COACH_ROLES);

export const REMINDER_CARD_STATUSES = ['proposed', 'added', 'dismissed', 'set'] as const;
/**
 * What the person did with a reminder the Coach proposed: nothing yet, Add, or Dismiss; or the
 * Coach set it itself (P17, D-16.102).
 */
export type ReminderCardStatus = (typeof REMINDER_CARD_STATUSES)[number];
export const isReminderCardStatus = guardFor(REMINDER_CARD_STATUSES);

// ---- Food -----------------------------------------------------------------------------------

/** Optional nutrient amounts. A missing key means unknown, never zero. */
export type NutrientValues = Partial<Record<NutrientKey, number>>;

/** Sports compound amounts in grams. A missing key means unknown, never zero. */
export type ExtraValues = Partial<Record<ExtraKey, number>>;

/** A named non-gram unit (slice, cup, a split recipe's serving) and its weight. */
export interface UnitChoice {
  /** Trimmed, lower-case unit name; never a spelling of grams. */
  unit: string;
  /** Grams in one of this unit (> 0). */
  gramsEach: number;
  /** How many of this unit the stored values describe, when known. */
  count?: number;
}

/**
 * What the stored numbers describe: a known weight, or a number of servings when the weight is
 * unknown. The servings kind is its own case, never a unit that happens to be named "serving"
 * and never a made-up 100 g (R02.1, R02.2). A grams basis always has finite grams above 0; a
 * weight that is missing, zero or not finite becomes the servings kind.
 */
export type ServingBasis = { kind: 'grams'; grams: number } | { kind: 'servings'; count: number };

/** One part of a meal. Parts carry energy and macros only, no optional nutrients. */
export interface IngredientLine {
  name: string;
  /** Weight in grams; 0 when unknown. */
  grams: number;
  /** Whole kcal. */
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  photoIds: readonly string[];
  emoji?: string;
}

export type NovaGroup = 1 | 2 | 3 | 4;

/** Packaged-product details from a barcode lookup (or a label scan tied to a barcode). */
export interface ProductInfo {
  barcode: string;
  /** Package size as the database wrote it, e.g. "500 g". */
  package?: string;
  /** The printed ingredient list. */
  ingredients?: string;
  /**
   * The ingredient list with the allergens Open Food Facts marks wrapped in underscores
   * (`_milk_`), made from its marked-up text at lookup (`markAllergens`); present only when it
   * differs from `ingredients`. The product block shows it in place of `ingredients`.
   */
  markedIngredients?: string;
  allergens: readonly string[];
  /** "May contain" items. */
  traces: readonly string[];
  /** Nutri-Score grade letter. */
  nutri?: string;
  nova?: NovaGroup;
  /** Eco-Score grade letter. */
  eco?: string;
  labels: readonly string[];
  categories: readonly string[];
  imageUrl?: string;
  /** Set only when the product came from FoodData Central rather than Open Food Facts. */
  source?: 'fdc';
}

/**
 * What a food cost (D-16.107): `amount` in the major unit of `currency` (rupees, dollars), at most
 * two decimals, never negative; `currency` an ISO 4217 code ("INR"). A food without a price has
 * none at all, never a price of 0.
 */
export interface Price {
  readonly amount: number;
  readonly currency: string;
}

/**
 * The food values an analysis, lookup or saved meal produces before review. Every value
 * describes the amount in `basis`.
 */
export interface NutritionDraft {
  name: string;
  /** Whole kcal. */
  kcal: number;
  /** Grams, not rounded. */
  protein: number;
  /** Grams, not rounded. */
  carbs: number;
  /** Grams, not rounded. */
  fat: number;
  nutrients: NutrientValues;
  extras: ExtraValues;
  basis: ServingBasis;
  /** At most four non-gram units. */
  units: readonly UnitChoice[];
  /** The unit the person picked when the weight is known; absent means grams. */
  chosenUnit?: string;
  /** How many of `chosenUnit` were picked. */
  chosenCount?: number;
  lines: readonly IngredientLine[];
  emoji?: string;
  note?: string;
  /** The photos show one plate built up in steps. */
  progressive: boolean;
  product?: ProductInfo;
  /** What it cost, as the person typed or said it; not scaled with the amount (D-16.107). */
  price?: Price;
}

/** One logged food row in the diary. */
export interface DiaryEntry extends NutritionDraft {
  id: string;
  loggedAt: number;
  /** Local day of `loggedAt` in the device zone when it was written. */
  dayKey: DayKey;
  meal: MealKind;
  source: EntrySource;
  /** Photo ids in gallery order; the first is the primary photo. */
  photoIds: readonly string[];
}

/** A snapshot copy of an entry with its own id, kept in the person's order (D-16.17). */
export interface SavedMeal extends NutritionDraft {
  id: string;
  /** Position in the saved list, ascending. */
  order: number;
  /** The entry it was copied from, if any; later edits of that entry do not reach the copy. */
  originEntryId?: string;
  source: EntrySource;
  photoIds: readonly string[];
}

/** A finished analysis waiting for review, kept across reloads (D-16.46). */
export interface AnalysisDraft {
  draft: NutritionDraft;
  photoIds: readonly string[];
  source?: EntrySource;
  createdAt: number;
  /** The values came from a label saved earlier for this barcode. */
  fromSavedLabel: boolean;
}

/** Start minutes after local midnight; late snack wraps past midnight. */
export interface MealTimes {
  breakfast: number;
  lunch: number;
  dinner: number;
  lateSnack: number;
}

// ---- Profile and plan -------------------------------------------------------------------------

/** The four daily targets: whole kcal and whole grams. */
export interface Targets {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

/** Targets the person or the AI fixed; a macro with a value here is pinned, else auto. */
export type SavedTargets = Partial<Targets>;

/** At most this many macros may be locked at once. */
export const MAX_LOCKED_MACROS = 2;

/** The one record of body data and goal choice. */
export interface Profile {
  sex: Sex;
  /** Local calendar date, never an instant (R01.15). */
  birthDate: DayKey;
  heightCm: number;
  weightKg: number;
  activity: Activity;
  goal: GoalKind;
  /** Fraction (0.2 = 20 %). */
  bodyFat?: number;
  /** Fraction; shown on Progress only, never used by the formulas. */
  goalBodyFat?: number;
  /** Pace in kg per week for lose and gain. */
  weeklyKg?: number;
  goalWeightKg?: number;
  saved: SavedTargets;
  allergens: readonly string[];
  /** Settings edits keep kcal fixed while the macros rebalance. */
  caloriesLocked: boolean;
  /** Macros Settings edits keep fixed; at most `MAX_LOCKED_MACROS`, checked by `isLockedMacros`. */
  lockedMacros: readonly MacroKey[];
}

/** True for a list of distinct macro keys no longer than `MAX_LOCKED_MACROS`. */
export function isLockedMacros(value: unknown): value is readonly MacroKey[] {
  if (!Array.isArray(value) || value.length > MAX_LOCKED_MACROS) return false;
  return value.every(isMacroKey) && new Set(value).size === value.length;
}

// ---- Trackers ---------------------------------------------------------------------------------

export interface WeighIn {
  id: string;
  at: number;
  kg: number;
}

export interface BodyFatReading {
  id: string;
  at: number;
  /** Fraction (0.2 = 20 %). */
  fraction: number;
}

export interface WaterLog {
  id: string;
  at: number;
  dayKey: DayKey;
  ml: number;
}

export interface Fast {
  id: string;
  start: number;
  /** `null` while the fast is running. */
  end: number | null;
  /** Goal length in minutes (60–10 080). */
  goalMin: number;
}

// ---- Coach ------------------------------------------------------------------------------------

/** Stored on a user message whose turn failed, so the page can offer Retry. */
export interface CoachMessageState {
  status: 'failed';
  /** The AI failure kind (`AiFailure.kind`). */
  kind: string;
  /** Provider text for the Details disclosure, keys already redacted. */
  details?: string;
}

/**
 * A reminder the Coach proposed under its reply (P13, D-16.93): the reminder's fields as the
 * custom reminders service takes them (`days` or `date`), and what the person did with the card.
 */
export interface CoachReminderCard {
  text: string;
  /** Local wall-clock `HH:MM`. */
  time: string;
  /** The weekdays it repeats on, Monday first; or `date`. */
  days?: Weekday[];
  date?: DayKey;
  status: ReminderCardStatus;
  /** The stored reminder's id, once added. */
  reminderId?: string;
}

/**
 * One Coach chat (P16-02, D-16.99). It is stored with its first question; its messages carry its
 * id. Instants are epoch ms.
 */
export interface CoachChat {
  id: string;
  /** The start of the first message, or the person's own. */
  title: string;
  /** A renamed title is never replaced. */
  titleByPerson: boolean;
  createdAt: number;
  /** The newest message's time; the list's order. */
  updatedAt: number;
}

export interface CoachMessage {
  id: string;
  /** The chat it belongs to (P16-02). */
  chatId: string;
  role: CoachRole;
  text: string;
  at: number;
  /** Small thumbnail of an attached photo. */
  thumb?: Blob;
  state?: CoachMessageState;
  /** On a reply: the reminders the Coach proposed in it, in order (P13). */
  reminders?: CoachReminderCard[];
}

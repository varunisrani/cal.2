// Every setting v1 keeps in the `settings` table, one row per key: the value it shows while
// nothing usable is stored, and the reader that turns a stored value into ours. Readers are
// lenient in the way the record codecs are (whole or decimal numbers, unknown list items dropped,
// lists put in their fixed order) and answer undefined only when nothing usable is there. The
// settings repository then shows the default and keeps the stored value aside (P02-02).
//
// Pure: no Dexie here, so screens and services may import the keys and their types.

import { isDayKey, type DayKey } from '../domain/dates/dayKey';
import type { WeekStart } from '../domain/dates/week';
import { isDiarySort, type DiarySort } from '../domain/meals/diary';
import { DEFAULT_MEAL_TIMES, isValidMealTimes, readMealTimes } from '../domain/meals/times';
import type { MealTimes, SavedTargets } from '../domain/model';
import type { PillarKey } from '../domain/nutrients/catalogue';
import {
  DEFAULT_NUTRIENT_GOALS,
  readNutrientGoals,
  type NutrientGoals,
} from '../domain/nutrients/goalDefaults';
import { DEFAULT_PILLARS, readPillars } from '../domain/nutrients/pillars';
import { DEFAULT_GOAL_MIN, readDefaultGoalMin } from '../domain/trackers/fasting';
import {
  isHeightMeasure,
  isWeightMeasure,
  type HeightMeasure,
  type WeightMeasure,
} from '../domain/units/body';
import { isEnergyMeasure, type EnergyMeasure } from '../domain/units/energy';
import {
  QUICK_ADD_DEFAULTS,
  WATER_GOAL_WHEEL,
  decodeQuickAdd,
  isWaterMeasure,
  type QuickAddAmounts,
  type WaterMeasure,
} from '../domain/units/water';

export interface SettingSpec<T> {
  /** What the setting shows while nothing usable is stored. Frozen: copy before changing. */
  readonly default: T;
  /** The stored value in its normal form, or undefined when nothing usable is stored. */
  readonly read: (raw: unknown) => T | undefined;
  /** Belongs to this device only: backups and their content hash leave it out (R06.7). */
  readonly deviceOnly?: true;
}

// ---- Closed lists ---------------------------------------------------------------------------

/** The appearance choices (the same list as `APPEARANCES` in src/ui/theme.ts). */
export const APPEARANCE_VALUES = ['system', 'light', 'dark'] as const;
export type AppearanceValue = (typeof APPEARANCE_VALUES)[number];

/** The six accent presets, D-16.1 (the same list as `ACCENT_IDS` in src/ui/tokens.ts). */
export const ACCENT_VALUES = ['basil', 'saffron', 'lagoon', 'beet', 'ember', 'ink'] as const;
export type AccentValue = (typeof ACCENT_VALUES)[number];

export const WEEK_START_VALUES = ['mon', 'sun'] as const satisfies readonly WeekStart[];

/** The tabs a person may hide, in tab-bar order. Home and Settings always show. */
export const HIDEABLE_TABS = ['progress', 'coach'] as const;
export type HideableTab = (typeof HIDEABLE_TABS)[number];

/** The product block's fields, in the order the block shows them (06 §3.8). */
export const PRODUCT_FIELDS = [
  'barcode',
  'source',
  'package',
  'nutri',
  'nova',
  'eco',
  'allergens',
  'traces',
  'labels',
  'categories',
  'ingredients',
] as const;
export type ProductField = (typeof PRODUCT_FIELDS)[number];

function memberOf<T extends string>(list: readonly T[]) {
  return (value: unknown): value is T =>
    typeof value === 'string' && (list as readonly string[]).includes(value);
}

export const isHideableTab = memberOf(HIDEABLE_TABS);
export const isProductField = memberOf(PRODUCT_FIELDS);

/** A wall-clock time `HH:MM`, 00:00–23:59. */
export type ClockTime = string;

const CLOCK_TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export function isClockTime(value: unknown): value is ClockTime {
  return typeof value === 'string' && CLOCK_TIME.test(value);
}

/** One timed reminder: whether it is on, and when it is due each day. */
export interface Reminder {
  readonly on: boolean;
  readonly at: ClockTime;
}

/** A record whose fields a later task checks (`ai.settings`, `menu.layout`). */
export type OpaqueRecord = Readonly<Record<string, unknown>>;

// ---- Readers ----------------------------------------------------------------------------------

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function plainRecord(value: unknown): OpaqueRecord | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null ? (value as OpaqueRecord) : undefined;
}

function spec<T>(fallback: T, read: (raw: unknown) => T | undefined): SettingSpec<T> {
  return { default: fallback, read };
}

/** A value its guard accepts as it is. */
function guarded<T>(is: (raw: unknown) => raw is T, fallback: T): SettingSpec<T> {
  return spec(fallback, (raw) => (is(raw) ? raw : undefined));
}

/** A list of `order`'s members: unknown items and repeats dropped, put in `order`'s order. */
function subsetOf<T extends string>(order: readonly T[]): SettingSpec<readonly T[]> {
  const none: readonly T[] = Object.freeze([]);
  return spec(none, (raw) =>
    Array.isArray(raw) ? order.filter((item) => (raw as unknown[]).includes(item)) : undefined,
  );
}

/** `read`'s value, or an explicit null for "none"; nothing stored reads as null too. */
function orNone<T>(read: (raw: unknown) => T | undefined): SettingSpec<T | null> {
  return spec<T | null>(null, (raw) => (raw === null ? null : read(raw)));
}

/** Off at `at`. A record with an unusable switch or time keeps the rest (off, default time). */
function reminder(at: ClockTime): SettingSpec<Reminder> {
  return spec<Reminder>(Object.freeze({ on: false, at }), (raw) => {
    const fields = plainRecord(raw);
    if (!fields) return undefined;
    return { on: fields.on === true, at: isClockTime(fields.at) ? fields.at : at };
  });
}

function deviceOnly<T>(setting: SettingSpec<T>): SettingSpec<T> {
  return { ...setting, deviceOnly: true };
}

/** Whole ml inside the goal wheel's range (50–10 000 ml). */
function readWaterGoal(raw: unknown): number | undefined {
  const value = finiteNumber(raw);
  if (value === undefined) return undefined;
  const ml = Math.round(value);
  const { min, max } = WATER_GOAL_WHEEL.ml;
  return ml >= min && ml <= max ? ml : undefined;
}

/**
 * Three amounts the water rules accept (P01-05), smallest first. That reader falls back to the
 * defaults for anything else, so a value is usable only when the reader kept the stored amounts.
 */
function readQuickAdd(raw: unknown): QuickAddAmounts | undefined {
  if (!Array.isArray(raw)) return undefined;
  const stored: readonly unknown[] = raw;
  const amounts = decodeQuickAdd(stored);
  const read: readonly unknown[] = amounts;
  const kept =
    stored.length === read.length &&
    stored.every((item) => read.includes(item)) &&
    read.every((item) => stored.includes(item));
  return kept ? amounts : undefined;
}

/** The plan saved before the first tune-up change: whole, non-negative targets. */
function readSavedPlan(raw: unknown): SavedTargets | undefined {
  const fields = plainRecord(raw);
  if (!fields) return undefined;
  const plan: SavedTargets = {};
  for (const key of ['kcal', 'protein', 'carbs', 'fat'] as const) {
    const value = finiteNumber(fields[key]);
    if (value !== undefined && value >= 0) plan[key] = Math.round(value);
  }
  return plan;
}

function readText(raw: unknown): string | undefined {
  return typeof raw === 'string' && raw !== '' ? raw : undefined;
}

function readDayKey(raw: unknown): DayKey | undefined {
  return isDayKey(raw) ? raw : undefined;
}

// ---- The settings -----------------------------------------------------------------------------

/**
 * Every v1 setting (17-naming §1.3). Reminders follow D-16.41 and D-16.61: every one off, at
 * 08:00, 12:00, 19:00, 20:00 and 14:00. Units start metric until onboarding seeds them from the
 * browser locale (D-16.10).
 */
export const SETTINGS = {
  // Display
  'display.appearance': guarded(memberOf(APPEARANCE_VALUES), 'system'),
  'display.accent': guarded(memberOf(ACCENT_VALUES), 'basil'),
  'display.weekStart': guarded(memberOf(WEEK_START_VALUES), 'mon'),

  // Units
  'units.energy': guarded<EnergyMeasure>(isEnergyMeasure, 'kcal'),
  'units.height': guarded<HeightMeasure>(isHeightMeasure, 'cm'),
  'units.weight': guarded<WeightMeasure>(isWeightMeasure, 'kg'),

  // Logging and Home
  'log.gramsFirst': guarded(isBoolean, false),
  'meals.times': spec<Readonly<MealTimes>>(DEFAULT_MEAL_TIMES, (raw) =>
    isValidMealTimes(raw) ? readMealTimes(raw) : undefined,
  ),
  'home.pillars': spec<readonly PillarKey[]>(DEFAULT_PILLARS, (raw) =>
    Array.isArray(raw) || typeof raw === 'string' ? readPillars(raw) : undefined,
  ),
  'home.sort': guarded<DiarySort>(isDiarySort, 'byMeal'),

  // Tabs, the add menu and the product block
  'tabs.hidden': subsetOf(HIDEABLE_TABS),
  /** null: the default menu. The layout's own reader (P06-01) checks the fields. */
  'menu.layout': orNone(plainRecord),
  'product.show': guarded(isBoolean, true),
  'product.hiddenFields': subsetOf(PRODUCT_FIELDS),

  // Progress
  'progress.countToday': guarded(isBoolean, true),

  // Water
  'water.on': guarded(isBoolean, false),
  'water.goalMl': spec(2_000, readWaterGoal),
  'water.unit': guarded<WaterMeasure>(isWaterMeasure, 'ml'),
  'water.quickAddMl': spec<QuickAddAmounts>(QUICK_ADD_DEFAULTS, readQuickAdd),

  // Fasting
  'fasting.on': guarded(isBoolean, false),
  'fasting.defaultGoalMin': spec(DEFAULT_GOAL_MIN, (raw) =>
    finiteNumber(raw) === undefined ? undefined : readDefaultGoalMin(raw),
  ),

  // Reminders and alerts
  'remind.master': guarded(isBoolean, false),
  'remind.breakfast': reminder('08:00'),
  'remind.lunch': reminder('12:00'),
  'remind.dinner': reminder('19:00'),
  'remind.summary': reminder('20:00'),
  'remind.water': reminder('14:00'),
  'remind.fastGoal': guarded(isBoolean, false),
  /** The alert when a weigh-in reaches the goal weight; silent while `remind.master` is off. */
  'alerts.goalReached': guarded(isBoolean, true),

  // AI (non-secret). null: the defaults. src/ai/settings.ts (P03) checks the fields.
  'ai.settings': orNone(plainRecord),

  // Goals
  'goals.nutrients': spec<NutrientGoals>(DEFAULT_NUTRIENT_GOALS, (raw) =>
    plainRecord(raw) ? readNutrientGoals(raw) : undefined,
  ),
  /** The plan-input key stored after the last rebuild (P01-15 `planInputsKey`). */
  'goals.rebuildBaseline': orNone(readText),
  'tuneUp.on': guarded(isBoolean, true),
  'tuneUp.lastCheckDay': orNone(readDayKey),
  'tuneUp.savedPlan': orNone(readSavedPlan),

  // Onboarding
  'onboarding.done': guarded(isBoolean, false),
  'onboarding.termsAccepted': guarded(isBoolean, false),

  // This device only
  'storage.persistAsked': deviceOnly(guarded(isBoolean, false)),
  'storage.nudgeDone': deviceOnly(guarded(isBoolean, false)),
  /** Epoch ms of the last backup file made on this device. */
  'backup.lastAt': deviceOnly(orNone(finiteNumber)),
} satisfies Record<string, SettingSpec<unknown>>;

type Specs = typeof SETTINGS;

export type SettingKey = keyof Specs;

export type SettingValue<K extends SettingKey> = Specs[K] extends SettingSpec<infer T> ? T : never;

/** Every setting with its value. */
export type Settings = { readonly [K in SettingKey]: SettingValue<K> };

export const SETTING_KEYS = Object.freeze(Object.keys(SETTINGS)) as readonly SettingKey[];

/** The reminders that have a switch and a time. */
export const TIMED_REMINDER_KEYS = [
  'remind.breakfast',
  'remind.lunch',
  'remind.dinner',
  'remind.summary',
  'remind.water',
] as const satisfies readonly SettingKey[];

export function isSettingKey(value: unknown): value is SettingKey {
  return typeof value === 'string' && Object.hasOwn(SETTINGS, value);
}

function specOf<K extends SettingKey>(key: K): SettingSpec<SettingValue<K>> {
  // Each entry's spec is built for its own value type; TypeScript cannot follow that per key.
  return SETTINGS[key] as SettingSpec<SettingValue<K>>;
}

/** The value `key` shows while nothing usable is stored (frozen). */
export function defaultOf<K extends SettingKey>(key: K): SettingValue<K> {
  return specOf(key).default;
}

/** `raw` as the value of `key` in its normal form, or undefined when it cannot be read. */
export function readSetting<K extends SettingKey>(
  key: K,
  raw: unknown,
): SettingValue<K> | undefined {
  return specOf(key).read(raw);
}

/** True for settings that stay on this device (left out of backups). */
export function isDeviceOnly(key: SettingKey): boolean {
  return specOf(key).deviceOnly === true;
}

/** Every setting at its default. */
export function defaultSettings(): Settings {
  return Object.fromEntries(SETTING_KEYS.map((key) => [key, defaultOf(key)])) as Settings;
}

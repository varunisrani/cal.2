// Every v1 setting: its key in the `settings` table (17-naming §1.3), the value it has when nothing
// usable is stored, and a reader that checks a stored value. A reader tidies what it can (unknown
// tab names dropped, quick-add amounts sorted, a fast goal clamped) and answers `undefined` for a
// value it cannot use; the repository then reads the default and keeps the stored value aside
// (`guard.ts`), never overwriting it silently. Domain rules decide wherever the domain has one.
//
// Each row is `{key, value}` with a plain JSON value; `fasting.on` is a bare boolean because the
// fasting repository writes that row inside its own transactions.

import { decodeAiSettings, type AiSettings } from '../ai/settings';
import { isDayKey, type DayKey } from '../domain/dates/dayKey';
import type { WeekStart } from '../domain/dates/week';
import { DEFAULT_DIARY_SORT, isDiarySortMode, type DiarySortMode } from '../domain/meals/diary';
import { DEFAULT_MEAL_TIMES, isValidMealTimes, readMealTimes } from '../domain/meals/times';
import type { MealTimes, SavedTargets } from '../domain/model';
import { isPillarKey, type PillarKey } from '../domain/nutrients/catalogue';
import {
  DEFAULT_GOAL_VALUES,
  decodeGoalValues,
  type GoalValues,
} from '../domain/nutrients/goalDefaults';
import { DEFAULT_PILLARS, decodePillars } from '../domain/nutrients/pillars';
import { DEFAULT_FAST_GOAL_MINUTES, decodeFastGoal } from '../domain/trackers/fasting';
import {
  isHeightDisplayUnit,
  isWeightDisplayUnit,
  type HeightDisplayUnit,
  type WeightDisplayUnit,
} from '../domain/units/body';
import { defaultUnits } from '../domain/units/defaults';
import {
  DEFAULT_ENERGY_UNIT,
  isEnergyDisplayUnit,
  type EnergyDisplayUnit,
} from '../domain/units/energy';
import {
  DEFAULT_QUICK_ADD_ML,
  DEFAULT_WATER_GOAL_ML,
  DEFAULT_WATER_UNIT,
  WATER_GOAL_WHEEL,
  decodeQuickAdd,
  isWaterDisplayUnit,
  type WaterDisplayUnit,
} from '../domain/units/water';

/** What some defaults depend on. */
export interface SettingsEnv {
  /** The BCP 47 tag the unit defaults follow, normally `navigator.language` (D-16.10). */
  readonly locale: string;
}

/** One setting: its default and the reader for a stored value. */
export interface SettingSpec<T> {
  /** A fresh copy of the value used when nothing usable is stored. */
  readonly fallback: (env: SettingsEnv) => T;
  /** The stored value as this setting, tidied, or `undefined` when it cannot be used. */
  readonly read: (stored: unknown) => T | undefined;
}

function setting<T>(
  fallback: (env: SettingsEnv) => T,
  read: (stored: unknown) => T | undefined,
): SettingSpec<T> {
  return { fallback, read };
}

// ---- Value lists ------------------------------------------------------------------------------

/** Appearance choices; the theme runtime (`src/ui/theme.ts`) shows them. */
export const APPEARANCES = ['system', 'light', 'dark'] as const;
export type AppearanceSetting = (typeof APPEARANCES)[number];

/** Accent presets (D-16.1), the ids `src/ui/tokens.ts` styles; Basil first and by default. */
export const ACCENTS = ['basil', 'saffron', 'lagoon', 'beet', 'ember', 'ink'] as const;
export type AccentSetting = (typeof ACCENTS)[number];

export const WEEK_STARTS = ['mon', 'sun'] as const satisfies readonly WeekStart[];

/** Tabs a person may hide, in tab-bar order. Home and Settings always show. */
export const HIDEABLE_TABS = ['progress', 'coach'] as const;
export type HideableTab = (typeof HIDEABLE_TABS)[number];

/** Product details a person may hide, in the order the product block shows them. */
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

/** A reminder with its own time of day (D-16.41). */
export interface ReminderSetting {
  readonly on: boolean;
  /** Local wall-clock time, `HH:MM` in 24 hours. */
  readonly at: string;
}

/** The reminders that carry a time, in the order Settings lists them. */
export const REMINDER_KEYS = [
  'remind.breakfast',
  'remind.lunch',
  'remind.dinner',
  'remind.summary',
  'remind.water',
] as const;

/** A record whose fields another module owns (the add-menu layout). */
export type StoredRecord = Readonly<Record<string, unknown>>;

// ---- Readers ----------------------------------------------------------------------------------

type Fields = Record<string, unknown>;

function isFields(value: unknown): value is Fields {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function oneOf<T extends string>(list: readonly T[]): (stored: unknown) => T | undefined {
  return (stored) => list.find((item) => item === stored);
}

function readFlag(stored: unknown): boolean | undefined {
  return typeof stored === 'boolean' ? stored : undefined;
}

/** The members of `list` that a stored array names, in `list` order; anything else is dropped. */
function subsetOf<T extends string>(list: readonly T[]): (stored: unknown) => T[] | undefined {
  return (stored) =>
    Array.isArray(stored) ? list.filter((item) => stored.includes(item)) : undefined;
}

/** True for `HH:MM` with hours 00–23 and minutes 00–59. */
export function isClockTime(value: unknown): value is string {
  return typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function reminder(at: string): SettingSpec<Readonly<ReminderSetting>> {
  return setting(
    () => ({ on: false, at }),
    (stored) =>
      isFields(stored) && typeof stored.on === 'boolean' && isClockTime(stored.at)
        ? { on: stored.on, at: stored.at }
        : undefined,
  );
}

function readMeals(stored: unknown): Readonly<MealTimes> | undefined {
  return isValidMealTimes(stored) ? readMealTimes(stored) : undefined;
}

// `decodePillars` answers the default four for a list with nothing usable in it, so look first.
function readPillars(stored: unknown): readonly PillarKey[] | undefined {
  if (!Array.isArray(stored)) return undefined;
  const usable = stored.some((name) => typeof name === 'string' && isPillarKey(name.trim()));
  return usable ? decodePillars(stored) : undefined;
}

// `decodeQuickAdd` answers 250/500/750 for anything it cannot use; a stored list is usable when
// the answer holds exactly its amounts (it only sorts them).
function readQuickAdd(stored: unknown): readonly number[] | undefined {
  if (!Array.isArray(stored)) return undefined;
  const amounts = decodeQuickAdd(stored);
  const same = amounts.length === stored.length && amounts.every((ml) => stored.includes(ml));
  return same ? amounts : undefined;
}

function readWaterGoal(stored: unknown): number | undefined {
  const { min, max } = WATER_GOAL_WHEEL.ml;
  return typeof stored === 'number' && Number.isInteger(stored) && stored >= min && stored <= max
    ? stored
    : undefined;
}

function readFastGoal(stored: unknown): number | undefined {
  return typeof stored === 'number' && Number.isFinite(stored) ? decodeFastGoal(stored) : undefined;
}

function readNutrientGoals(stored: unknown): Readonly<GoalValues> | undefined {
  return isFields(stored) ? decodeGoalValues(stored) : undefined;
}

const TARGET_KEYS = ['kcal', 'protein', 'carbs', 'fat'] as const;

/**
 * The tune-up's kept plan: null (nothing kept) or saved targets, where `{}` is a plan whose
 * targets were all automatic. A target that is present but not a number of 0 or more makes the
 * whole plan unusable, so a damaged plan is never half restored.
 */
function readSavedPlan(stored: unknown): Readonly<SavedTargets> | null | undefined {
  if (stored === null) return null;
  if (!isFields(stored)) return undefined;
  const plan: SavedTargets = {};
  for (const key of TARGET_KEYS) {
    const value = stored[key];
    if (value === undefined) continue;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return undefined;
    plan[key] = Math.round(value);
  }
  return plan;
}

function readDayOrNull(stored: unknown): DayKey | null | undefined {
  if (stored === null) return null;
  return isDayKey(stored) ? stored : undefined;
}

function readTextOrNull(stored: unknown): string | null | undefined {
  return stored === null || typeof stored === 'string' ? stored : undefined;
}

function readInstantOrNull(stored: unknown): number | null | undefined {
  if (stored === null) return null;
  return typeof stored === 'number' && Number.isFinite(stored) && stored >= 0 ? stored : undefined;
}

function readRecordOrNull(stored: unknown): StoredRecord | null | undefined {
  if (stored === null) return null;
  return isFields(stored) ? stored : undefined;
}

// The AI layer reads each field on its own and gives a bad one its default (P03-04).
function readAiSettings(stored: unknown): AiSettings | null | undefined {
  if (stored === null) return null;
  return isFields(stored) ? decodeAiSettings(stored) : undefined;
}

const off = () => false;
const on = () => true;
const none = () => null;

// ---- The settings -----------------------------------------------------------------------------

export const SETTING_SPECS = {
  // Display and units
  'display.appearance': setting<AppearanceSetting>(() => 'system', oneOf(APPEARANCES)),
  'display.accent': setting<AccentSetting>(() => 'basil', oneOf(ACCENTS)),
  'display.weekStart': setting<WeekStart>(() => 'mon', oneOf(WEEK_STARTS)),
  'units.energy': setting<EnergyDisplayUnit>(
    () => DEFAULT_ENERGY_UNIT,
    (stored) => (isEnergyDisplayUnit(stored) ? stored : undefined),
  ),
  // Height and weight follow one locale decision, so a first run never mixes them (R01.18).
  'units.height': setting<HeightDisplayUnit>(
    (env) => defaultUnits(env.locale).height,
    (stored) => (isHeightDisplayUnit(stored) ? stored : undefined),
  ),
  'units.weight': setting<WeightDisplayUnit>(
    (env) => defaultUnits(env.locale).weight,
    (stored) => (isWeightDisplayUnit(stored) ? stored : undefined),
  ),

  // Logging and Home
  'log.gramsFirst': setting(off, readFlag),
  'meals.times': setting<Readonly<MealTimes>>(() => ({ ...DEFAULT_MEAL_TIMES }), readMeals),
  'home.sort': setting<DiarySortMode>(
    () => DEFAULT_DIARY_SORT,
    (stored) => (isDiarySortMode(stored) ? stored : undefined),
  ),
  'home.pillars': setting<readonly PillarKey[]>(() => [...DEFAULT_PILLARS], readPillars),

  // Tabs, menus and the product block
  'tabs.hidden': setting<readonly HideableTab[]>(() => [], subsetOf(HIDEABLE_TABS)),
  /** The add-menu layout; null shows the default menu. Its rules live with the menu (P06). */
  'menu.layout': setting<StoredRecord | null>(none, readRecordOrNull),
  'product.show': setting(on, readFlag),
  'product.hiddenFields': setting<readonly ProductField[]>(() => [], subsetOf(PRODUCT_FIELDS)),

  // Progress
  'progress.countToday': setting(on, readFlag),

  // Water and fasting
  'water.on': setting(off, readFlag),
  'water.goalMl': setting(() => DEFAULT_WATER_GOAL_ML, readWaterGoal),
  'water.unit': setting<WaterDisplayUnit>(
    () => DEFAULT_WATER_UNIT,
    (stored) => (isWaterDisplayUnit(stored) ? stored : undefined),
  ),
  'water.quickAddMl': setting<readonly number[]>(() => [...DEFAULT_QUICK_ADD_ML], readQuickAdd),
  'fasting.on': setting(off, readFlag),
  'fasting.defaultGoalMin': setting(() => DEFAULT_FAST_GOAL_MINUTES, readFastGoal),

  // Reminders and alerts: every one off until the person turns it on (D-16.41, D-16.61)
  'remind.master': setting(off, readFlag),
  'remind.breakfast': reminder('08:00'),
  'remind.lunch': reminder('12:00'),
  'remind.dinner': reminder('19:00'),
  'remind.summary': reminder('20:00'),
  'remind.water': reminder('14:00'),
  'remind.fastGoal': setting(off, readFlag),
  'alerts.goalReached': setting(off, readFlag),

  // Goals and the weekly tune-up
  'goals.nutrients': setting<Readonly<GoalValues>>(
    () => ({ ...DEFAULT_GOAL_VALUES }),
    readNutrientGoals,
  ),
  /** The plan-inputs key of the last rebuild (`src/domain/profile/signature.ts`). */
  'goals.rebuildBaseline': setting<string | null>(none, readTextOrNull),
  'tuneUp.on': setting(on, readFlag),
  'tuneUp.lastCheckDay': setting<DayKey | null>(none, readDayOrNull),
  'tuneUp.savedPlan': setting<Readonly<SavedTargets> | null>(none, readSavedPlan),

  // Onboarding
  'onboarding.done': setting(off, readFlag),
  'onboarding.termsAccepted': setting(off, readFlag),

  // AI (never keys: those live in `secrets`); null until the person sets AI up, which reads as
  // the AI layer's defaults (P03-04)
  'ai.settings': setting<AiSettings | null>(none, readAiSettings),

  // Health Connect, on the Android app only (P11-03, D-16.89). Counting the day's active calories
  // in its energy target is on once connected; sending entries and weigh-ins back is off.
  'health.connected': setting(off, readFlag),
  'health.countActiveCalories': setting(on, readFlag),
  'health.writeBack': setting(off, readFlag),
  'health.importWeights': setting(on, readFlag),

  // Storage and backup
  'storage.persistAsked': setting(off, readFlag),
  'storage.nudgeDone': setting(off, readFlag),
  /** When the last backup file was made, epoch ms. */
  'backup.lastAt': setting<number | null>(none, readInstantOrNull),
} as const;

export type SettingKey = keyof typeof SETTING_SPECS;

type ValueOf<S> = S extends SettingSpec<infer T> ? T : never;

/** Every setting with its value. */
export type Settings = { readonly [K in SettingKey]: ValueOf<(typeof SETTING_SPECS)[K]> };

/** One setting's value. */
export type SettingValue<K extends SettingKey> = Settings[K];

export const SETTING_KEYS = Object.keys(SETTING_SPECS) as SettingKey[];

export function isSettingKey(value: unknown): value is SettingKey {
  return typeof value === 'string' && Object.hasOwn(SETTING_SPECS, value);
}

function specOf<K extends SettingKey>(key: K): SettingSpec<SettingValue<K>> {
  // Indexing with a generic key widens to the union of every spec; each key maps to its own.
  return SETTING_SPECS[key] as unknown as SettingSpec<SettingValue<K>>;
}

/** A fresh copy of a setting's default. */
export function settingDefault<K extends SettingKey>(key: K, env: SettingsEnv): SettingValue<K> {
  return specOf(key).fallback(env);
}

/** A stored value as the setting, tidied, or `undefined` when it cannot be used. */
export function readSetting<K extends SettingKey>(
  key: K,
  stored: unknown,
): SettingValue<K> | undefined {
  return specOf(key).read(stored);
}

/** Every setting at its default. */
export function defaultSettings(env: SettingsEnv): Settings {
  const values: Partial<Record<SettingKey, unknown>> = {};
  for (const key of SETTING_KEYS) values[key] = settingDefault(key, env);
  return values as Settings;
}

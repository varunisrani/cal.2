// A day's nutrients as Home shows them: the totals, how a total is written, its line against a
// goal, and the names. The pillars (P07-03) and the all-nutrients sheet (P07-04) share it. Water
// is never one of the food nutrients: its amounts come from the water logs, never from entries
// (R05.4), and only its words and its status line are here.

import { isMacroKey, isNutrientKey, type DiaryEntry, type Targets } from '../../domain/model';
import {
  isPillarKey,
  type CatalogueId,
  type MassUnit,
  type PillarKey,
} from '../../domain/nutrients/catalogue';
import { waterShown, type WaterDisplayUnit } from '../../domain/units/water';
import { formatDecimal } from '../../i18n/format';
import { tx, type TxKey } from './text';

/** Goals of a day without a readable profile: nothing to fill toward. */
export const NO_TARGETS: Targets = { kcal: 0, protein: 0, carbs: 0, fat: 0 };

/** Every unit a Home amount is written in: the nutrients' mass units and the water units. */
export type AmountUnit = MassUnit | WaterDisplayUnit;

/** How much of `id` an entry holds; an optional nutrient it does not know counts 0. */
export function amountIn(entry: DiaryEntry, id: CatalogueId): number {
  if (isMacroKey(id)) return entry[id];
  if (isNutrientKey(id)) return entry.nutrients[id] ?? 0;
  return entry.extras[id] ?? 0;
}

/** The day's total of `id` over its food entries. */
export function dayTotal(entries: readonly DiaryEntry[], id: CatalogueId): number {
  return entries.reduce((sum, entry) => sum + amountIn(entry, id), 0);
}

/** A total as Home shows it: to one decimal (0.1 + 0.2 shows, and compares, as 0.3). */
export function shownTotal(total: number): number {
  return Math.round(total * 10) / 10;
}

/** A shown amount as text: one decimal only when it is not whole ("158.3", "160", "2,500"). */
export function amountText(amount: number): string {
  return formatDecimal(amount, 1);
}

const LEFT: Readonly<Record<AmountUnit, TxKey>> = {
  g: 'home.pillar.left',
  mg: 'home.pillar.leftMg',
  mcg: 'home.pillar.leftMcg',
  ml: 'home.pillar.leftMl',
  flOz: 'home.pillar.leftFlOz',
};

const OVER: Readonly<Record<AmountUnit, TxKey>> = {
  g: 'home.pillar.over',
  mg: 'home.pillar.overMg',
  mcg: 'home.pillar.overMcg',
  ml: 'home.pillar.overMl',
  flOz: 'home.pillar.overFlOz',
};

/**
 * The line under a pillar: "No goal" for a goal of 0, else what is left, how far over, or "Goal
 * reached", in `unit`. Both amounts are compared as shown, so the line agrees with the numbers.
 */
export function statusLine(shown: number, goal: number, unit: AmountUnit): string {
  if (!(goal > 0)) return tx('home.pillar.noGoal');
  if (shown < goal) return tx(LEFT[unit], { amount: amountText(goal - shown) });
  if (shown > goal) return tx(OVER[unit], { amount: amountText(shown - goal) });
  return tx('home.pillar.reached');
}

/** An amount with its unit: "2,300 mg", "8.5 fl oz". */
export function amountWithUnit(amount: number, unit: AmountUnit): string {
  return tx(`home.amount.${unit}`, { amount: amountText(amount) });
}

/** The words for a unit on its own: "g", "fl oz". */
export function unitWord(unit: AmountUnit): string {
  return tx(`home.unit.${unit}`);
}

/** The day's water and its daily goal, both in ml, and the unit a person reads them in. */
export interface WaterDay {
  readonly totalMl: number;
  readonly goalMl: number;
  readonly unit: WaterDisplayUnit;
}

/** The water total and goal as shown: whole ml, or fl oz whole or to one decimal. */
export function shownWater(water: WaterDay): { readonly total: number; readonly goal: number } {
  return {
    total: waterShown(water.totalMl, water.unit),
    goal: waterShown(water.goalMl, water.unit),
  };
}

/** A nutrient's name: every pillar has one, and so do the two fats that never get a goal. */
export function nutrientName(id: CatalogueId): string {
  return isPillarKey(id) ? tx(`home.pillar.${id}`) : tx(`home.nutrients.${id}`);
}

/**
 * The optional nutrients in the reading order of Settings › Nutrient goals: sugars, fibre and
 * fats (the two goal-less fats among them), minerals, vitamins, then caffeine.
 */
const DETAIL_NUTRIENTS = [
  'sugar',
  'addedSugar',
  'fibre',
  'saturatedFat',
  'monounsaturatedFat',
  'polyunsaturatedFat',
  'transFat',
  'cholesterol',
  'omega3',
  'sodium',
  'potassium',
  'calcium',
  'iron',
  'magnesium',
  'zinc',
  'vitaminA',
  'vitaminC',
  'vitaminD',
  'vitaminE',
  'vitaminK',
  'vitaminB12',
  'folate',
  'caffeine',
] as const satisfies readonly CatalogueId[];

/** The sports compounds, after the nutrients. */
const DETAIL_EXTRAS = [
  'creatine',
  'taurine',
  'betaine',
  'hmb',
  'betaAlanine',
  'arginine',
  'carnitine',
  'citrulline',
] as const satisfies readonly CatalogueId[];

/** The sheet's detailed list: the 23 optional nutrients, then the 8 sports compounds (31). */
export const DETAIL_ORDER: readonly CatalogueId[] = [...DETAIL_NUTRIENTS, ...DETAIL_EXTRAS];

/** The picker's list: the macros, then every other nutrient that can be a pillar (32). */
export const PICKER_ORDER: readonly PillarKey[] = [
  'protein',
  'carbs',
  'fat',
  ...DETAIL_ORDER.filter(isPillarKey),
];

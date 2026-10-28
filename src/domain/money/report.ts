// The Spending page's report (D-16.108), fetched with the page: the days of a period as bars, this
// month, the months, by meal and the foods that cost most, in the person's currency. A day, a meal
// or a month without a price is "no price", never 0, and an average divides by the days that had
// one. Prices in another currency are totalled apart, never converted.

import { addDays, splitDayKey, type DayKey } from '../dates/dayKey';
import { MEAL_KINDS, type DiaryEntry, type MealKind } from '../model';
import { cents, Tally, type CurrencyTotal } from './spending';

/** One currency's total in a tally, or null when no food had a price in it. */
function amountIn(tally: Tally, currency: string): number | null {
  return tally.totals(currency).find((total) => total.currency === currency)?.amount ?? null;
}

/** Every currency's total in a tally but `currency`'s, by code. */
function others(tally: Tally, currency: string): CurrencyTotal[] {
  return tally.totals(currency).filter((total) => total.currency !== currency);
}

/** How many days the bars cover. */
export const SPEND_PERIODS = [7, 30] as const;
export type SpendPeriod = (typeof SPEND_PERIODS)[number];

/** The most months the page lists, this one included. */
export const SPEND_MONTHS = 12;
/** The most foods the "cost most" list shows. */
export const TOP_FOODS = 5;

/** One day of the bars, in the person's currency. */
export interface SpendDay {
  readonly day: DayKey;
  /** null: no food that day had a price in the person's currency. */
  readonly amount: number | null;
}

/** One calendar month's total in the person's currency. */
export interface SpendMonth {
  /** `YYYY-MM`. */
  readonly month: string;
  /** null: no price in the person's currency that month. */
  readonly amount: number | null;
}

/** One meal's total over the period, in the person's currency. */
export interface MealSpend {
  readonly meal: MealKind;
  readonly amount: number;
  /** The priced foods it came from. */
  readonly foods: number;
}

/** A food that cost the most over the period, by name. */
export interface FoodSpend {
  /** The name as first met (newest entry first). */
  readonly name: string;
  readonly amount: number;
  /** How many times it was logged with a price. */
  readonly count: number;
}

export interface SpendingReport {
  /** The person's currency, which every figure here is in unless said otherwise. */
  readonly currency: string;
  /** Some entry read has a price, in any currency. */
  readonly anyPrice: boolean;
  /** The period's days, oldest first, ending today. */
  readonly days: readonly SpendDay[];
  /** The period's total; null without a price in the person's currency. */
  readonly periodTotal: number | null;
  /** The period's prices in other currencies, totalled apart. */
  readonly periodOthers: readonly CurrencyTotal[];
  /** This calendar month, up to today. */
  readonly month: {
    readonly total: number | null;
    /** Days with a price in the person's currency. */
    readonly pricedDays: number;
    /** The total over the days with a price; null without any. */
    readonly average: number | null;
    readonly others: readonly CurrencyTotal[];
  };
  /** Newest first: this month back to the first month with a price, at most `SPEND_MONTHS`. */
  readonly months: readonly SpendMonth[];
  /** The period's spend by meal, in `MEAL_KINDS` order; meals without a price left out. */
  readonly meals: readonly MealSpend[];
  /** The period's foods that cost most, at most `TOP_FOODS`. */
  readonly topFoods: readonly FoodSpend[];
}

export interface SpendingInput {
  /** At least every entry from the first day of `spendingWindow(today).first` to today. */
  readonly entries: readonly DiaryEntry[];
  readonly today: DayKey;
  readonly currency: string;
  readonly period: SpendPeriod;
}

/** `YYYY-MM` of a day key. */
function monthOf(day: DayKey): string {
  return day.slice(0, 7);
}

/** The month `back` months before the one of `day`, as `YYYY-MM`. */
function monthsBefore(day: DayKey, back: number): string {
  const { year, month } = splitDayKey(day);
  const index = year * 12 + (month - 1) - back;
  return `${String(Math.floor(index / 12)).padStart(4, '0')}-${String((index % 12) + 1).padStart(2, '0')}`;
}

/** The days the page reads: from the first day of the oldest month it lists, to today. */
export function spendingWindow(today: DayKey): { readonly first: DayKey; readonly last: DayKey } {
  return { first: `${monthsBefore(today, SPEND_MONTHS - 1)}-01`, last: today };
}

/** A name as foods are grouped by: case, accents and spacing ignored. */
function foodKey(name: string): string {
  return name.normalize('NFD').replace(/\p{M}/gu, '').trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Everything the Spending page shows, in the person's currency, others apart. */
export function spendingReport({
  entries,
  today,
  currency,
  period,
}: SpendingInput): SpendingReport {
  const first = addDays(today, -(period - 1));
  const thisMonth = monthOf(today);
  const oldestMonth = monthsBefore(today, SPEND_MONTHS - 1);
  const byDay = new Map<DayKey, number>();
  const byMonth = new Map<string, number>();
  const monthDays = new Set<DayKey>();
  const periodTally = new Tally();
  const monthTally = new Tally();
  const meals = new Map<MealKind, { cents: number; foods: number }>();
  const foods = new Map<string, { name: string; cents: number; count: number }>();
  let anyPrice = false;

  // Newest first, so a food's shown name is the one it was logged under last.
  const sorted = [...entries].sort((a, b) => b.loggedAt - a.loggedAt);
  for (const entry of sorted) {
    const { price, dayKey: day } = entry;
    if (price === undefined || day > today) continue;
    anyPrice = true;
    const month = monthOf(day);
    const inPeriod = day >= first;
    if (inPeriod) periodTally.add(price.currency, price.amount);
    if (month === thisMonth) monthTally.add(price.currency, price.amount);
    if (price.currency !== currency) continue;
    const amount = cents(price.amount);
    if (month >= oldestMonth) byMonth.set(month, (byMonth.get(month) ?? 0) + amount);
    if (month === thisMonth) monthDays.add(day);
    if (!inPeriod) continue;
    byDay.set(day, (byDay.get(day) ?? 0) + amount);
    const meal = meals.get(entry.meal) ?? { cents: 0, foods: 0 };
    meals.set(entry.meal, { cents: meal.cents + amount, foods: meal.foods + 1 });
    const key = foodKey(entry.name);
    const food = foods.get(key) ?? { name: entry.name.trim(), cents: 0, count: 0 };
    foods.set(key, { name: food.name, cents: food.cents + amount, count: food.count + 1 });
  }

  const days: SpendDay[] = [];
  for (let back = period - 1; back >= 0; back -= 1) {
    const day = addDays(today, -back);
    const amount = byDay.get(day);
    days.push({ day, amount: amount === undefined ? null : amount / 100 });
  }

  const pricedMonths = [...byMonth.keys()].sort();
  const months: SpendMonth[] = [];
  const firstMonth = pricedMonths[0];
  if (firstMonth !== undefined) {
    for (let back = 0; back < SPEND_MONTHS; back += 1) {
      const month = monthsBefore(today, back);
      if (month < firstMonth) break;
      const amount = byMonth.get(month);
      months.push({ month, amount: amount === undefined ? null : amount / 100 });
    }
  }

  const monthTotal = amountIn(monthTally, currency);
  return {
    currency,
    anyPrice,
    days,
    periodTotal: amountIn(periodTally, currency),
    periodOthers: others(periodTally, currency),
    month: {
      total: monthTotal,
      pricedDays: monthDays.size,
      average:
        monthTotal === null || monthDays.size === 0
          ? null
          : Math.round((monthTotal * 100) / monthDays.size) / 100,
      others: others(monthTally, currency),
    },
    months,
    meals: MEAL_KINDS.flatMap((meal) => {
      const sum = meals.get(meal);
      return sum ? [{ meal, amount: sum.cents / 100, foods: sum.foods }] : [];
    }),
    topFoods: [...foods.values()]
      .sort(
        (a, b) =>
          b.cents - a.cents ||
          b.count - a.count ||
          (a.name < b.name ? -1 : a.name > b.name ? 1 : 0),
      )
      .slice(0, TOP_FOODS)
      .map(({ name, cents: total, count }) => ({ name, amount: total / 100, count })),
  };
}

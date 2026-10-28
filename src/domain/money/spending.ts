// What food cost, added up (D-16.108): a day's spend for Home and the Coach (the Spending page's
// report is `report.ts`, fetched with its page). Only prices count: a food without one is "no
// price", never 0. Prices in another currency are added apart, never converted. Sums are kept in
// hundredths as whole numbers, so 0.10 + 0.20 is 0.30.

import type { DiaryEntry } from '../model';

/** One currency's total and how many foods it came from. */
export interface CurrencyTotal {
  readonly currency: string;
  readonly amount: number;
  readonly foods: number;
}

/** What a set of foods cost. */
export interface Spend {
  /** The foods looked at. */
  readonly foods: number;
  /** Of them, the ones with a price, in any currency. */
  readonly priced: number;
  /**
   * One total per currency that has a price: the person's own first, then the others by code.
   * Empty when no food has a price.
   */
  readonly totals: readonly CurrencyTotal[];
}

/** Hundredths of an amount, as a whole number. */
export function cents(amount: number): number {
  return Math.round(amount * 100);
}

/** Totals in hundredths per currency, with their food counts. */
export class Tally {
  private readonly sums = new Map<string, { cents: number; foods: number }>();

  add(currency: string, amount: number): void {
    const sum = this.sums.get(currency) ?? { cents: 0, foods: 0 };
    sum.cents += cents(amount);
    sum.foods += 1;
    this.sums.set(currency, sum);
  }

  /** The person's currency first, then the others by code. */
  totals(own: string): CurrencyTotal[] {
    return [...this.sums]
      .sort(([a], [b]) => (a === own ? -1 : b === own ? 1 : a < b ? -1 : a > b ? 1 : 0))
      .map(([currency, sum]) => ({ currency, amount: sum.cents / 100, foods: sum.foods }));
  }
}

/** What `entries` cost, each currency apart, `currency` (the person's) first. */
export function spendOf(entries: readonly DiaryEntry[], currency: string): Spend {
  const tally = new Tally();
  let priced = 0;
  for (const entry of entries) {
    if (entry.price === undefined) continue;
    priced += 1;
    tally.add(entry.price.currency, entry.price.amount);
  }
  return { foods: entries.length, priced, totals: tally.totals(currency) };
}

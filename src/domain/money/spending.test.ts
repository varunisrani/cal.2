import { describe, expect, it } from 'vitest';
import { dayKeyOf, startOfDay, type DayKey } from '../dates/dayKey';
import type { DiaryEntry, MealKind, Price } from '../model';
import { makeEntry } from '../../test/factories';
import { SPEND_MONTHS, spendingReport, spendingWindow, TOP_FOODS } from './report';
import { spendOf } from './spending';

const TODAY = '2026-10-28';

/** An entry on `day` (noon, plus `minute` to order a day's entries), with a price or none. */
function food(
  day: DayKey,
  price?: Price,
  extra: { name?: string; meal?: MealKind; minute?: number } = {},
): DiaryEntry {
  const loggedAt = startOfDay(day) + 12 * 3_600_000 + (extra.minute ?? 0) * 60_000;
  const entry = makeEntry({
    loggedAt,
    dayKey: dayKeyOf(loggedAt),
    name: extra.name ?? 'Thali',
    meal: extra.meal ?? 'lunch',
  });
  return price === undefined ? entry : { ...entry, price };
}

const inr = (amount: number): Price => ({ amount, currency: 'INR' });
const usd = (amount: number): Price => ({ amount, currency: 'USD' });

describe('spendOf (D-16.108)', () => {
  it('adds the prices, counting the foods without one apart, never as 0', () => {
    const spend = spendOf(
      [food(TODAY, inr(120)), food(TODAY), food(TODAY, inr(120)), food(TODAY)],
      'INR',
    );
    expect(spend).toEqual({
      foods: 4,
      priced: 2,
      totals: [{ currency: 'INR', amount: 240, foods: 2 }],
    });
  });

  it('has no totals when no food has a price', () => {
    expect(spendOf([food(TODAY), food(TODAY)], 'INR')).toEqual({ foods: 2, priced: 0, totals: [] });
    expect(spendOf([], 'INR')).toEqual({ foods: 0, priced: 0, totals: [] });
  });

  it('counts a price of 0 as a price', () => {
    expect(spendOf([food(TODAY, inr(0)), food(TODAY)], 'INR')).toEqual({
      foods: 2,
      priced: 1,
      totals: [{ currency: 'INR', amount: 0, foods: 1 }],
    });
  });

  it("adds each currency apart, the person's first, the others by code", () => {
    const entries = [
      food(TODAY, usd(5)),
      food(TODAY, { amount: 3, currency: 'EUR' }),
      food(TODAY, inr(240)),
      food(TODAY, usd(2.5)),
    ];
    expect(spendOf(entries, 'INR').totals).toEqual([
      { currency: 'INR', amount: 240, foods: 1 },
      { currency: 'EUR', amount: 3, foods: 1 },
      { currency: 'USD', amount: 7.5, foods: 2 },
    ]);
    expect(spendOf(entries, 'USD').totals.map((total) => total.currency)).toEqual([
      'USD',
      'EUR',
      'INR',
    ]);
  });

  it('adds in hundredths, so 0.10 and 0.20 make 0.30', () => {
    const spend = spendOf([food(TODAY, usd(0.1)), food(TODAY, usd(0.2))], 'USD');
    expect(spend.totals[0]?.amount).toBe(0.3);
  });
});

describe('spendingWindow', () => {
  it('starts on the first day of the oldest month the page lists', () => {
    expect(spendingWindow(TODAY)).toEqual({ first: '2025-11-01', last: TODAY });
    expect(spendingWindow('2026-01-15')).toEqual({ first: '2025-02-01', last: '2026-01-15' });
    expect(SPEND_MONTHS).toBe(12);
  });
});

describe('spendingReport (D-16.108)', () => {
  const report = (entries: readonly DiaryEntry[], period: 7 | 30 = 7, currency = 'INR') =>
    spendingReport({ entries, today: TODAY, currency, period });

  it('gives every day of the period a slot, a day without prices null, never 0', () => {
    const result = report([
      food('2026-10-28', inr(120)),
      food('2026-10-28', inr(80)),
      food('2026-10-27'),
      food('2026-10-25', inr(0)),
      food('2026-10-20', inr(500)),
    ]);
    expect(result.days).toEqual([
      { day: '2026-10-22', amount: null },
      { day: '2026-10-23', amount: null },
      { day: '2026-10-24', amount: null },
      { day: '2026-10-25', amount: 0 },
      { day: '2026-10-26', amount: null },
      { day: '2026-10-27', amount: null },
      { day: '2026-10-28', amount: 200 },
    ]);
    expect(result.periodTotal).toBe(200);
    expect(report([food(TODAY)]).periodTotal).toBeNull();
  });

  it('covers 30 days when asked', () => {
    const result = report([food('2026-09-29', inr(10)), food('2026-09-28', inr(99))], 30);
    expect(result.days).toHaveLength(30);
    expect(result.days[0]).toEqual({ day: '2026-09-29', amount: 10 });
    expect(result.periodTotal).toBe(10);
  });

  it("totals this month and averages over the days with a price, not the month's days", () => {
    const result = report([
      food('2026-10-02', inr(100)),
      food('2026-10-02', inr(50)),
      food('2026-10-10', inr(150)),
      food('2026-10-11'),
      food('2026-09-30', inr(999)),
    ]);
    expect(result.month).toEqual({ total: 300, pricedDays: 2, average: 150, others: [] });
    expect(report([food('2026-09-30', inr(5)), food(TODAY)]).month).toEqual({
      total: null,
      pricedDays: 0,
      average: null,
      others: [],
    });
  });

  it('rounds the average to hundredths', () => {
    const result = report([
      food('2026-10-01', inr(10)),
      food('2026-10-02', inr(10)),
      food('2026-10-03', inr(0.01)),
    ]);
    expect(result.month.average).toBe(6.67);
  });

  it('lists the months newest first, from the first one with a price, at most 12', () => {
    const result = report([
      food('2026-10-03', inr(100)),
      food('2026-08-15', inr(40)),
      food('2026-08-16', inr(60)),
      food('2026-07-01', inr(5)),
    ]);
    expect(result.months).toEqual([
      { month: '2026-10', amount: 100 },
      { month: '2026-09', amount: null },
      { month: '2026-08', amount: 100 },
      { month: '2026-07', amount: 5 },
    ]);
    const old = report([
      food('2025-01-10', inr(1)),
      food('2025-11-01', inr(2)),
      food(TODAY, inr(3)),
    ]);
    expect(old.months).toHaveLength(SPEND_MONTHS);
    expect(old.months[0]).toEqual({ month: '2026-10', amount: 3 });
    expect(old.months[SPEND_MONTHS - 1]).toEqual({ month: '2025-11', amount: 2 });
    expect(report([food(TODAY)]).months).toEqual([]);
  });

  it('adds the period by meal in meal order, leaving out meals without a price', () => {
    const result = report([
      food(TODAY, inr(60), { meal: 'snack' }),
      food(TODAY, inr(120), { meal: 'lunch' }),
      food(TODAY, inr(30), { meal: 'breakfast' }),
      food(TODAY, inr(40), { meal: 'breakfast' }),
      food(TODAY, undefined, { meal: 'dinner' }),
    ]);
    expect(result.meals).toEqual([
      { meal: 'breakfast', amount: 70, foods: 2 },
      { meal: 'lunch', amount: 120, foods: 1 },
      { meal: 'snack', amount: 60, foods: 1 },
    ]);
  });

  it('lists the foods that cost most by name, ignoring case and spaces, at most five', () => {
    const result = report([
      food('2026-10-27', inr(120), { name: 'Paneer roll' }),
      food(TODAY, inr(120), { name: ' paneer  ROLL ' }),
      food(TODAY, inr(240), { name: 'Thali', minute: 1 }),
      food(TODAY, inr(30), { name: 'Chai' }),
      food(TODAY, inr(30), { name: 'Chai' }),
      food(TODAY, inr(60), { name: 'Samosa' }),
      food(TODAY, inr(10), { name: 'Banana' }),
      food(TODAY, inr(5), { name: 'Mint' }),
      food(TODAY, undefined, { name: 'Water' }),
    ]);
    expect(result.topFoods).toEqual([
      { name: 'paneer  ROLL', amount: 240, count: 2 },
      { name: 'Thali', amount: 240, count: 1 },
      { name: 'Chai', amount: 60, count: 2 },
      { name: 'Samosa', amount: 60, count: 1 },
      { name: 'Banana', amount: 10, count: 1 },
    ]);
    expect(result.topFoods).toHaveLength(TOP_FOODS);
  });

  it("totals other currencies apart and leaves them out of the person's figures", () => {
    const result = report([
      food(TODAY, inr(100)),
      food(TODAY, usd(5)),
      food('2026-10-01', usd(2)),
      food('2026-10-26', { amount: 3, currency: 'EUR' }),
    ]);
    expect(result.days.at(-1)).toEqual({ day: TODAY, amount: 100 });
    expect(result.days.at(-3)).toEqual({ day: '2026-10-26', amount: null });
    expect(result.periodTotal).toBe(100);
    expect(result.periodOthers).toEqual([
      { currency: 'EUR', amount: 3, foods: 1 },
      { currency: 'USD', amount: 5, foods: 1 },
    ]);
    expect(result.month).toEqual({
      total: 100,
      pricedDays: 1,
      average: 100,
      others: [
        { currency: 'EUR', amount: 3, foods: 1 },
        { currency: 'USD', amount: 7, foods: 2 },
      ],
    });
    expect(result.topFoods).toEqual([{ name: 'Thali', amount: 100, count: 1 }]);
  });

  it('says whether any price exists, in any currency', () => {
    expect(report([food(TODAY)]).anyPrice).toBe(false);
    expect(report([food(TODAY, usd(1))]).anyPrice).toBe(true);
  });

  it('ignores entries after today', () => {
    const result = report([food('2026-10-29', inr(50)), food(TODAY, inr(10))]);
    expect(result.periodTotal).toBe(10);
    expect(result.month.total).toBe(10);
  });
});

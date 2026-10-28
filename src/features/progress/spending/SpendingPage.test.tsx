import { act, fireEvent, screen, within } from '@testing-library/react';
import { Dexie } from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import type { DayKey } from '../../../domain/dates/dayKey';
import type { MealKind, Price } from '../../../domain/model';
import { common } from '../../../i18n/en/common';
import { log as logWords } from '../../../i18n/en/log';
import { spending } from '../../../i18n/en/spending';
import { makeEntry } from '../../../test/factories';
import { closeHarnesses, openHarness, until, untilShown } from '../../../test/screenHarness';
import { SpendingPage } from './SpendingPage';

afterEach(closeHarnesses);

const words = spending.spending;
const meals = logWords.log.meal;

/** A food on `day` at noon in New York (the harness's zone). */
function food(day: DayKey, price?: Price, name = 'Thali', meal: MealKind = 'lunch') {
  const loggedAt = Date.parse(`${day}T12:00:00-04:00`);
  const entry = makeEntry({ loggedAt, dayKey: day, name, meal });
  return price === undefined ? entry : { ...entry, price };
}

const inr = (amount: number): Price => ({ amount, currency: 'INR' });
const hooked = (hook: string) => document.querySelector<HTMLElement>(`[data-ui="${hook}"]`);
const textOf = (hook: string) => hooked(hook)?.textContent ?? '';
const rowsOf = (hook: string) =>
  [...document.querySelectorAll(`[data-ui="${hook}.row"]`)].map((row) => row.textContent);

/** The page over a test database holding `entries`, the currency INR; today is Mon 26 Oct 2026. */
async function openSpending(entries = [] as ReturnType<typeof food>[], failing = false) {
  const h = await openHarness({
    hash: '#/progress/spending',
    ...(failing
      ? {
          sources: (real) => ({
            ...real,
            diaryRepo: {
              ...real.diaryRepo,
              between: () => Dexie.Promise.reject(new Error('unreadable')),
            },
          }),
        }
      : {}),
  });
  await h.repos.settingsRepo.set('money.currency', 'INR');
  await h.repos.diaryRepo.addMany(entries);
  h.mount(<SpendingPage />);
  return h;
}

/** A week of priced food: Monday ₹200 over two meals, Saturday ₹200, a dollar snack, older days. */
const WEEK = [
  food('2026-10-26', inr(120), 'Paneer roll', 'lunch'),
  food('2026-10-26', inr(80), 'Chai and toast', 'breakfast'),
  food('2026-10-26', undefined, 'Water', 'lunch'),
  food('2026-10-24', inr(200), 'Thali', 'dinner'),
  food('2026-10-23'),
  food('2026-10-22', { amount: 5, currency: 'USD' }, 'Bagel', 'snack'),
  food('2026-09-28', inr(50), 'Samosa', 'snack'),
  food('2026-09-15', inr(1000), 'Groceries', 'other'),
];

describe('SpendingPage (D-16.108)', () => {
  it('has a back link to Progress and the title', async () => {
    const h = await openSpending([food('2026-10-26', inr(10))]);
    await untilShown('[data-ui="spending.days"]');
    expect(screen.getByRole('heading', { level: 1, name: words.title })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: common.common.tabs.progress }));
    expect(h.router.current().route).toEqual({ kind: 'tab', tab: 'progress', nested: [] });
  });

  it('says how to add a price while no food has one', async () => {
    await openSpending([food('2026-10-26'), food('2026-10-25')]);
    await untilShown('[data-ui="spending.empty"]');
    expect(textOf('spending.empty')).toBe(words.empty);
    expect(hooked('spending.days')).toBeNull();
  });

  it('shows a message when the diary cannot be read', async () => {
    await openSpending([], true);
    await untilShown('[data-ui="spending.error"]');
    expect(textOf('spending.error')).toBe(words.loadFailed);
  });

  it('draws the last 7 days, a day without prices marked as such, never as 0', async () => {
    await openSpending(WEEK);
    await untilShown('[data-ui="spending.days"]');

    expect(textOf('spending.days.total')).toBe('₹400 in all');
    const slots = [...document.querySelectorAll('[data-ui="spending.bars"] [data-day]')];
    expect(slots.map((slot) => slot.getAttribute('data-day'))).toEqual([
      '2026-10-20',
      '2026-10-21',
      '2026-10-22',
      '2026-10-23',
      '2026-10-24',
      '2026-10-25',
      '2026-10-26',
    ]);
    expect(slots.map((slot) => slot.hasAttribute('data-none'))).toEqual([
      true,
      true,
      true,
      true,
      false,
      true,
      false,
    ]);
    const chart = screen.getByRole('figure', { name: words.days.chart });
    const table = within(chart).getByRole('table', { hidden: true });
    expect(
      within(table).getByRole('row', { name: /Oct 24, 2026/, hidden: true }),
    ).toHaveTextContent('₹200');
    expect(
      within(table).getByRole('row', { name: /Oct 23, 2026/, hidden: true }),
    ).toHaveTextContent(words.days.none);
    expect(textOf('spending.days.others')).toBe('Also $5 in other currencies');
  });

  it('gives this month: the total, the days with a price and the average over them', async () => {
    await openSpending(WEEK);
    await untilShown('[data-ui="spending.month"]');
    expect(textOf('spending.month.total')).toBe('₹400');
    expect(textOf('spending.month.days')).toBe('2 days with a price');
    expect(textOf('spending.month.average')).toBe('₹200');
    expect(textOf('spending.month.others')).toBe('Also $5 in other currencies');
  });

  it('lists the months, by meal and the foods that cost most', async () => {
    await openSpending(WEEK);
    await untilShown('[data-ui="spending.months"]');
    expect(rowsOf('spending.months.list')).toEqual(['October 2026₹400', 'September 2026₹1,050']);
    expect(rowsOf('spending.meals.list')).toEqual([
      `${meals.breakfast}₹80`,
      `${meals.lunch}₹120`,
      `${meals.dinner}₹200`,
    ]);
    expect(rowsOf('spending.top.list')).toEqual([
      'Thali1 time₹200',
      'Paneer roll1 time₹120',
      'Chai and toast1 time₹80',
    ]);
  });

  it('switches to the last 30 days, the month figures unchanged', async () => {
    await openSpending(WEEK);
    await untilShown('[data-ui="spending.days"]');
    await act(async () => {
      fireEvent.click(screen.getByRole('radio', { name: words.period.month }));
    });
    await until(() => textOf('spending.days.total') === '₹450 in all');
    expect(document.querySelectorAll('[data-ui="spending.bars"] [data-day]')).toHaveLength(30);
    expect(rowsOf('spending.meals.list')).toContain(`${meals.snack}₹50`);
    expect(textOf('spending.month.total')).toBe('₹400');
  });
});

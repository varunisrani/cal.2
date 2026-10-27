import { fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DataProvider } from '../../data/DataProvider';
import type { ActivityDay } from '../../data/hooks';
import { createHealthRepo } from '../../data/repos/healthRepo';
import type { HeightDisplayUnit } from '../../domain/units/body';
import type { EnergyDisplayUnit } from '../../domain/units/energy';
import { health } from '../../i18n/en/health';
import { FACTORY_NOW } from '../../test/factories';
import { closeHarnesses, openHarness, until } from '../../test/screenHarness';
import { ActivityHistoryCard } from './ActivityHistoryCard';

afterEach(closeHarnesses);

/** jsdom lays nothing out: every element reports a box 404 px wide (a 360 px plot). */
beforeEach(() => {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 404, 212));
});

const words = health.health.progress;
const TODAY = '2026-10-26';

function day(
  key: string,
  steps: number | null,
  activeKcal: number | null,
  more: Partial<Pick<ActivityDay, 'totalKcal' | 'distanceM'>> = {},
): ActivityDay {
  return {
    day: key,
    steps,
    activeKcal,
    totalKcal: null,
    distanceM: null,
    sessions: [],
    syncedAt: FACTORY_NOW,
    ...more,
  };
}

async function openCard(
  days: readonly ActivityDay[],
  unit: EnergyDisplayUnit = 'kcal',
  lengthUnit: HeightDisplayUnit = 'cm',
) {
  const h = await openHarness();
  await h.repos.settingsRepo.set('units.energy', unit);
  await h.repos.settingsRepo.set('units.height', lengthUnit);
  const activityRepo = createHealthRepo(h.db);
  await activityRepo.putDays(days);
  h.mount(
    <DataProvider sources={{ ...h.sources, activityRepo }}>
      <ActivityHistoryCard today={TODAY} />
    </DataProvider>,
  );
  await until(
    () =>
      document.querySelector(
        '[data-ui="progress.activity.steps"], [data-ui="progress.activity.empty"]',
      ) !== null,
  );
  return h;
}

/** The days with a bar in one chart. */
const barDays = (hook: string) =>
  [...document.querySelectorAll(`[data-ui="${hook}"] [data-part="bar"]`)].map((bar) =>
    bar.getAttribute('data-day'),
  );

const section = (name: string) => within(screen.getByRole('region', { name }));

/** The values of one chart's hidden table, oldest first. */
const tableValues = (name: string) =>
  within(screen.getByRole('table', { name }))
    .getAllByRole('cell')
    .map((cell) => cell.textContent);

/** The value-axis labels of one chart, from 0 up. */
const ticks = (hook: string) =>
  [...document.querySelectorAll(`[data-ui="${hook}"] [data-part="tick"]`)].map(
    (tick) => tick.textContent,
  );

const DAYS = [
  day('2026-10-01', 20_000, 900),
  day('2026-10-21', 6_000, 200),
  day('2026-10-23', 9_001, null),
  day('2026-10-25', 0, 301),
  day(TODAY, 3_000, 100),
];

describe('ActivityHistoryCard (P11-04)', () => {
  it('shows the last 7 days of steps and active calories, each with the mean of its days (ACC-M11-3)', async () => {
    await openCard(DAYS);
    expect(screen.getByRole('heading', { level: 2, name: words.title })).toBeVisible();
    expect(barDays('progress.activity.steps')).toEqual(['2026-10-21', '2026-10-23', TODAY]);
    expect(barDays('progress.activity.active')).toEqual(['2026-10-21', '2026-10-25', TODAY]);
    // (6 000 + 9 001 + 3 000) / 3 = 6 000.3; (200 + 301 + 100) / 3 = 200.3.
    expect(section(words.steps).getByText('Avg 6,000')).toBeVisible();
    expect(section(words.active).getByText('Avg 200 kcal')).toBeVisible();
  });

  it('covers 30 days once chosen', async () => {
    await openCard(DAYS);
    fireEvent.click(screen.getByRole('radio', { name: words.month }));
    await until(() => barDays('progress.activity.steps').length === 4);
    expect(barDays('progress.activity.steps')[0]).toBe('2026-10-01');
    expect(section(words.steps).getByText('Avg 9,500')).toBeVisible();
  });

  it('writes active calories in kJ for a kJ user', async () => {
    await openCard([day(TODAY, 1_000, 100)], 'kJ');
    expect(section(words.active).getByText('Avg 418 kJ')).toBeVisible();
  });

  it("adds the period's total burn and distance, each with the mean of its days, in km beside cm (ACC-M11-3)", async () => {
    await openCard([
      day('2026-10-01', 20_000, 900, { totalKcal: 3_100, distanceM: 15_000 }),
      day('2026-10-21', 6_000, 200, { totalKcal: 2_400, distanceM: 5_000 }),
      day('2026-10-23', 9_001, null, { totalKcal: 2_201 }),
      day('2026-10-25', 0, 301, { distanceM: 0 }),
      day(TODAY, 3_000, 100, { totalKcal: 2_600, distanceM: 7_200 }),
    ]);
    const names = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(names).toEqual([words.steps, words.active, words.total, words.distance]);

    expect(barDays('progress.activity.total')).toEqual(['2026-10-21', '2026-10-23', TODAY]);
    // (2 400 + 2 201 + 2 600) / 3 = 2 400.3; a day of 0 m has no bar and is not in the mean.
    expect(section(words.total).getByText('Avg 2,400 kcal')).toBeVisible();
    expect(barDays('progress.activity.distance')).toEqual(['2026-10-21', TODAY]);
    // (5 000 + 7 200) / 2 = 6 100 m: the mean keeps its decimal.
    expect(section(words.distance).getByText('Avg 6.1 km')).toBeVisible();
    expect(tableValues(words.distanceChart)).toEqual(['5.0 km', '7.2 km']);
    // The axis steps are round in km.
    expect(ticks('progress.activity.distance.chart')).toEqual(['0', '2', '4', '6', '8']);

    fireEvent.click(screen.getByRole('radio', { name: words.month }));
    await until(() => barDays('progress.activity.distance').length === 3);
    expect(section(words.distance).getByText('Avg 9.1 km')).toBeVisible();
  });

  it('writes the distance in miles for a person who reads feet and inches', async () => {
    await openCard(
      [
        day('2026-10-24', 1_000, 50, { distanceM: 1_609.344 }),
        day(TODAY, 900, 40, { distanceM: 804.672 }),
      ],
      'kcal',
      'ftIn',
    );
    expect(section(words.distance).getByText('Avg 0.8 mi')).toBeVisible();
    expect(tableValues(words.distanceChart)).toEqual(['1.0 mi', '0.5 mi']);
    // Steps of a fifth of a mile are written with their decimal, not rounded to whole miles.
    expect(ticks('progress.activity.distance.chart')).toEqual([
      '0',
      '0.2',
      '0.4',
      '0.6',
      '0.8',
      '1',
    ]);
  });

  it('writes the total burn in kJ for a kJ user', async () => {
    await openCard([day(TODAY, 1_000, 100, { totalKcal: 2_000 })], 'kJ');
    expect(section(words.total).getByText('Avg 8,368 kJ')).toBeVisible();
    expect(tableValues(words.totalChart)).toEqual(['8,368 kJ']);
  });

  it('leaves out the total burn and the distance when the days shown have none', async () => {
    await openCard([
      day('2026-10-01', 20_000, 900, { totalKcal: 3_100, distanceM: 15_000 }),
      ...DAYS.slice(1),
    ]);
    expect(screen.queryByRole('region', { name: words.total })).toBeNull();
    expect(screen.queryByRole('region', { name: words.distance })).toBeNull();
    expect(document.querySelector('[data-ui="progress.activity.total"]')).toBeNull();
    expect(document.querySelector('[data-ui="progress.activity.distance"]')).toBeNull();

    fireEvent.click(screen.getByRole('radio', { name: words.month }));
    await until(() => document.querySelector('[data-ui="progress.activity.distance"]') !== null);
    expect(section(words.total).getByText('Avg 3,100 kcal')).toBeVisible();
    expect(section(words.distance).getByText('Avg 15.0 km')).toBeVisible();
  });

  it('shows days that have only a total burn, not the empty line', async () => {
    await openCard([day('2026-10-24', null, null, { totalKcal: 2_300 })]);
    expect(screen.queryByText(words.empty)).toBeNull();
    expect(section(words.total).getByText('Avg 2,300 kcal')).toBeVisible();
    expect(screen.queryByRole('region', { name: words.distance })).toBeNull();
  });

  it('shows days that have only a distance, not the empty line', async () => {
    await openCard([day('2026-10-24', 0, null, { distanceM: 3_000 })]);
    expect(screen.queryByText(words.empty)).toBeNull();
    expect(section(words.distance).getByText('Avg 3.0 km')).toBeVisible();
    expect(screen.queryByRole('region', { name: words.total })).toBeNull();
  });

  it('says Health Connect has nothing for the days shown', async () => {
    await openCard([day('2026-10-01', 20_000, 900), day(TODAY, 0, null)]);
    expect(screen.getByText(words.empty)).toBeVisible();
    expect(document.querySelector('[data-part="bar"]')).toBeNull();
  });
});

import { fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DataProvider } from '../../data/DataProvider';
import type { ActivityDay } from '../../data/hooks';
import { createHealthRepo } from '../../data/repos/healthRepo';
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

function day(key: string, steps: number | null, activeKcal: number | null): ActivityDay {
  return {
    day: key,
    steps,
    activeKcal,
    totalKcal: null,
    distanceM: null,
    sessions: [],
    syncedAt: FACTORY_NOW,
  };
}

async function openCard(days: readonly ActivityDay[], unit: EnergyDisplayUnit = 'kcal') {
  const h = await openHarness();
  await h.repos.settingsRepo.set('units.energy', unit);
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

  it('says Health Connect has nothing for the days shown', async () => {
    await openCard([day('2026-10-01', 20_000, 900), day(TODAY, 0, null)]);
    expect(screen.getByText(words.empty)).toBeVisible();
    expect(document.querySelector('[data-part="bar"]')).toBeNull();
  });
});

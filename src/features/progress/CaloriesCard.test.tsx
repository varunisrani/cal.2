import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { formatDay } from '../../i18n/format';
import { progress } from '../../i18n/en/progress';
import { CaloriesCard, type CaloriesCardProps } from './CaloriesCard';

const words = progress.progress.calories;

/** jsdom lays nothing out: every element reports a box 404 px wide (a 360 px plot). */
beforeEach(() => {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 404, 212));
});

const GAPPED: CaloriesCardProps['days'] = [
  { day: '2026-10-22', kcal: 1_800 },
  { day: '2026-10-24', kcal: 2_200 },
];

function renderCard(props: Partial<CaloriesCardProps> = {}) {
  return render(
    <CaloriesCard days={GAPPED} averageKcal={2_000} goalKcal={2_100} unit="kcal" {...props} />,
  );
}

const average = () =>
  document.querySelector('[data-ui="progress.calories.average"]')?.textContent ?? null;
const barDays = () =>
  [...document.querySelectorAll('[data-part="bar"]')].map((bar) => bar.getAttribute('data-day'));

/** The hidden table's rows: date and value as read out. */
function tableRows(): string[][] {
  const table = document.querySelector('[data-ui="progress.calories.chart.table"]');
  if (!(table instanceof HTMLElement)) throw new Error('no chart table');
  return within(table)
    .getAllByRole('row')
    .slice(1)
    .map((row) => [...row.children].map((cell) => cell.textContent ?? ''));
}

describe('CaloriesCard', () => {
  it('shows Avg 2,000 kcal and two bars for 1 800 and 2 200 with a missing day between (R05.17)', () => {
    renderCard();
    expect(screen.getByRole('heading', { level: 2, name: words.title })).toBeInTheDocument();
    expect(average()).toBe('Avg 2,000 kcal');
    expect(barDays()).toEqual(['2026-10-22', '2026-10-24']);
    expect(tableRows()).toEqual([
      [formatDay('2026-10-22', 'medium'), '1,800 kcal'],
      [formatDay('2026-10-24', 'medium'), '2,200 kcal'],
    ]);
  });

  it('draws the calorie goal as the dashed goal line', () => {
    renderCard();
    expect(document.querySelectorAll('[data-part="goal"]')).toHaveLength(1);
    expect(document.body.textContent).toContain('Goal: 2,100 kcal');
  });

  it('draws no goal line without a calorie goal', () => {
    renderCard({ goalKcal: 0 });
    expect(document.querySelector('[data-part="goal"]')).toBeNull();
    expect(barDays()).toHaveLength(2);
  });

  it('shows the average, the bars and the goal in kJ, the mean taken in kcal first', () => {
    renderCard({ unit: 'kJ' });
    expect(average()).toBe('Avg 8,368 kJ');
    expect(tableRows().map(([, value]) => value)).toEqual(['7,531 kJ', '9,205 kJ']);
    expect(document.body.textContent).toContain('Goal: 8,786 kJ');
  });

  it('says no food was logged, with no average and no chart, when no day has energy', () => {
    renderCard({ days: [], averageKcal: null });
    expect(screen.getByText(words.empty)).toBeInTheDocument();
    expect(average()).toBeNull();
    expect(document.querySelector('[data-ui="progress.calories.chart"]')).toBeNull();
  });
});

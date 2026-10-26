import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addDays, type DayKey } from '../../domain/dates/dayKey';
import { charts } from '../../i18n/en/charts';
import { formatDay, formatInt } from '../../i18n/format';
import { BarChart, type BarChartDay, type BarChartProps } from './BarChart';

/** The value labels take 44 px right of the plot. */
const TICK_COLUMN = 44;

/** jsdom lays nothing out: every element reports a box `plotWidth` px wide plus the labels. */
function stubBox(plotWidth: number) {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(0, 0, plotWidth + TICK_COLUMN, 212),
  );
}

beforeEach(() => stubBox(360));

function kcal(value: number): string {
  return `${formatInt(value)} kcal`;
}

/** Consecutive days from `first` with the given values. */
function run(first: DayKey, values: readonly number[]): BarChartDay[] {
  return values.map((value, index) => ({ day: addDays(first, index), value }));
}

const WEEK = run('2026-04-01', [1800, 2100, 1950, 2300, 1700, 2000, 2250]);

function renderChart(props: Partial<BarChartProps> = {}) {
  const view = render(
    <BarChart
      days={WEEK}
      goal={2000}
      label="Calories chart"
      valueLabel="Calories"
      formatValue={kcal}
      data-ui="calories.chart"
      {...props}
    />,
  );
  const plot = document.querySelector<HTMLElement>('[data-part="plot"]');
  if (!plot) throw new Error('plot not drawn');
  return { ...view, plot };
}

function bars(): Array<{ day: string; x: number; width: number; dimmed: boolean }> {
  return [...document.querySelectorAll('[data-part="bar"]')].map((bar) => ({
    day: bar.getAttribute('data-day') ?? '',
    x: Number(bar.getAttribute('data-x')),
    width: Number(bar.getAttribute('data-width')),
    dimmed: bar.hasAttribute('data-dimmed'),
  }));
}

function centreOf(bar: { x: number; width: number } | undefined): number {
  if (!bar) throw new Error('no such bar');
  return bar.x + bar.width / 2;
}

function tap(plot: HTMLElement, x: number, y = 100) {
  fireEvent.pointerDown(plot, { pointerId: 1, button: 0, clientX: x, clientY: y });
  fireEvent.pointerUp(plot, { pointerId: 1, button: 0, clientX: x, clientY: y });
}

function tooltip(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-part="tooltip"]');
}

describe('BarChart', () => {
  it('fits a full year of bars inside a 360 px plot and inspects the last day (ACC-G10-1, R05.15)', () => {
    const year = run(
      '2025-10-27',
      Array.from({ length: 365 }, (_, index) => 1500 + (index % 7) * 100),
    );
    const { plot } = renderChart({ days: year });
    const drawn = bars();
    expect(drawn).toHaveLength(365);
    for (const bar of drawn) {
      expect(bar.x).toBeGreaterThanOrEqual(0);
      expect(bar.x + bar.width).toBeLessThanOrEqual(360 + 1e-6);
    }

    // A press at the plot's right edge reaches the newest day.
    tap(plot, 360);
    const last = year[364];
    expect(tooltip()).toHaveTextContent(formatDay(last?.day ?? '', 'medium'));
    expect(tooltip()).toHaveTextContent(kcal(last?.value ?? 0));
    // The 120 px tooltip stays inside the plot over the last bar.
    expect(tooltip()?.style.left).toBe('240px');
  });

  it('draws with the theme through its classes, with no colour of its own', () => {
    renderChart();
    expect(document.querySelectorAll('svg [fill], svg [stroke]')).toHaveLength(0);
    expect(document.querySelector('svg')?.outerHTML).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(/i);
  });

  it('keeps each bar at most 60 px wide, centred in a wide plot', () => {
    stubBox(556);
    renderChart();
    const drawn = bars();
    expect(drawn.map((bar) => bar.width)).toEqual(Array(7).fill(60));
    // 7 × 60 + 6 × 4 = 444 px of 556: 56 px on each side.
    expect(drawn[0]?.x).toBe(56);
    expect(centreOf(drawn[1]) - centreOf(drawn[0])).toBe(64);
  });

  it('thins the dates to 40 px each and always labels the last day', () => {
    const month = run(
      '2026-03-01',
      Array.from({ length: 30 }, () => 2000),
    );
    renderChart({ days: month });
    const dates = [...document.querySelectorAll('[data-part="date"]')];
    expect(dates).toHaveLength(8);
    expect(dates[dates.length - 1]?.getAttribute('data-day')).toBe('2026-03-30');
    expect(dates[dates.length - 1]).toHaveTextContent(formatDay('2026-03-30', 'short'));
    const xs = dates.map((date) => Number(date.getAttribute('x')));
    for (let index = 1; index < xs.length; index++) {
      expect((xs[index] ?? 0) - (xs[index - 1] ?? 0)).toBeGreaterThanOrEqual(40);
    }
  });

  it('labels every day of a week', () => {
    renderChart();
    expect(document.querySelectorAll('[data-part="date"]')).toHaveLength(7);
  });

  it('pins a tooltip on a tap and clears it on a second tap', () => {
    const { plot } = renderChart();
    const third = centreOf(bars()[2]);
    tap(plot, third);
    expect(tooltip()).toHaveTextContent(formatDay('2026-04-03', 'medium'));
    expect(tooltip()).toHaveTextContent('1,950 kcal');
    expect(tooltip()).toHaveAttribute('data-ui', 'calories.chart.tooltip');
    expect(bars().map((bar) => bar.dimmed)).toEqual([true, true, false, true, true, true, true]);

    tap(plot, third + 2);
    expect(tooltip()).toBeNull();
    expect(bars().some((bar) => bar.dimmed)).toBe(false);
  });

  it('moves the pin to another bar tapped', () => {
    const { plot } = renderChart();
    tap(plot, centreOf(bars()[2]));
    tap(plot, centreOf(bars()[5]));
    expect(tooltip()).toHaveTextContent(formatDay('2026-04-06', 'medium'));
  });

  it('clears a pinned tooltip on a tap anywhere outside the chart', () => {
    render(<button type="button">Elsewhere</button>);
    const { plot } = renderChart();
    tap(plot, centreOf(bars()[1]));
    expect(tooltip()).not.toBeNull();

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Elsewhere' }));
    expect(tooltip()).toBeNull();
  });

  it('leaves a pinned tooltip alone during a vertical drag (R05.16)', () => {
    const { plot } = renderChart();
    const second = centreOf(bars()[1]);
    tap(plot, second);

    fireEvent.pointerDown(plot, { pointerId: 2, button: 0, clientX: second, clientY: 40 });
    fireEvent.pointerMove(plot, { pointerId: 2, clientX: second + 3, clientY: 120 });
    fireEvent.pointerMove(plot, { pointerId: 2, clientX: second + 200, clientY: 130 });
    expect(tooltip()).toHaveTextContent(formatDay('2026-04-02', 'medium'));
    // The page takes over the scroll.
    fireEvent.pointerCancel(plot, { pointerId: 2 });
    expect(tooltip()).toHaveTextContent(formatDay('2026-04-02', 'medium'));
  });

  it('scrubs across the bars on a sideways drag and clears on release (R05.16)', () => {
    const { plot } = renderChart();
    fireEvent.pointerDown(plot, { pointerId: 1, button: 0, clientX: 10, clientY: 90 });
    fireEvent.pointerMove(plot, { pointerId: 1, clientX: 30, clientY: 92 });
    expect(tooltip()).toHaveTextContent(formatDay('2026-04-01', 'medium'));
    fireEvent.pointerMove(plot, { pointerId: 1, clientX: 500, clientY: 95 });
    expect(tooltip()).toHaveTextContent(formatDay('2026-04-07', 'medium'));
    fireEvent.pointerUp(plot, { pointerId: 1, button: 0, clientX: 500, clientY: 95 });
    expect(tooltip()).toBeNull();
  });

  it('draws no bar for a missing day or a day without food (R05.17)', () => {
    renderChart({
      days: [
        { day: '2026-04-01', value: 1800 },
        { day: '2026-04-03', value: 2200 },
        { day: '2026-04-04', value: 0 },
      ],
    });
    expect(bars().map((bar) => bar.day)).toEqual(['2026-04-01', '2026-04-03']);
    const table = screen.getByRole('table', { name: 'Calories chart', hidden: true });
    expect(within(table).getAllByRole('row', { hidden: true })).toHaveLength(3);
  });

  it('draws the days in date order whatever order they come in', () => {
    renderChart({ days: [...WEEK].reverse() });
    expect(bars().map((bar) => bar.day)).toEqual(WEEK.map((entry) => entry.day));
  });

  it('draws the goal as a dashed line and runs the axis to a round tick above it', () => {
    renderChart({ goal: 2500 });
    expect(document.querySelectorAll('[data-part="goal"]')).toHaveLength(1);
    const ticks = [...document.querySelectorAll('[data-part="tick"]')];
    expect(ticks.map((tick) => tick.textContent)).toEqual([
      '0',
      '500',
      '1,000',
      '1,500',
      '2,000',
      '2,500',
    ]);
    expect(screen.getByText('Goal: 2,500 kcal')).toBeInTheDocument();
  });

  it('draws no goal line without a goal', () => {
    renderChart({ goal: 0 });
    expect(document.querySelectorAll('[data-part="goal"]')).toHaveLength(0);
  });

  it('drops a pinned tooltip when the days change', () => {
    const { plot, rerender } = renderChart();
    tap(plot, centreOf(bars()[3]));
    expect(tooltip()).not.toBeNull();
    rerender(
      <BarChart
        days={run('2026-03-25', [1900, 2000, 2100, 2200, 2300, 2400, 2500])}
        goal={2000}
        label="Calories chart"
        formatValue={kcal}
      />,
    );
    expect(tooltip()).toBeNull();
  });

  it('lists every day and its value in a hidden table', () => {
    renderChart();
    expect(screen.getByRole('figure', { name: 'Calories chart' })).toBeInTheDocument();
    const table = screen.getByRole('table', { name: 'Calories chart', hidden: true });
    expect(table).toHaveAttribute('data-ui', 'calories.chart.table');
    const rows = within(table).getAllByRole('row', { hidden: true });
    expect(rows).toHaveLength(8);
    expect(rows[0]).toHaveTextContent(`${charts.charts.date}Calories`);
    expect(rows[4]).toHaveTextContent(`${formatDay('2026-04-04', 'medium')}2,300 kcal`);
  });
});

import { fireEvent, render, screen, within } from '@testing-library/react';
import { Profiler } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addDays, startOfDay, type DayKey } from '../../domain/dates/dayKey';
import type { SeriesPoint } from '../../domain/progress/chartMath';
import { charts } from '../../i18n/en/charts';
import { formatDay, formatDecimal } from '../../i18n/format';
import { LineChart, type LineChartProps } from './LineChart';

const HOUR = 3_600_000;

/** The chart's box: a 360 px plot and the 44 px column of value labels. */
const FRAME_WIDTH = 404;

beforeEach(() => {
  // jsdom lays nothing out: every element reports the chart's box, starting at the left edge.
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(0, 0, FRAME_WIDTH, 212),
  );
});

function kg(value: number): string {
  return `${formatDecimal(value, 1)} kg`;
}

/** Morning weigh-ins, one a day from `first`. */
function weighIns(first: DayKey, values: readonly number[]): SeriesPoint[] {
  return values.map((value, index) => ({
    at: startOfDay(addDays(first, index)) + 8 * HOUR,
    value,
  }));
}

// Five days on a 360 px plot inset 8 px each side: the points sit at x = 8, 94, 180, 266, 352.
const FIVE_DAYS = weighIns('2026-04-01', [70.4, 70.1, 69.8, 70.0, 69.5]);

function renderChart(props: Partial<LineChartProps> = {}) {
  const view = render(
    <LineChart
      points={FIVE_DAYS}
      goal={68}
      label="Weight chart"
      valueLabel="Weight"
      formatValue={kg}
      data-ui="weight.chart"
      {...props}
    />,
  );
  const plot = document.querySelector<HTMLElement>('[data-part="plot"]');
  if (!plot) throw new Error('plot not drawn');
  return { ...view, plot };
}

/** Presses at `from` and moves through `path`; returns a function that releases. */
function press(plot: HTMLElement, from: [number, number], ...path: Array<[number, number]>) {
  fireEvent.pointerDown(plot, { pointerId: 1, button: 0, clientX: from[0], clientY: from[1] });
  for (const [x, y] of path) fireEvent.pointerMove(plot, { pointerId: 1, clientX: x, clientY: y });
  const [lastX, lastY] = path[path.length - 1] ?? from;
  return () =>
    fireEvent.pointerUp(plot, { pointerId: 1, button: 0, clientX: lastX, clientY: lastY });
}

function tooltip(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-part="tooltip"]');
}

function count(part: string): number {
  return document.querySelectorAll(`[data-part="${part}"]`).length;
}

describe('LineChart', () => {
  it('draws the goal line and shows a tooltip on the nearest point while pressed and dragged (ACC-G3-1)', () => {
    const { plot } = renderChart();
    expect(count('goal')).toBe(1);
    expect(tooltip()).toBeNull();

    const release = press(plot, [100, 60], [130, 62]);
    const shown = tooltip();
    expect(shown).not.toBeNull();
    expect(shown).toHaveAttribute('data-ui', 'weight.chart.tooltip');
    expect(within(shown as HTMLElement).getByText(formatDay('2026-04-02', 'medium'))).toBeVisible();
    expect(within(shown as HTMLElement).getByText('70.1 kg')).toBeVisible();
    expect(count('cursor')).toBe(1);
    expect(count('marker')).toBe(1);

    fireEvent.pointerMove(plot, { pointerId: 1, clientX: 300, clientY: 64 });
    expect(tooltip()).toHaveTextContent(formatDay('2026-04-04', 'medium'));
    expect(tooltip()).toHaveTextContent('70 kg');

    release();
    expect(tooltip()).toBeNull();
    expect(count('cursor')).toBe(0);
  });

  it('does not scrub on a vertical drag (R05.16)', () => {
    const { plot } = renderChart();
    const release = press(plot, [100, 60], [104, 100], [300, 104]);
    expect(tooltip()).toBeNull();
    release();
    expect(tooltip()).toBeNull();
  });

  it('does not scrub on a diagonal drag that is not clearly sideways (R05.16)', () => {
    const { plot } = renderChart();
    // 20 px across and 14 down: not over 1.5 × the vertical travel.
    press(plot, [100, 60], [120, 74], [300, 80]);
    expect(tooltip()).toBeNull();
  });

  it('shows nothing for a press that does not move', () => {
    const { plot } = renderChart();
    press(plot, [180, 60])();
    expect(tooltip()).toBeNull();
  });

  it('renders again only when the nearest point changes (R05.16)', () => {
    const onRender = vi.fn();
    render(
      <Profiler id="chart" onRender={onRender}>
        <LineChart points={FIVE_DAYS} label="Weight chart" formatValue={kg} />
      </Profiler>,
    );
    const plot = document.querySelector<HTMLElement>('[data-part="plot"]');
    if (!plot) throw new Error('plot not drawn');

    press(plot, [100, 60], [110, 60]);
    expect(tooltip()).toHaveTextContent('70.1 kg');
    const afterFirst = onRender.mock.calls.length;

    // Still nearest to the point at x = 94 (the next one is at 180).
    for (const x of [112, 120, 128, 136, 104]) {
      fireEvent.pointerMove(plot, { pointerId: 1, clientX: x, clientY: 61 });
    }
    expect(onRender).toHaveBeenCalledTimes(afterFirst);

    fireEvent.pointerMove(plot, { pointerId: 1, clientX: 140, clientY: 61 });
    expect(onRender).toHaveBeenCalledTimes(afterFirst + 1);
    expect(tooltip()).toHaveTextContent('69.8 kg');
  });

  it('averages a year of daily weigh-ins into 30 points (R05.16)', () => {
    const year = weighIns(
      '2025-10-27',
      Array.from({ length: 365 }, (_, index) => 80 - index / 50),
    );
    renderChart({ points: year, goal: null });
    expect(count('dot')).toBe(30);
    const table = screen.getByRole('table', { hidden: true });
    expect(within(table).getAllByRole('row', { hidden: true })).toHaveLength(31);
    expect(screen.getByText(charts.charts.averaged)).toBeInTheDocument();
  });

  it('marks the points with dots only while there are 31 or fewer', () => {
    const { unmount } = renderChart();
    expect(count('dot')).toBe(5);
    unmount();

    const month = (days: number) =>
      weighIns(
        '2026-04-01',
        Array.from({ length: days }, (_, index) => 70 + (index % 3) / 10),
      );
    const second = renderChart({ points: month(31) });
    expect(count('dot')).toBe(31);
    second.unmount();

    renderChart({ points: month(32) });
    expect(count('dot')).toBe(0);
  });

  it('lists its points and the goal as text for screen readers', () => {
    renderChart();
    expect(screen.getByRole('figure', { name: 'Weight chart' })).toHaveAttribute(
      'data-ui',
      'weight.chart',
    );
    const table = screen.getByRole('table', { name: 'Weight chart', hidden: true });
    expect(table).toHaveAttribute('data-ui', 'weight.chart.table');
    const rows = within(table).getAllByRole('row', { hidden: true });
    expect(rows).toHaveLength(6);
    expect(rows[0]).toHaveTextContent(`${charts.charts.date}Weight`);
    expect(rows[1]).toHaveTextContent(`${formatDay('2026-04-01', 'medium')}70.4 kg`);
    expect(screen.getByText('Goal: 68 kg')).toBeInTheDocument();
  });

  it('labels round ticks on the right of the plot', () => {
    renderChart({ points: weighIns('2026-04-01', [68.2, 71, 74.9]), goal: null });
    const ticks = [...document.querySelectorAll('[data-part="tick"]')];
    expect(ticks.map((tick) => tick.textContent)).toEqual(['68', '70', '72', '74', '76']);
    for (const tick of ticks) expect(Number(tick.getAttribute('x'))).toBeGreaterThan(360);
  });

  it('keeps the body-fat axis at 0 % or above', () => {
    renderChart({
      points: weighIns('2026-04-01', [0.8, 1.5]),
      goal: null,
      minPad: 1,
      floor: 0,
      formatTick: (value) => `${formatDecimal(value, 1)}%`,
    });
    const ticks = [...document.querySelectorAll('[data-part="tick"]')];
    expect(ticks.map((tick) => tick.textContent)).toEqual([
      '0%',
      '0.5%',
      '1%',
      '1.5%',
      '2%',
      '2.5%',
    ]);
  });

  it('writes month and year under a 200-day span across New Year', () => {
    renderChart({
      points: weighIns('2025-09-15', [72, ...Array.from({ length: 199 }, () => 71), 70]),
      goal: null,
    });
    const dates = [...document.querySelectorAll('[data-part="date"]')];
    expect(dates.map((date) => date.textContent)).toEqual(['Sep 2025', 'Dec 2025', 'Apr 2026']);
  });

  it('draws with the theme through its classes, with no colour of its own', () => {
    renderChart();
    expect(document.querySelectorAll('svg [fill], svg [stroke]')).toHaveLength(0);
    expect(document.querySelector('svg')?.outerHTML).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(/i);
  });

  it('keeps the table but draws nothing until the plot has a width', () => {
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 0, 0));
    renderChart();
    expect(document.querySelector('svg')).toBeNull();
    const table = screen.getByRole('table', { hidden: true });
    expect(within(table).getAllByRole('row', { hidden: true })).toHaveLength(6);
  });
});

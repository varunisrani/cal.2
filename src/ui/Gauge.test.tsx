import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Gauge, gaugeSweep } from './Gauge';

/** A gauge with the words a Home screen would pass; the numbers are the caller's formatting. */
function renderGauge(eaten: number, goal: number, value: string, status: string) {
  return render(
    <Gauge
      eaten={eaten}
      goal={goal}
      heading="Calories"
      value={value}
      status={status}
      data-ui="day-gauge"
    />,
  );
}

afterEach(cleanup);

const fillOf = (container: HTMLElement) => container.querySelector('[data-part="fill"]');
const sweepOf = (container: HTMLElement) => container.querySelector('[data-part="sweep"]');

describe('gaugeSweep', () => {
  it.each([
    [1200, 2000, 108],
    [2000, 2000, 180],
    [2500, 2000, 180],
    [500, 2000, 45],
    [0, 2000, 0],
    [-50, 2000, 0],
    [Number.NaN, 2000, 0],
  ])('sweeps %s of %s over %s degrees', (eaten, goal, degrees) => {
    expect(gaugeSweep(eaten, goal)).toBeCloseTo(degrees, 10);
  });

  it.each([0, -100, Number.NaN, Number.POSITIVE_INFINITY])(
    'fills nothing when the goal is %s',
    (goal) => {
      expect(gaugeSweep(1200, goal)).toBeNull();
    },
  );
});

describe('Gauge', () => {
  it('sweeps 108° at 1 200 of 2 000', () => {
    const { container } = renderGauge(1200, 2000, '1,200', '800 left');
    expect(fillOf(container)).toHaveAttribute('data-sweep', '108');
    // The fill shows only the first 108 of the arc's 180 units.
    expect(sweepOf(container)).toHaveAttribute('stroke-dasharray', '108 180');
    expect(sweepOf(container)).toHaveAttribute('pathLength', '180');
  });

  it('stays full at 2 500 of 2 000 and looks the same as under the goal', () => {
    const { container } = render(
      <>
        <Gauge eaten={2500} goal={2000} heading="Calories" value="2,500" status="500 over" />
        <Gauge eaten={1200} goal={2000} heading="Calories" value="1,200" status="800 left" />
      </>,
    );
    const [over, under] = [...container.querySelectorAll('[data-part="fill"]')];
    expect(over).toHaveAttribute('data-sweep', '180');
    expect(sweepOf(container)).toHaveAttribute('stroke-dasharray', '180 180');
    expect(over?.getAttribute('class')).toBe(under?.getAttribute('class'));
  });

  it('draws no fill when the goal is 0, but keeps the track', () => {
    const { container } = renderGauge(1200, 0, '1,200', 'No goal');
    expect(fillOf(container)).toBeNull();
    expect(sweepOf(container)).toBeNull();
    expect(container.querySelector('mask')).toBeNull();
    expect(container.querySelector('[data-part="track"]')).toBeInTheDocument();
  });

  it('draws the fill along the same dashed arc as the track', () => {
    const { container } = renderGauge(1200, 2000, '1,200', '800 left');
    const track = container.querySelector('[data-part="track"]');
    const fill = fillOf(container);
    for (const attribute of ['d', 'pathLength', 'stroke-dasharray', 'stroke-width']) {
      expect(fill).toHaveAttribute(attribute, track?.getAttribute(attribute) ?? '');
    }
    // The mask the fill points at is this gauge's own.
    const mask = container.querySelector('mask');
    expect(fill).toHaveAttribute('mask', `url(#${mask?.id})`);
    // 25 dashes and 24 gaps fill the half turn exactly.
    const [dash, gap] = (track?.getAttribute('stroke-dasharray') ?? '').split(' ').map(Number);
    expect(25 * (dash ?? 0) + 24 * (gap ?? 0)).toBeCloseTo(180, 10);
  });

  it('gives each gauge its own mask', () => {
    const { container } = render(
      <>
        <Gauge eaten={100} goal={200} heading="Calories" value="100" status="100 left" />
        <Gauge eaten={50} goal={200} heading="Calories" value="50" status="150 left" />
      </>,
    );
    const ids = [...container.querySelectorAll('mask')].map((mask) => mask.id);
    expect(new Set(ids).size).toBe(2);
  });

  it('reads the visible value and status to a screen reader (ACC-L9-2)', () => {
    const { container } = renderGauge(1200, 2000, '1,200', '800 left');
    const gauge = screen.getByRole('group', { name: 'Calories' });
    expect(gauge).toHaveAttribute('data-ui', 'day-gauge');
    expect(gauge).toHaveAccessibleDescription('1,200 800 left');
    expect(screen.getByText('1,200')).toBeVisible();
    expect(screen.getByText('800 left')).toBeVisible();
    // The arc is drawing only.
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('keeps a decorative status mark out of the description', () => {
    render(
      <Gauge
        eaten={0}
        goal={2000}
        heading="Kilojoules"
        value="0"
        status="8,368 left"
        statusIcon={<svg aria-hidden="true" data-testid="mark" />}
      />,
    );
    expect(screen.getByRole('group', { name: 'Kilojoules' })).toHaveAccessibleDescription(
      '0 8,368 left',
    );
    expect(screen.getByTestId('mark')).toBeInTheDocument();
  });
});

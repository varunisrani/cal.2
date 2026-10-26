import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PILLAR_HEIGHT, PILLAR_WIDTH, Pillar, pillarFillHeight } from './Pillar';

afterEach(cleanup);

function drawPillar(amount: number, goal: number, status = '68 g left') {
  render(
    <Pillar
      data-ui="test.protein"
      amount={amount}
      goal={goal}
      label="Protein"
      value="82"
      status={status}
    />,
  );
  const pillar = screen.getByRole('group', { name: 'Protein' });
  const fill = pillar.querySelector('[data-ui="test.protein.fill"]');
  if (!fill) throw new Error('no fill');
  const height = Number(fill.getAttribute('height'));
  const top = Number(fill.getAttribute('y'));
  return { pillar, fill, height, top };
}

describe('pillarFillHeight', () => {
  it('fills its share of the goal', () => {
    expect(pillarFillHeight(75, 150)).toBe(32);
    expect(pillarFillHeight(150, 150)).toBe(64);
  });

  it('never drops below a dot as tall as the tube is wide', () => {
    expect(pillarFillHeight(0, 150)).toBe(PILLAR_WIDTH);
    expect(pillarFillHeight(10, 150)).toBe(PILLAR_WIDTH);
    expect(pillarFillHeight(-5, 150)).toBe(PILLAR_WIDTH);
    expect(pillarFillHeight(Number.NaN, 150)).toBe(PILLAR_WIDTH);
  });

  it('caps at the top of the tube', () => {
    expect(pillarFillHeight(400, 150)).toBe(PILLAR_HEIGHT);
  });

  it('shows the dot when there is no goal', () => {
    expect(pillarFillHeight(40, 0)).toBe(PILLAR_WIDTH);
    expect(pillarFillHeight(40, -1)).toBe(PILLAR_WIDTH);
  });
});

describe('Pillar', () => {
  it('draws a 16 × 64 tube', () => {
    const { pillar } = drawPillar(82, 150);
    const tube = pillar.querySelector('svg');
    expect(tube).toHaveAttribute('viewBox', '0 0 16 64');
    const track = tube?.querySelector('rect');
    expect(track).toHaveAttribute('width', '16');
    expect(track).toHaveAttribute('height', '64');
    expect(track).toHaveAttribute('rx', '8');
  });

  it('shows the minimum fill at zero, sitting on the bottom', () => {
    const { height, top } = drawPillar(0, 150, '150 g left');
    expect(height).toBe(16);
    expect(top + height).toBe(64);
  });

  it('fills bottom-up toward the goal', () => {
    const { height, top } = drawPillar(75, 150);
    expect(height).toBe(32);
    expect(top).toBe(32);
  });

  it('stays full past the goal and marks its status as over', () => {
    const { pillar, height, top } = drawPillar(200, 150, '50 g over');
    expect(height).toBe(64);
    expect(top).toBe(0);
    expect(within(pillar).getByText('50 g over')).toHaveAttribute('data-over', 'true');
  });

  it('does not mark the status as over without a goal', () => {
    const { pillar, height } = drawPillar(30, 0, 'No goal');
    expect(height).toBe(16);
    expect(within(pillar).getByText('No goal')).not.toHaveAttribute('data-over');
  });

  it('reads out the value, name and status it shows, with the tube hidden', () => {
    const { pillar } = drawPillar(82, 150);
    expect(pillar).toHaveAttribute('data-ui', 'test.protein');
    expect(within(pillar).getByText('82')).toHaveAttribute('data-ui', 'test.protein.value');
    expect(within(pillar).getByText('68 g left')).toHaveAttribute('data-ui', 'test.protein.status');
    expect(pillar.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(pillar).toHaveTextContent(/^82Protein68 g left$/);
  });
});

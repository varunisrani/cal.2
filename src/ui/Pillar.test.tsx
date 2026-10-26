import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Pillar, pillarFill } from './Pillar';

afterEach(cleanup);

function renderPillar(current: number, goal: number, status: string) {
  return render(
    <Pillar
      current={current}
      goal={goal}
      value={String(current)}
      label="Protein"
      status={status}
      data-ui="pillar-protein"
    />,
  );
}

const fillOf = (container: HTMLElement) =>
  container.querySelector<HTMLElement>('[data-part="fill"]');

describe('pillarFill', () => {
  it.each([
    [0, 120, 16],
    [2, 120, 16],
    [30, 120, 16],
    [60, 120, 32],
    [90, 120, 48],
    [120, 120, 64],
    [300, 120, 64],
    [-5, 120, 16],
    [60, 0, 16],
    [60, -10, 16],
    [Number.NaN, 120, 16],
  ])('fills %s of %s to %s px', (current, goal, px) => {
    expect(pillarFill(current, goal)).toBe(px);
  });
});

describe('Pillar', () => {
  it('shows the minimum fill, as tall as the tube is wide, at zero', () => {
    const { container } = renderPillar(0, 120, '120 g left');
    expect(fillOf(container)?.style.height).toBe('16px');
  });

  it('fills half the tube at half the goal and caps it at the top', () => {
    const half = renderPillar(60, 120, '60 g left');
    expect(fillOf(half.container)?.style.height).toBe('32px');
    cleanup();
    const over = renderPillar(200, 120, '80 g over');
    expect(fillOf(over.container)?.style.height).toBe('64px');
  });

  it('shows only the dot when there is no goal', () => {
    const { container } = renderPillar(45, 0, 'No goal');
    expect(fillOf(container)?.style.height).toBe('16px');
    expect(screen.getByRole('group', { name: 'Protein' })).not.toHaveAttribute('data-over');
  });

  it('marks the status as over only past the goal', () => {
    renderPillar(130, 120, '10 g over');
    expect(screen.getByRole('group', { name: 'Protein' })).toHaveAttribute('data-over', 'true');
    cleanup();
    renderPillar(120, 120, 'Goal reached');
    expect(screen.getByRole('group', { name: 'Protein' })).not.toHaveAttribute('data-over');
  });

  it('exposes the value and status as text and hides the tube', () => {
    const { container } = renderPillar(60, 120, '60 g left');
    const pillar = screen.getByRole('group', { name: 'Protein' });
    expect(pillar).toHaveAttribute('data-ui', 'pillar-protein');
    expect(pillar).toHaveAccessibleDescription('60 60 g left');
    expect(fillOf(container)?.parentElement).toHaveAttribute('aria-hidden', 'true');
  });
});

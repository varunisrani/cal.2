import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ProgressBar, progressShare } from './ProgressBar';

afterEach(cleanup);

const fillOf = (bar: HTMLElement) => bar.querySelector<HTMLElement>('[data-part="fill"]');

describe('progressShare', () => {
  it.each([
    [30, 60, 0.5],
    [0, 60, 0],
    [60, 60, 1],
    [90, 60, 1],
    [-10, 60, 0],
    [30, 0, 0],
    [30, -1, 0],
    [Number.NaN, 60, 0],
  ])('gives %s of %s as %s', (value, max, share) => {
    expect(progressShare(value, max)).toBe(share);
  });
});

describe('ProgressBar', () => {
  it('fills by value over max and exposes the percent', () => {
    render(<ProgressBar value={4} max={16} label="Fast" data-ui="fast-progress" />);
    const bar = screen.getByRole('progressbar', { name: 'Fast' });
    expect(bar).toHaveAttribute('data-ui', 'fast-progress');
    expect(bar).toHaveAttribute('aria-valuenow', '25');
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '100');
    expect(fillOf(bar)?.style.width).toBe('25%');
  });

  it('caps at full when the value passes the max', () => {
    render(<ProgressBar value={20} max={16} label="Fast" />);
    const bar = screen.getByRole('progressbar', { name: 'Fast' });
    expect(bar).toHaveAttribute('aria-valuenow', '100');
    expect(fillOf(bar)?.style.width).toBe('100%');
  });

  it('stays empty without a max', () => {
    render(<ProgressBar value={5} max={0} label="Fast" />);
    const bar = screen.getByRole('progressbar', { name: 'Fast' });
    expect(bar).toHaveAttribute('aria-valuenow', '0');
    expect(fillOf(bar)?.style.width).toBe('0%');
  });

  it('reads the value text when one is given', () => {
    render(<ProgressBar value={190} max={960} label="Fast" valueText="3h 10m of 16h" />);
    expect(screen.getByRole('progressbar', { name: 'Fast' })).toHaveAttribute(
      'aria-valuetext',
      '3h 10m of 16h',
    );
  });
});

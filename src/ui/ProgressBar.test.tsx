import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ProgressBar, progressShare } from './ProgressBar';

afterEach(cleanup);

describe('progressShare', () => {
  it('is the value over the maximum, kept within 0…1', () => {
    expect(progressShare(3, 4)).toBe(0.75);
    expect(progressShare(9, 4)).toBe(1);
    expect(progressShare(-1, 4)).toBe(0);
    expect(progressShare(Number.NaN, 4)).toBe(0);
  });

  it('is empty when the maximum is 0 or less', () => {
    expect(progressShare(3, 0)).toBe(0);
    expect(progressShare(3, -2)).toBe(0);
  });
});

describe('ProgressBar', () => {
  it('is a named progressbar reporting a percentage and its text', () => {
    render(
      <ProgressBar data-ui="test.steps" label="Setup" value={2} max={5} valueText="Step 2 of 5" />,
    );
    const bar = screen.getByRole('progressbar', { name: 'Setup' });
    expect(bar).toHaveAttribute('data-ui', 'test.steps');
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '100');
    expect(bar).toHaveAttribute('aria-valuenow', '40');
    expect(bar).toHaveAttribute('aria-valuetext', 'Step 2 of 5');
    expect(bar.style.getPropertyValue('--bar-share')).toBe('0.4');
  });

  it('takes a share when no maximum is given', () => {
    render(<ProgressBar data-ui="test.share" label="Water" value={0.25} />);
    const bar = screen.getByRole('progressbar', { name: 'Water' });
    expect(bar).toHaveAttribute('aria-valuenow', '25');
    expect(bar).not.toHaveAttribute('aria-valuetext');
  });

  it('stays full past the maximum and empty below zero', () => {
    const { rerender } = render(<ProgressBar data-ui="test.bar" label="Bar" value={7} max={5} />);
    const bar = screen.getByRole('progressbar', { name: 'Bar' });
    expect(bar).toHaveAttribute('aria-valuenow', '100');
    expect(bar.style.getPropertyValue('--bar-share')).toBe('1');
    rerender(<ProgressBar data-ui="test.bar" label="Bar" value={-3} max={5} />);
    expect(bar).toHaveAttribute('aria-valuenow', '0');
    expect(bar.style.getPropertyValue('--bar-share')).toBe('0');
  });
});

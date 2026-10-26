import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { StatBadge } from './StatBadge';

afterEach(cleanup);

describe('StatBadge', () => {
  it('shows the value over the label, both as text', () => {
    const { container } = render(<StatBadge value="72.4 kg" label="Average" data-ui="stat-avg" />);
    const badge = container.firstElementChild;
    expect(badge).toHaveAttribute('data-ui', 'stat-avg');
    expect(badge?.textContent).toBe('72.4 kgAverage');
    expect(screen.getByText('72.4 kg')).toBeVisible();
    expect(screen.getByText('Average')).toBeVisible();
    // Value first, then label: the reading order matches what is drawn.
    expect(badge?.firstElementChild).toBe(screen.getByText('72.4 kg'));
  });

  it('takes any node as the value', () => {
    render(<StatBadge value={<strong>1,850</strong>} label="Daily kcal" />);
    expect(screen.getByText('1,850').tagName).toBe('STRONG');
  });
});

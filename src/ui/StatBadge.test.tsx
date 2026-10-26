import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { StatBadge } from './StatBadge';

afterEach(cleanup);

describe('StatBadge', () => {
  it('pairs its label with its value for screen readers', () => {
    render(<StatBadge data-ui="test.average" value="72.4 kg" label="Average" />);
    expect(screen.getByRole('term')).toHaveTextContent('Average');
    expect(screen.getByRole('definition')).toHaveTextContent('72.4 kg');
  });

  it('carries its hook on the tile, label first in reading order', () => {
    const { container } = render(
      <StatBadge data-ui="test.average" value="72.4 kg" label="Average" />,
    );
    const tile = container.querySelector('[data-ui="test.average"]');
    expect(tile?.tagName).toBe('DL');
    expect(tile).toHaveTextContent(/^Average72\.4 kg$/);
  });
});

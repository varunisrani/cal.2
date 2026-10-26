import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Card } from './Card';

afterEach(cleanup);

describe('Card', () => {
  it('is a region named by its heading when it has one', () => {
    render(
      <Card heading="Water">
        <p>Two glasses so far</p>
      </Card>,
    );
    const region = screen.getByRole('region', { name: 'Water' });
    expect(region).toHaveTextContent('Two glasses so far');
    expect(screen.getByRole('heading', { level: 2, name: 'Water' })).toBeInTheDocument();
  });

  it('is a plain container without a heading', () => {
    render(
      <Card data-testid="card">
        <p>Nothing logged</p>
      </Card>,
    );
    expect(screen.queryByRole('region')).toBeNull();
    const card = screen.getByTestId('card');
    expect(card.tagName).toBe('DIV');
    expect(card).toHaveTextContent('Nothing logged');
  });

  it('can be a list item with a level 3 heading', () => {
    render(
      <ul>
        <Card as="li" heading="Lunch" headingLevel={3}>
          <p>Soup</p>
        </Card>
      </ul>,
    );
    const item = screen.getByRole('listitem');
    expect(item).toHaveAccessibleName('Lunch');
    expect(screen.getByRole('heading', { level: 3, name: 'Lunch' })).toBeInTheDocument();
  });
});

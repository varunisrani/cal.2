import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Card } from './Card';

afterEach(cleanup);

describe('Card', () => {
  it('is a region named by its heading when it has one', () => {
    render(
      <Card heading="Water" data-ui="test.water">
        <p>Body</p>
      </Card>,
    );
    const region = screen.getByRole('region', { name: 'Water' });
    expect(region).toHaveAttribute('data-ui', 'test.water');
    expect(screen.getByRole('heading', { level: 2, name: 'Water' })).toBeInTheDocument();
    expect(region).toContainElement(screen.getByText('Body'));
  });

  it('uses the heading level it is given', () => {
    render(<Card heading="Fasting" headingLevel={3} />);
    expect(screen.getByRole('heading', { level: 3, name: 'Fasting' })).toBeInTheDocument();
  });

  it('is a plain surface without a heading', () => {
    render(
      <Card data-ui="test.plain">
        <p>Body</p>
      </Card>,
    );
    expect(screen.queryByRole('region')).toBeNull();
    expect(screen.getByText('Body').parentElement).toHaveAttribute('data-ui', 'test.plain');
  });

  it('can be drawn as a list item', () => {
    render(
      <ul>
        <Card as="li">Row</Card>
      </ul>,
    );
    expect(screen.getByRole('listitem')).toHaveTextContent('Row');
  });
});

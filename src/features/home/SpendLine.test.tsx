import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Price } from '../../domain/model';
import { spendOf } from '../../domain/money/spending';
import { makeEntry } from '../../test/factories';
import { SpendLine } from './SpendLine';

/** The line for foods with these prices (none for undefined), in the person's `currency`. */
function renderLine(
  prices: readonly (Price | undefined)[],
  currency = 'INR',
  onOpen = () => undefined,
) {
  const entries = prices.map((price) => (price ? makeEntry({ price }) : makeEntry()));
  return render(<SpendLine spend={spendOf(entries, currency)} onOpen={onOpen} />);
}

const inr = (amount: number): Price => ({ amount, currency: 'INR' });
const line = () => document.querySelector<HTMLElement>('[data-ui="spending.home"]');
const hook = (name: string) =>
  document.querySelector<HTMLElement>(`[data-ui="spending.home.${name}"]`);

describe('SpendLine (D-16.108)', () => {
  it("says what the day's foods cost", () => {
    renderLine([inr(120), inr(120)]);
    const button = screen.getByRole('button', { name: '₹240 spent' });
    expect(button).toBe(line());
    expect(hook('amount')).toHaveTextContent('₹240 spent');
    expect(hook('coverage')).toBeNull();
  });

  it('says from how many foods when some have no price, never counting them as 0', () => {
    renderLine([inr(120), undefined, inr(80), undefined, inr(40), inr(0)]);
    expect(line()).toHaveAccessibleName('₹240 spent from 4 of 6 foods');
    expect(hook('coverage')).toHaveTextContent('from 4 of 6 foods');
  });

  it("adds other currencies apart, the person's own first", () => {
    renderLine([{ amount: 5, currency: 'USD' }, inr(240), { amount: 4.5, currency: 'EUR' }]);
    expect(line()).toHaveAccessibleName('₹240, €4.50, and $5 spent');
  });

  it('shows cents only when an amount has them', () => {
    renderLine([{ amount: 4.5, currency: 'USD' }], 'USD');
    expect(line()).toHaveAccessibleName('$4.50 spent');
  });

  it('draws nothing on a day where no food has a price, or without food', () => {
    renderLine([undefined, undefined]);
    expect(line()).toBeNull();
    renderLine([]);
    expect(line()).toBeNull();
  });

  it('counts a free meal: ₹0 spent', () => {
    renderLine([inr(0)]);
    expect(line()).toHaveAccessibleName('₹0 spent');
  });

  it('opens Spending on a tap', () => {
    const onOpen = vi.fn();
    renderLine([inr(10)], 'INR', onOpen);
    fireEvent.click(line() as HTMLElement);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});

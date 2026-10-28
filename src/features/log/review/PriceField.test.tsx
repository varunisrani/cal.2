import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { price as words } from '../../../i18n/en/price';
import { makeDraft } from '../../../test/factories';
import { PriceField, priceTextInvalid, withTypedPrice } from './PriceField';

const PRICE = words.price;

describe('PriceField (D-16.107)', () => {
  it('is a labelled amount field with its currency after it, described by the hint', () => {
    const onChange = vi.fn();
    render(<PriceField value="" currency="INR" onChange={onChange} data-ui="price.review" />);
    const field = screen.getByRole('textbox', { name: PRICE.label });
    expect(field).toHaveAttribute('data-ui', 'price.review');
    expect(field).toHaveAttribute('inputmode', 'decimal');
    expect(field).toHaveAccessibleDescription(`INR ${PRICE.hint}`);
    expect(field).not.toHaveAttribute('aria-invalid');
    fireEvent.change(field, { target: { value: '120' } });
    expect(onChange).toHaveBeenCalledWith('120');
  });

  it('says so under the field when the text is not an amount', () => {
    render(<PriceField value="12 rupees" currency="INR" onChange={() => undefined} data-ui="p" />);
    const field = screen.getByRole('textbox', { name: PRICE.label });
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(field).toHaveAccessibleDescription(`INR ${PRICE.invalid}`);
  });
});

describe('withTypedPrice and priceTextInvalid', () => {
  it('sets the typed amount in the currency, and takes the price away when empty', () => {
    const draft = makeDraft({ price: { amount: 5, currency: 'USD' } });
    expect(withTypedPrice(draft, '4,50', 'EUR').price).toEqual({ amount: 4.5, currency: 'EUR' });
    expect(withTypedPrice(draft, '  ', 'EUR')).not.toHaveProperty('price');
    expect(withTypedPrice(draft, '0', 'INR').price).toEqual({ amount: 0, currency: 'INR' });
    expect(draft.price).toEqual({ amount: 5, currency: 'USD' });
  });

  it('flags only text that is not an amount', () => {
    expect(priceTextInvalid('')).toBe(false);
    expect(priceTextInvalid('120')).toBe(false);
    expect(priceTextInvalid('-5')).toBe(true);
    expect(priceTextInvalid('₹120')).toBe(true);
  });
});

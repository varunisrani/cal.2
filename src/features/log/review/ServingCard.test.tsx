import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { NutritionDraft } from '../../../domain/model';
import { initialAmount } from '../../../domain/servings/scale';
import { pickerUnits, type ShownAmount } from '../../../domain/servings/units';
import { review } from '../../../i18n/en/review';
import { makeDraft } from '../../../test/factories';
import { ServingCard } from './ServingCard';

const words = review.review.serving;

/** Two slices of 30 g each, with a 240 g cup offered too. */
const TOAST = makeDraft({
  name: 'Toast',
  basis: { kind: 'grams', grams: 60 },
  units: [
    { unit: 'slice', gramsEach: 30 },
    { unit: 'cup', gramsEach: 240 },
  ],
  chosenUnit: 'slice',
  chosenCount: 2,
});

/** The card over a parent that keeps the amount, as the review sheet does. */
function renderCard(draft: NutritionDraft, gramsFirst = false) {
  const changes = vi.fn<(shown: ShownAmount) => void>();
  function Parent() {
    const [shown, setShown] = useState(() => initialAmount(draft, gramsFirst));
    return (
      <>
        <ServingCard
          units={pickerUnits(draft.basis, draft.units)}
          shown={shown}
          onChange={(next) => {
            changes(next);
            setShown(next);
          }}
        />
        <button type="button">Somewhere else</button>
      </>
    );
  }
  render(<Parent />);
  const card = within(screen.getByRole('region', { name: words.heading }));
  return {
    card,
    changes,
    amount: () => card.getByRole('textbox', { name: words.amount }),
    picker: () => card.queryByRole('combobox', { name: words.unit }),
    grams: () => document.querySelector('[data-ui="review.grams"]'),
  };
}

describe('ServingCard', () => {
  it('offers grams first and then the named units when the weight is known', () => {
    const view = renderCard(TOAST);
    const options = within(view.picker() as HTMLElement).getAllByRole('option');
    expect(options.map((option) => option.textContent)).toEqual(['g', 'slices', 'cup']);
    expect(view.picker()).toHaveValue('slice');
    expect(view.amount()).toHaveValue('2');
  });

  it('offers only servings, with no grams and no ≈ line, when the weight is unknown (R02.1)', () => {
    const view = renderCard(
      makeDraft({ basis: { kind: 'servings', count: 2 }, units: [], chosenUnit: undefined }),
    );
    expect(view.picker()).toBeNull();
    expect(view.card.getByText(words.servingOther)).toHaveAttribute('data-ui', 'review.unit');
    expect(view.amount()).toHaveValue('2');
    expect(view.grams()).toBeNull();
    expect(view.card.queryByText(/\bg\b/)).toBeNull();
  });

  it('keeps the weight when switching from 2 slices of 30 g to grams, which shows 60 (ACC-D9-2)', () => {
    const view = renderCard(TOAST);
    expect(view.grams()).toHaveTextContent('≈ 60 g');

    fireEvent.change(view.picker() as HTMLElement, { target: { value: 'g' } });
    expect(view.amount()).toHaveValue('60');
    expect(view.changes).toHaveBeenLastCalledWith({
      unit: { kind: 'grams', id: 'g' },
      count: 60,
      amount: 60,
    });
    // Grams need no line repeating the field.
    expect(view.grams()).toBeNull();
  });

  it('says about how many grams a named unit comes to, in any unit', () => {
    const view = renderCard(TOAST);
    fireEvent.change(view.picker() as HTMLElement, { target: { value: 'cup' } });
    expect(view.amount()).toHaveValue('0.25');
    expect(view.grams()).toHaveTextContent('≈ 60 g');
    // Any count but one reads as plural, a quarter cup included.
    const options = within(view.picker() as HTMLElement).getAllByRole('option');
    expect(options.map((option) => option.textContent)).toEqual(['g', 'slice', 'cups']);
  });

  it('moves the amount live while an expression is typed in grams', async () => {
    const view = renderCard(TOAST, true);
    expect(view.picker()).toHaveValue('g');
    const user = userEvent.setup();
    await user.clear(view.amount());
    await user.type(view.amount(), '50+20');
    expect(view.changes).toHaveBeenLastCalledWith({
      unit: { kind: 'grams', id: 'g' },
      count: 70,
      amount: 70,
    });

    await user.click(screen.getByRole('button', { name: 'Somewhere else' }));
    expect(view.amount()).toHaveValue('70');
  });

  it('counts named units by the weight: typing 3 slices makes 90 g', async () => {
    const view = renderCard(TOAST);
    const user = userEvent.setup();
    await user.clear(view.amount());
    await user.type(view.amount(), '3');
    expect(view.changes).toHaveBeenLastCalledWith(
      expect.objectContaining({ count: 3, amount: 90 }),
    );
    expect(view.grams()).toHaveTextContent('≈ 90 g');
  });
});

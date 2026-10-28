import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { NutrientValues } from '../../domain/model';
import { sugarOfDay } from '../../domain/nutrients/sugar';
import { home } from '../../i18n/en/home';
import { SugarLine } from './SugarLine';

const words = home.home;

/** The line for foods with these optional nutrients, against `limit` grams. */
function renderLine(foods: readonly NutrientValues[], limit = 50, onOpen = () => undefined) {
  return render(
    <SugarLine
      sugar={sugarOfDay(foods.map((nutrients) => ({ nutrients })))}
      limit={limit}
      onOpen={onOpen}
    />,
  );
}

const line = () => document.querySelector<HTMLElement>('[data-ui="home.sugar"]');
const hook = (name: string) =>
  document.querySelector<HTMLElement>(`[data-ui="home.sugar.${name}"]`);
const fill = () =>
  document.querySelector<HTMLElement>('[data-ui="home.sugar.bar"] [data-part="fill"]');

describe('SugarLine (D-16.98)', () => {
  it('reads the grams against the limit, with a bar filled that far', () => {
    renderLine([{ sugar: 12 }, { sugar: 20 }]);

    const button = screen.getByRole('button', { name: 'Sugar 32 g of 50 g' });
    expect(button).toBe(line());
    expect(hook('amount')).toHaveTextContent('32 g of 50 g');
    expect(hook('bar')).toHaveAttribute('aria-hidden', 'true');
    expect(fill()?.style.inlineSize).toBe('64%');
    expect(line()).not.toHaveAttribute('data-over');
    expect(hook('over')).toBeNull();
    expect(hook('coverage')).toBeNull();
    expect(hook('added')).toBeNull();
  });

  it('is full but not over exactly at the limit', () => {
    renderLine([{ sugar: 30 }, { sugar: 20 }]);
    expect(line()).toHaveAccessibleName('Sugar 50 g of 50 g');
    expect(fill()?.style.inlineSize).toBe('100%');
    expect(line()).not.toHaveAttribute('data-over');
  });

  it('says how far over past the limit, with the bar full, both in the warning colour', () => {
    renderLine([{ sugar: 40 }, { sugar: 18 }]);
    expect(line()).toHaveAccessibleName('Sugar 58 g of 50 g 8 g over');
    expect(line()).toHaveAttribute('data-over');
    expect(hook('over')).toHaveTextContent('8 g over');
    expect(fill()?.style.inlineSize).toBe('100%');
  });

  it('compares and writes amounts as shown, one decimal only when not whole', () => {
    renderLine([{ sugar: 0.1 }, { sugar: 0.2 }], 0.3);
    expect(line()).toHaveAccessibleName('Sugar 0.3 g of 0.3 g');
    expect(line()).not.toHaveAttribute('data-over');

    renderLine([{ sugar: 50.26 }]);
    expect(screen.getByRole('button', { name: 'Sugar 50.3 g of 50 g 0.3 g over' })).toBeVisible();
  });

  it('shows the grams alone, with no bar and never over, while the limit is off', () => {
    renderLine([{ sugar: 80 }], 0);
    expect(line()).toHaveAccessibleName('Sugar 80 g');
    expect(hook('bar')).toBeNull();
    expect(line()).not.toHaveAttribute('data-over');
  });

  it('says from how many foods when some have no sugar figure, never counting them as 0 g', () => {
    renderLine([{ sugar: 18 }, { fibre: 4 }, { sugar: 14 }, {}, { sugar: 0 }, { sodium: 300 }]);
    expect(line()).toHaveAccessibleName('Sugar 32 g of 50 g from 3 of 6 foods');
    expect(hook('coverage')).toHaveTextContent('from 3 of 6 foods');
  });

  it('says there are no sugar figures, with no number and no bar, when no food has one', () => {
    renderLine([{ fibre: 4 }, {}]);
    expect(line()).toHaveAccessibleName(`Sugar ${words.sugar.noFigures}`);
    expect(hook('amount')).toHaveTextContent(words.sugar.noFigures);
    expect(hook('bar')).toBeNull();
    expect(hook('coverage')).toBeNull();
    expect(line()?.textContent).not.toMatch(/\d/);
  });

  it('adds the added sugar when any food carries it, after the rest, in reading order', () => {
    renderLine([{ sugar: 40, addedSugar: 10 }, { sugar: 25, addedSugar: 2 }, { fibre: 3 }]);
    expect(line()).toHaveAccessibleName(
      'Sugar 65 g of 50 g 15 g over from 2 of 3 foods 12 g added',
    );
    expect(hook('added')).toHaveTextContent('12 g added');
  });

  it('shows added sugar of 0 g as a figure, and added sugar beside no sugar figures', () => {
    renderLine([{ sugar: 6, addedSugar: 0 }]);
    expect(line()).toHaveAccessibleName('Sugar 6 g of 50 g 0 g added');

    renderLine([{ addedSugar: 5 }]);
    expect(
      screen.getByRole('button', { name: `Sugar ${words.sugar.noFigures} 5 g added` }),
    ).toBeVisible();
  });

  it('draws nothing on a day without food', () => {
    const { container } = renderLine([]);
    expect(container).toBeEmptyDOMElement();
  });

  it('opens All nutrients on a tap', () => {
    const onOpen = vi.fn();
    renderLine([{ sugar: 5 }], 50, onOpen);
    fireEvent.click(screen.getByRole('button', { name: /^Sugar/ }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});

import { fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { ExtraKey, ExtraValues, NutrientKey, NutrientValues } from '../../../domain/model';
import { review } from '../../../i18n/en/review';
import { MoreNutrition } from './MoreNutrition';

const words = review.review;

interface Setup {
  readonly nutrients?: NutrientValues;
  readonly extras?: ExtraValues;
  readonly scale?: number;
}

/** The list over a parent that keeps the values and the lock, as the review sheet does. */
function renderMore({ nutrients = {}, extras = {}, scale = 1 }: Setup = {}) {
  const nutrientChanges = vi.fn<(key: NutrientKey, base: number | undefined) => void>();
  const extraChanges = vi.fn<(key: ExtraKey, base: number | undefined) => void>();
  const store = { nutrients, extras };
  function Parent() {
    const [current, setCurrent] = useState(store);
    const [unlocked, setUnlocked] = useState(false);
    const put = <K extends string>(values: Partial<Record<K, number>>, key: K, base?: number) => {
      const next = { ...values };
      if (base === undefined) delete next[key];
      else next[key] = base;
      return next;
    };
    return (
      <>
        <button type="button" onClick={() => setUnlocked(!unlocked)}>
          Lock
        </button>
        <MoreNutrition
          nutrients={current.nutrients}
          extras={current.extras}
          scale={scale}
          unlocked={unlocked}
          onNutrientChange={(key, base) => {
            nutrientChanges(key, base);
            store.nutrients = put(store.nutrients, key, base);
            setCurrent({ ...store });
          }}
          onExtraChange={(key, base) => {
            extraChanges(key, base);
            store.extras = put(store.extras, key, base);
            setCurrent({ ...store });
          }}
        />
      </>
    );
  }
  render(<Parent />);
  const toggle = () => screen.getByRole('button', { name: words.more.heading });
  return {
    nutrientChanges,
    extraChanges,
    store,
    toggle,
    lock: () => fireEvent.click(screen.getByRole('button', { name: 'Lock' })),
    open: () => fireEvent.click(toggle()),
    /** The row's value and unit, as text. */
    row: (id: string) => {
      const value = document.querySelector<HTMLElement>(`[data-ui="review.more.${id}"]`);
      const unit = value?.nextElementSibling?.textContent;
      const text = value instanceof HTMLInputElement ? value.value : value?.textContent;
      return `${text ?? ''} ${unit ?? ''}`;
    },
    type: (label: string, text: string) =>
      fireEvent.change(screen.getByRole('textbox', { name: label }), { target: { value: text } }),
  };
}

describe('MoreNutrition', () => {
  it('starts collapsed and opens to the 23 nutrients, then the 8 extras, in catalogue order', () => {
    const more = renderMore();
    expect(more.toggle()).toHaveAttribute('aria-expanded', 'false');
    expect(document.querySelector('dl')).toBeNull();

    more.open();
    expect(more.toggle()).toHaveAttribute('aria-expanded', 'true');
    const labels = within(document.querySelector('dl') as HTMLElement)
      .getAllByRole('term')
      .map((term) => term.textContent);
    expect(labels).toEqual([...Object.values(words.nutrient), ...Object.values(words.extra)]);
    expect(labels).toHaveLength(31);
    expect(labels.slice(0, 2)).toEqual(['Added sugar', 'Fibre']);
    expect(labels.slice(-1)).toEqual(['Taurine']);
  });

  it('shows each value at the shown amount to 0.1 with its unit, and a dash when unknown (ACC-D1-1)', () => {
    const more = renderMore({
      nutrients: { sodium: 410.04, fibre: 7, vitaminD: 1.25 },
      extras: { creatine: 1.5 },
      scale: 2,
    });
    more.open();
    expect(more.row('sodium')).toBe('820.1 mg');
    expect(more.row('fibre')).toBe('14 g');
    expect(more.row('vitaminD')).toBe('2.5 mcg');
    expect(more.row('creatine')).toBe('3 g');
    expect(more.row('potassium')).toBe('— mg');
    expect(more.row('taurine')).toBe('— g');
  });

  it('makes a cleared sodium unknown, shown as a dash once locked', () => {
    const more = renderMore({ nutrients: { sodium: 400 } });
    more.open();
    more.lock();
    expect(screen.getByRole('textbox', { name: words.nutrient.sodium })).toHaveValue('400');

    more.type(words.nutrient.sodium, '');
    expect(more.nutrientChanges).toHaveBeenLastCalledWith('sodium', undefined);
    expect(more.store.nutrients).toEqual({});

    more.lock();
    expect(more.row('sodium')).toBe('— mg');
  });

  it('makes a negative or unreadable value unknown, never 0', () => {
    const more = renderMore({ nutrients: { iron: 3, zinc: 2 } });
    more.open();
    more.lock();
    more.type(words.nutrient.iron, '-1');
    more.type(words.nutrient.zinc, 'lots');
    expect(more.store.nutrients).toEqual({});
    expect(screen.getByRole('textbox', { name: words.nutrient.zinc })).toHaveValue('lots');
  });

  it('stores what is typed divided by the scale, for nutrients and extras alike (R02.3)', () => {
    const more = renderMore({ scale: 2 });
    more.open();
    more.lock();
    expect(screen.getByRole('textbox', { name: words.nutrient.calcium })).toHaveValue('');

    more.type(words.nutrient.calcium, '300');
    more.type(words.extra.creatine, '5');
    expect(more.nutrientChanges).toHaveBeenLastCalledWith('calcium', 150);
    expect(more.extraChanges).toHaveBeenLastCalledWith('creatine', 2.5);
    expect(screen.getByRole('textbox', { name: words.extra.creatine })).toHaveValue('5');

    more.lock();
    expect(more.row('calcium')).toBe('300 mg');
  });
});

import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { EnergyDisplayUnit } from '../../../domain/units/energy';
import { review } from '../../../i18n/en/review';
import { NutritionRows, type CoreKey, type CoreValues } from './NutritionRows';

const words = review.review.nutrition;

interface Setup {
  readonly values?: CoreValues;
  readonly scale?: number;
  readonly unit?: EnergyDisplayUnit;
  readonly hasLines?: boolean;
}

const SOUP: CoreValues = { kcal: 205, protein: 12, carbs: 29, fat: 4.75 };

/** The rows over a parent that keeps the stored values and the lock, as the review sheet does. */
function renderRows({ values = SOUP, scale = 1, unit = 'kcal', hasLines = false }: Setup = {}) {
  const changes = vi.fn<(key: CoreKey, base: number) => void>();
  let stored = values;
  function Parent() {
    const [current, setCurrent] = useState(values);
    const [unlocked, setUnlocked] = useState(false);
    return (
      <NutritionRows
        values={current}
        scale={scale}
        energyUnit={unit}
        unlocked={unlocked}
        onUnlockedChange={setUnlocked}
        hasLines={hasLines}
        onChange={(key, base) => {
          changes(key, base);
          stored = { ...stored, [key]: base };
          setCurrent(stored);
        }}
      />
    );
  }
  render(<Parent />);
  const card = within(screen.getByRole('region', { name: words.heading }));
  const user = userEvent.setup();
  return {
    card,
    changes,
    user,
    stored: () => stored,
    lock: () => card.getByRole('button', { name: /^(Edit nutrition|Done editing)$/ }),
    /** The value of a row: its field while unlocked, else its text. */
    shown: (row: string) => {
      const element = document.querySelector<HTMLElement>(`[data-ui="review.${row}"]`);
      return element instanceof HTMLInputElement ? element.value : element?.textContent;
    },
    field: (label: string) => card.getByRole('textbox', { name: label }),
    type: (label: string, text: string) =>
      fireEvent.change(card.getByRole('textbox', { name: label }), { target: { value: text } }),
  };
}

describe('NutritionRows', () => {
  it('shows energy and macros at the shown amount as text while locked', () => {
    const rows = renderRows({ scale: 2 });
    expect(rows.shown('kcal')).toBe('410');
    expect(rows.shown('protein')).toBe('24');
    expect(rows.shown('carbs')).toBe('58');
    expect(rows.shown('fat')).toBe('9.5');
    expect(rows.card.queryAllByRole('textbox')).toHaveLength(0);
    expect(rows.lock()).toHaveAccessibleName(words.unlock);
    expect(rows.lock()).toHaveAttribute('aria-pressed', 'false');
  });

  it('stores protein typed at twice the amount as half, and shows what was typed (ACC-D10-1, R02.3)', async () => {
    const rows = renderRows({ scale: 2 });
    await rows.user.click(rows.lock());
    expect(rows.lock()).toHaveAccessibleName(words.lock);
    expect(rows.field(words.protein)).toHaveValue('24');

    rows.type(words.protein, '40');
    expect(rows.changes).toHaveBeenLastCalledWith('protein', 20);
    expect(rows.stored().protein).toBe(20);
    expect(rows.field(words.protein)).toHaveValue('40');

    await rows.user.click(rows.lock());
    expect(rows.shown('protein')).toBe('40');
  });

  it('stores 0 for negative, unreadable or empty energy and macros', () => {
    const rows = renderRows();
    fireEvent.click(rows.lock());
    rows.type(words.energy.kcal, '-5');
    rows.type(words.protein, 'abc');
    rows.type(words.fat, '');
    expect(rows.stored()).toEqual({ kcal: 0, protein: 0, carbs: 29, fat: 0 });
    // What was typed stays in the field.
    expect(rows.field(words.energy.kcal)).toHaveValue('-5');

    fireEvent.click(rows.lock());
    expect(rows.shown('kcal')).toBe('0');
    expect(rows.shown('fat')).toBe('0');
  });

  it('keeps the edits when locked again, and opens the fields at the values on screen', async () => {
    const rows = renderRows({ scale: 1.5 });
    await rows.user.click(rows.lock());
    rows.type(words.carbs, '60');
    expect(rows.stored().carbs).toBe(40);
    await rows.user.click(rows.lock());
    expect(rows.shown('carbs')).toBe('60');
    expect(rows.card.queryAllByRole('textbox')).toHaveLength(0);

    await rows.user.click(rows.lock());
    expect(rows.field(words.carbs)).toHaveValue('60');
    expect(rows.field(words.fat)).toHaveValue('7.1');
  });

  it('keeps a half-typed 40. in the field', () => {
    const rows = renderRows();
    fireEvent.click(rows.lock());
    rows.type(words.protein, '40.');
    expect(rows.field(words.protein)).toHaveValue('40.');
    expect(rows.stored().protein).toBe(40);
  });

  it('shows kilojoules, stores a typed kJ value as kcal over the scale, and never converts an untouched field (R06.20)', () => {
    const rows = renderRows({ values: { ...SOUP, kcal: 251 }, scale: 2, unit: 'kJ' });
    // 502 kcal is 2,100.4 kJ.
    expect(rows.shown('kcal')).toBe('2,100');
    expect(rows.card.getByText(review.review.unit.kJ)).toBeInTheDocument();

    fireEvent.click(rows.lock());
    expect(rows.field(words.energy.kJ)).toHaveValue('2100');
    rows.type(words.protein, '30');
    fireEvent.click(rows.lock());
    expect(rows.changes).not.toHaveBeenCalledWith('kcal', expect.anything());
    expect(rows.stored().kcal).toBe(251);

    fireEvent.click(rows.lock());
    rows.type(words.energy.kJ, '4184');
    expect(rows.changes).toHaveBeenLastCalledWith('kcal', 500);
    expect(rows.field(words.energy.kJ)).toHaveValue('4184');
  });

  it('says that a change of ingredients adds the values up again, only while unlocked and only with lines (R02.5)', async () => {
    const withLines = renderRows({ hasLines: true });
    expect(screen.queryByText(words.linesHint)).toBeNull();
    await withLines.user.click(withLines.lock());
    expect(screen.getByText(words.linesHint)).toHaveAttribute('data-ui', 'review.nutrition.hint');
  });

  it('shows no hint for a food without lines', () => {
    const rows = renderRows();
    fireEvent.click(rows.lock());
    expect(screen.queryByText(words.linesHint)).toBeNull();
  });
});

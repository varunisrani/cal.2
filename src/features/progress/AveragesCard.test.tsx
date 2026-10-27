import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AveragesCard, type AverageRow } from './AveragesCard';

function renderRows(rows: AverageRow[]) {
  render(<AveragesCard title="Averages" rows={rows} data-ui="test.averages" />);
}

/** The value text and the bar's width of one row. */
function row(key: string): { value: string; fill: string } {
  const item = document.querySelector(`[data-ui="test.averages.${key}"]`);
  if (!item) throw new Error(`no row ${key}`);
  const fill = item.querySelector<HTMLElement>('[data-part="fill"]');
  if (!fill) throw new Error(`no bar in row ${key}`);
  return {
    value: item.querySelector('[data-part="value"]')?.textContent ?? '',
    fill: fill.style.width,
  };
}

describe('AveragesCard', () => {
  it('names the card and lists each average against its goal with a bar filled by the share', () => {
    renderRows([
      { key: 'protein', name: 'Protein', average: 280 / 3, goal: 150, unit: 'g' },
      { key: 'fat', name: 'Fat', average: 35, goal: 70, unit: 'g' },
    ]);
    expect(screen.getByRole('heading', { level: 2, name: 'Averages' })).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText('Protein')).toBeInTheDocument();
    expect(row('protein').value).toBe('93.3 g / 150 g');
    expect(parseFloat(row('protein').fill)).toBeCloseTo(62.22, 2);
    expect(row('fat')).toEqual({ value: '35 g / 70 g', fill: '50%' });
  });

  it('writes the amount alone without a goal and still draws the bar, at its minimum', () => {
    renderRows([{ key: 'creatine', name: 'Creatine', average: 2.5, goal: 0, unit: 'g' }]);
    expect(row('creatine')).toEqual({ value: '2.5 g', fill: '0%' });
  });

  it('fills the bar no further than full when the average is over the goal', () => {
    renderRows([{ key: 'sodium', name: 'Sodium', average: 3_050, goal: 2_300, unit: 'mg' }]);
    expect(row('sodium')).toEqual({ value: '3,050 mg / 2,300 mg', fill: '100%' });
  });

  it('writes each nutrient in its own unit', () => {
    renderRows([{ key: 'vitaminD', name: 'Vitamin D', average: 7.25, goal: 20, unit: 'mcg' }]);
    expect(row('vitaminD').value).toBe('7.3 mcg / 20 mcg');
  });
});

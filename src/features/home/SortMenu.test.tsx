import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { DiarySortMode } from '../../domain/meals/diary';
import { home } from '../../i18n/en/home';
import { SortMenu } from './SortMenu';

const words = home.home.sort;

function renderMenu(mode: DiarySortMode) {
  const onChange = vi.fn<(mode: DiarySortMode) => void>();
  render(<SortMenu mode={mode} onChange={onChange} />);
  fireEvent.click(screen.getByRole('button', { name: words.label }));
  return { onChange };
}

describe('SortMenu', () => {
  it('offers By meal and Newest first, the stored one checked', () => {
    renderMenu('newestFirst');

    const rows = screen.getAllByRole('menuitemradio');
    expect(rows.map((row) => row.textContent)).toEqual([words.byMeal, words.newestFirst]);
    expect(rows.map((row) => row.getAttribute('aria-checked'))).toEqual(['false', 'true']);
    expect(screen.getByRole('button', { name: words.label })).toHaveAttribute(
      'data-ui',
      'home.sort',
    );
  });

  it('hands on another mode and closes; the current one changes nothing', () => {
    const { onChange } = renderMenu('byMeal');

    fireEvent.click(screen.getByRole('menuitemradio', { name: words.newestFirst }));
    expect(onChange).toHaveBeenCalledWith('newestFirst');
    expect(screen.queryByRole('menu')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: words.label }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: words.byMeal }));
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});

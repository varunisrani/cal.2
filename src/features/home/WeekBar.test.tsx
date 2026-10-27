import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DayKey } from '../../domain/dates/dayKey';
import type { WeekStart } from '../../domain/dates/week';
import { home } from '../../i18n/en/home';
import { oldestDay, WeekBar } from './WeekBar';

/** Monday 26 October 2026. */
const TODAY = '2026-10-26';
/** jsdom lays nothing out: every element reports this width. */
const WIDTH = 320;

const strip = () => screen.getByRole('radiogroup', { name: home.home.week.label });
const pages = () => [...document.querySelectorAll<HTMLElement>('[data-ui="home.week.page"]')];
const daysOf = (page: HTMLElement | undefined) =>
  [...(page?.querySelectorAll<HTMLElement>('[data-day]') ?? [])].map((tile) => tile.dataset.day);
function tile(day: DayKey): HTMLButtonElement {
  const found = document.querySelector<HTMLButtonElement>(`[data-day="${day}"]`);
  if (!found) throw new Error(`No tile for ${day}`);
  return found;
}

/** The strip's scroll calls; each one also moves the strip, as a browser would in the end. */
const scrollTo = vi.fn(function (this: HTMLElement, options: ScrollToOptions) {
  this.scrollLeft = options.left ?? this.scrollLeft;
});

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(WIDTH);
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
    configurable: true,
    value: scrollTo,
  });
});

afterEach(() => {
  Reflect.deleteProperty(HTMLElement.prototype, 'scrollTo');
  scrollTo.mockClear();
});

interface BarProps {
  readonly selected?: DayKey;
  readonly weekStart?: WeekStart;
}

/** The bar as Home draws it, with a selection it keeps itself (as Home's store does). */
function renderBar({ selected = TODAY, weekStart = 'mon' }: BarProps = {}) {
  const onSelect = vi.fn();
  function Bar({ start }: { readonly start: WeekStart }) {
    const [day, setDay] = useState(selected);
    return (
      <WeekBar
        today={TODAY}
        selected={day}
        weekStart={start}
        onSelect={(next) => {
          onSelect(next);
          setDay(next);
        }}
      />
    );
  }
  const view = render(<Bar start={weekStart} />);
  return { onSelect, setWeekStart: (start: WeekStart) => view.rerender(<Bar start={start} />) };
}

describe('WeekBar', () => {
  it('draws 53 pages of seven days, the current week last and no week after it', () => {
    renderBar();
    expect(pages()).toHaveLength(53);
    expect(pages().every((page) => daysOf(page).length === 7)).toBe(true);
    expect(daysOf(pages()[52])).toEqual([
      '2026-10-26',
      '2026-10-27',
      '2026-10-28',
      '2026-10-29',
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
    ]);
    expect(daysOf(pages()[0])[0]).toBe('2025-10-27');
    expect(oldestDay(TODAY, 'mon')).toBe('2025-10-27');
    expect(document.querySelector('[data-day="2026-11-02"]')).toBeNull();
  });

  it('shows Monday first by default and Sunday first with a Sunday start', () => {
    const { setWeekStart } = renderBar();
    expect(tile('2026-10-26')).toHaveAccessibleName('Monday, October 26, 2026');
    expect(tile('2026-10-26')).toHaveTextContent(/^M26$/);
    expect(daysOf(pages()[52])[0]).toBe('2026-10-26');

    setWeekStart('sun');
    expect(pages()).toHaveLength(53);
    expect(daysOf(pages()[52])[0]).toBe('2026-10-25');
    expect(daysOf(pages()[52])[6]).toBe('2026-10-31');
    expect(tile('2026-10-25')).toHaveTextContent(/^S25$/);
    expect(oldestDay(TODAY, 'sun')).toBe('2025-10-26');
  });

  it('shows the days after today but never selects them: tomorrow is disabled (ACC-F1-2, D-16.36)', () => {
    const { onSelect } = renderBar();
    for (const day of ['2026-10-27', '2026-10-28', '2026-11-01']) {
      expect(tile(day)).toBeDisabled();
    }
    expect(tile(TODAY)).toBeEnabled();

    fireEvent.click(tile('2026-10-27'));
    tile('2026-10-27').focus();
    expect(onSelect).not.toHaveBeenCalled();
    expect(tile('2026-10-27')).not.toHaveFocus();
    expect(tile(TODAY)).toHaveAttribute('aria-checked', 'true');
  });

  it('selects a tapped day: last Monday', () => {
    const { onSelect } = renderBar();
    fireEvent.click(tile('2026-10-19'));
    expect(onSelect).toHaveBeenCalledExactlyOnceWith('2026-10-19');
    expect(tile('2026-10-19')).toHaveAttribute('aria-checked', 'true');
  });

  it('rings today while another day is selected, and fills the selected one', () => {
    renderBar({ selected: '2026-10-24' });
    expect(tile(TODAY)).toHaveAttribute('aria-current', 'date');
    expect(tile(TODAY)).toHaveAttribute('aria-checked', 'false');
    expect(tile('2026-10-24')).toHaveAttribute('aria-checked', 'true');
    expect(tile('2026-10-24')).not.toHaveAttribute('aria-current');
    expect(screen.getAllByRole('radio', { checked: true })).toEqual([tile('2026-10-24')]);
  });

  it("opens on the selected day's week at once, then follows the selection into another week", () => {
    renderBar({ selected: '2026-10-24' });
    expect(scrollTo).toHaveBeenCalledExactlyOnceWith({ left: 51 * WIDTH, behavior: 'instant' });
    expect(strip().scrollLeft).toBe(51 * WIDTH);

    // A day in the same week: the strip stays.
    fireEvent.click(tile('2026-10-22'));
    expect(scrollTo).toHaveBeenCalledTimes(1);

    // Into the current week: the strip moves with its own (smooth, unless reduced) behaviour.
    fireEvent.click(tile(TODAY));
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 52 * WIDTH, behavior: 'auto' });
    expect(strip().scrollLeft).toBe(52 * WIDTH);
  });

  it('goes back to the current week when the first weekday changes, keeping the selection', () => {
    const { setWeekStart } = renderBar({ selected: '2026-10-12' });
    expect(strip().scrollLeft).toBe(50 * WIDTH);

    setWeekStart('sun');
    expect(strip().scrollLeft).toBe(52 * WIDTH);
    expect(tile('2026-10-12')).toHaveAttribute('aria-checked', 'true');
  });

  it('moves a day at a time with the arrow keys, across weeks and never past today', () => {
    const { onSelect } = renderBar();
    expect(tile(TODAY)).toHaveAttribute('tabindex', '0');
    tile(TODAY).focus();

    fireEvent.keyDown(tile(TODAY), { key: 'ArrowLeft' });
    expect(onSelect).toHaveBeenLastCalledWith('2026-10-25');
    expect(tile('2026-10-25')).toHaveFocus();
    expect(tile('2026-10-25')).toHaveAttribute('tabindex', '0');
    expect(tile(TODAY)).toHaveAttribute('tabindex', '-1');
    // Sunday is in last week's page.
    expect(strip().scrollLeft).toBe(51 * WIDTH);

    fireEvent.keyDown(tile('2026-10-25'), { key: 'ArrowUp' });
    expect(tile('2026-10-24')).toHaveFocus();
    fireEvent.keyDown(tile('2026-10-24'), { key: 'ArrowDown' });
    fireEvent.keyDown(tile('2026-10-25'), { key: 'ArrowRight' });
    expect(tile(TODAY)).toHaveFocus();
    expect(strip().scrollLeft).toBe(52 * WIDTH);

    onSelect.mockClear();
    fireEvent.keyDown(tile(TODAY), { key: 'ArrowRight' });
    expect(onSelect).not.toHaveBeenCalled();
    expect(tile(TODAY)).toHaveFocus();
  });

  it('stops the arrow keys at the oldest day of the bar', () => {
    const { onSelect } = renderBar({ selected: '2025-10-27' });
    tile('2025-10-27').focus();
    fireEvent.keyDown(tile('2025-10-27'), { key: 'ArrowLeft' });
    expect(onSelect).not.toHaveBeenCalled();
    expect(strip().scrollLeft).toBe(0);
  });
});

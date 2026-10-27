import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { DayKey } from '../../domain/dates/dayKey';
import { DaySwipe, readSwipe } from './DaySwipe';

/** Monday 26 October 2026. */
const TODAY = '2026-10-26';
const OLDEST = '2025-10-27';

/** The swipe over a stand-in summary with one control in it. */
function renderSwipe(day: DayKey = TODAY) {
  const onChange = vi.fn();
  const onTap = vi.fn();
  render(
    <DaySwipe day={day} latest={TODAY} earliest={OLDEST} onChange={onChange}>
      <button type="button" onClick={onTap}>
        Summary
      </button>
    </DaySwipe>,
  );
  const region = document.querySelector<HTMLElement>('[data-ui="home.swipe"]');
  if (!region) throw new Error('No swipe region');
  return { region, onChange, onTap };
}

/** Presses on `region`, moves `dx`, `dy` px in four steps, and lets go. */
function swipe(region: HTMLElement, dx: number, dy = 0, pointerId = 1) {
  const x = 200;
  const y = 120;
  fireEvent.pointerDown(region, { pointerId, clientX: x, clientY: y, button: 0 });
  for (let step = 1; step <= 4; step++) {
    const share = step / 4;
    fireEvent.pointerMove(region, { pointerId, clientX: x + dx * share, clientY: y + dy * share });
  }
  fireEvent.pointerUp(region, { pointerId, clientX: x + dx, clientY: y + dy, button: 0 });
}

describe('readSwipe', () => {
  it.each([
    [100, 0, -1],
    [-100, 0, 1],
    [80, 0, -1],
    [79, 0, 0],
    [60, 0, 0],
    [100, 66, -1],
    [100, 67, 0],
    [-120, -80, 0],
    [0, 200, 0],
  ])('reads a move of %s, %s px as %s', (dx, dy, expected) => {
    expect(readSwipe(dx, dy)).toBe(expected);
  });
});

describe('DaySwipe', () => {
  it('shows yesterday after a swipe of 100 px toward the right (ACC-F2-1)', () => {
    const { region, onChange } = renderSwipe();
    swipe(region, 100);
    expect(onChange).toHaveBeenCalledExactlyOnceWith('2026-10-25');
  });

  it('does nothing for a swipe of 60 px', () => {
    const { region, onChange } = renderSwipe('2026-10-20');
    swipe(region, 60);
    swipe(region, -60);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('ignores a diagonal swipe that is not clearly sideways', () => {
    const { region, onChange } = renderSwipe('2026-10-20');
    swipe(region, 100, 80);
    swipe(region, -120, -90);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('never moves past today: a swipe toward the left on today does nothing (ACC-F2-1)', () => {
    const { region, onChange } = renderSwipe();
    swipe(region, -150);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('shows the next day after a swipe toward the left, up to today', () => {
    const { region, onChange } = renderSwipe('2026-10-25');
    swipe(region, -100, 20);
    expect(onChange).toHaveBeenCalledExactlyOnceWith(TODAY);
  });

  it('stops at the oldest day of the week bar', () => {
    const { region, onChange } = renderSwipe(OLDEST);
    swipe(region, 150);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('keeps the click that ends a swipe from the summary, and lets a plain tap through', () => {
    const { region, onChange, onTap } = renderSwipe();
    const control = screen.getByRole('button', { name: 'Summary' });
    swipe(region, 100);
    fireEvent.click(control);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onTap).not.toHaveBeenCalled();

    fireEvent.pointerDown(region, { pointerId: 2, clientX: 50, clientY: 50, button: 0 });
    fireEvent.pointerUp(region, { pointerId: 2, clientX: 52, clientY: 51, button: 0 });
    fireEvent.click(control);
    expect(onTap).toHaveBeenCalledTimes(1);
  });

  it('forgets a press the browser took over for scrolling', () => {
    const { region, onChange } = renderSwipe();
    fireEvent.pointerDown(region, { pointerId: 1, clientX: 200, clientY: 120, button: 0 });
    fireEvent.pointerCancel(region, { pointerId: 1 });
    fireEvent.pointerUp(region, { pointerId: 1, clientX: 300, clientY: 120, button: 0 });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('ignores a press with another mouse button, and a second finger', () => {
    const { region, onChange } = renderSwipe();
    fireEvent.pointerDown(region, { pointerId: 1, clientX: 200, clientY: 120, button: 2 });
    fireEvent.pointerUp(region, { pointerId: 1, clientX: 320, clientY: 120, button: 2 });
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.pointerDown(region, { pointerId: 1, clientX: 200, clientY: 120, button: 0 });
    fireEvent.pointerDown(region, { pointerId: 2, clientX: 100, clientY: 120, button: 0 });
    fireEvent.pointerUp(region, { pointerId: 2, clientX: 220, clientY: 120, button: 0 });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.pointerUp(region, { pointerId: 1, clientX: 320, clientY: 120, button: 0 });
    expect(onChange).toHaveBeenCalledExactlyOnceWith('2026-10-25');
  });

  it('shows the day before after a swipe toward the left on a right-to-left page', () => {
    const { region, onChange } = renderSwipe();
    const real = window.getComputedStyle.bind(window);
    vi.spyOn(window, 'getComputedStyle').mockImplementation((element) => {
      const style = real(element);
      return element === region ? ({ ...style, direction: 'rtl' } as CSSStyleDeclaration) : style;
    });
    swipe(region, -100);
    expect(onChange).toHaveBeenCalledExactlyOnceWith('2026-10-25');
  });
});

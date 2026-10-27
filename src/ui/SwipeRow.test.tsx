import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { display } from '../i18n/en/display';
import { SwipeRow, swipeLimits } from './SwipeRow';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/**
 * user-event on fake timers. Testing Library's async wrapper ends each call on a 0 ms timeout
 * that it advances only through a global `jest`; the stub hands it Vitest's clock.
 */
function setupUser() {
  vi.useFakeTimers();
  vi.stubGlobal('jest', { advanceTimersByTime: (ms: number) => vi.advanceTimersByTime(ms) });
  return userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) });
}

/** A Home-like row of the given width (jsdom lays nothing out, so the width is stubbed). */
function renderRow(
  width = 400,
  props: { deleteLabel?: string; disabled?: boolean; keyboardDelete?: boolean } = {},
) {
  const onRequestDelete = vi.fn();
  const onOpen = vi.fn();
  render(
    <SwipeRow onRequestDelete={onRequestDelete} data-ui="entry-row" {...props}>
      <button type="button" onClick={onOpen}>
        Toast
      </button>
    </SwipeRow>,
  );
  const slide = document.querySelector<HTMLElement>('[data-part="slide"]');
  const strip = document.querySelector<HTMLElement>('[data-part="strip"]');
  if (!slide || !strip) throw new Error('row not drawn');
  vi.spyOn(slide, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, width, 72));
  return { slide, strip, onRequestDelete, onOpen };
}

/** Presses at `from`, moves through each x in `path`, and returns a function that releases. */
function press(slide: HTMLElement, from: number, path: number[], pointerId = 1, y = 30) {
  fireEvent.pointerDown(slide, { pointerId, clientX: from, clientY: y, button: 0 });
  for (const x of path) fireEvent.pointerMove(slide, { pointerId, clientX: x, clientY: y });
  const last = path[path.length - 1] ?? from;
  return () => fireEvent.pointerUp(slide, { pointerId, clientX: last, clientY: y, button: 0 });
}

describe('swipeLimits', () => {
  it.each([
    [400, 288, 220],
    [360, 259.2, 216],
    [300, 216, 180],
    [0, 0, 0],
    [Number.NaN, 0, 0],
  ])('lets a %s px row slide %s px and asks past %s px', (width, travel, threshold) => {
    const limits = swipeLimits(width);
    expect(limits.travel).toBeCloseTo(travel, 10);
    expect(limits.threshold).toBeCloseTo(threshold, 10);
  });

  it('keeps the threshold within reach of the travel at every width', () => {
    for (let width = 1; width <= 1200; width += 7) {
      const { travel, threshold } = swipeLimits(width);
      expect(threshold).toBeLessThan(travel);
    }
  });
});

describe('SwipeRow', () => {
  it('asks for the delete once on a release past the threshold, then springs back', () => {
    const { slide, strip, onRequestDelete } = renderRow(400);
    const release = press(slide, 350, [330, 200, 100]);
    expect(slide.style.transform).toBe('translateX(-250px)');
    expect(strip.style.width).toBe('250px');
    expect(slide).toHaveAttribute('data-dragging', 'true');

    release();
    expect(onRequestDelete).toHaveBeenCalledTimes(1);
    expect(slide.style.transform).toBe('');
    expect(strip.style.width).toBe('');
    expect(slide).not.toHaveAttribute('data-dragging');

    // A stray second release does not ask again.
    fireEvent.pointerUp(slide, { pointerId: 1, clientX: 100, clientY: 30, button: 0 });
    expect(onRequestDelete).toHaveBeenCalledTimes(1);
  });

  it('drops a text selection the press made once the move turns into a swipe', () => {
    const { slide } = renderRow(400);
    const selection = window.getSelection();
    selection?.selectAllChildren(slide);
    expect(selection?.toString()).toBe('Toast');
    press(slide, 350, [345])();
    expect(selection?.toString()).toBe('Toast');
    press(slide, 350, [300])();
    expect(selection?.rangeCount).toBe(0);
  });

  it('springs back without asking on a short release', () => {
    const { slide, onRequestDelete } = renderRow(400);
    const release = press(slide, 350, [300, 250]);
    expect(slide.style.transform).toBe('translateX(-100px)');
    release();
    expect(onRequestDelete).not.toHaveBeenCalled();
    expect(slide.style.transform).toBe('');
  });

  it('stops the slide at 72 % of the width', () => {
    const { slide, strip, onRequestDelete } = renderRow(400);
    const release = press(slide, 390, [300, 0, -200]);
    expect(slide.style.transform).toBe('translateX(-288px)');
    expect(strip.style.width).toBe('288px');
    release();
    expect(onRequestDelete).toHaveBeenCalledTimes(1);
  });

  it('asks at 60 % of a row too narrow for the fixed threshold', () => {
    const short = renderRow(300);
    press(short.slide, 290, [250, 120])();
    expect(short.onRequestDelete).not.toHaveBeenCalled();
    press(short.slide, 290, [250, 105])();
    expect(short.onRequestDelete).toHaveBeenCalledTimes(1);
  });

  it('never slides on a mostly vertical move, so the page can scroll', () => {
    const { slide, onRequestDelete } = renderRow(400);
    fireEvent.pointerDown(slide, { pointerId: 1, clientX: 300, clientY: 20, button: 0 });
    fireEvent.pointerMove(slide, { pointerId: 1, clientX: 288, clientY: 60 });
    fireEvent.pointerMove(slide, { pointerId: 1, clientX: 50, clientY: 70 });
    expect(slide.style.transform).toBe('');
    fireEvent.pointerUp(slide, { pointerId: 1, clientX: 50, clientY: 70, button: 0 });
    expect(onRequestDelete).not.toHaveBeenCalled();
  });

  it('ignores a drag away from the leading edge and a jitter under the slop', () => {
    const { slide, onRequestDelete } = renderRow(400);
    const away = press(slide, 100, [104, 300]);
    expect(slide.style.transform).toBe('');
    away();
    const jitter = press(slide, 200, [195, 193]);
    expect(slide.style.transform).toBe('');
    jitter();
    expect(onRequestDelete).not.toHaveBeenCalled();
  });

  it('springs back without asking when the pointer is cancelled', () => {
    const { slide, onRequestDelete } = renderRow(400);
    press(slide, 350, [100]);
    fireEvent.pointerCancel(slide, { pointerId: 1 });
    expect(slide.style.transform).toBe('');
    fireEvent.pointerUp(slide, { pointerId: 1, clientX: 100, clientY: 30, button: 0 });
    expect(onRequestDelete).not.toHaveBeenCalled();
  });

  it('follows only the first pointer', () => {
    const { slide, onRequestDelete } = renderRow(400);
    press(slide, 350, [300], 1);
    fireEvent.pointerDown(slide, { pointerId: 2, clientX: 200, clientY: 30, button: 0 });
    fireEvent.pointerMove(slide, { pointerId: 2, clientX: 0, clientY: 30 });
    expect(slide.style.transform).toBe('translateX(-50px)');
    fireEvent.pointerUp(slide, { pointerId: 2, clientX: 0, clientY: 30, button: 0 });
    expect(slide.style.transform).toBe('translateX(-50px)');
    fireEvent.pointerUp(slide, { pointerId: 1, clientX: 300, clientY: 30, button: 0 });
    expect(slide.style.transform).toBe('');
    expect(onRequestDelete).not.toHaveBeenCalled();
  });

  it("keeps the click that ends a swipe from reaching the row's own action", () => {
    const { slide, onOpen } = renderRow(400);
    press(slide, 350, [250])();
    fireEvent.click(screen.getByRole('button', { name: 'Toast' }));
    expect(onOpen).not.toHaveBeenCalled();
    // A plain tap afterwards works again.
    fireEvent.pointerDown(slide, { pointerId: 3, clientX: 200, clientY: 30, button: 0 });
    fireEvent.pointerUp(slide, { pointerId: 3, clientX: 200, clientY: 30, button: 0 });
    fireEvent.click(screen.getByRole('button', { name: 'Toast' }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('swipes toward the right on a right-to-left page', () => {
    const { slide, onRequestDelete } = renderRow(400);
    const real = window.getComputedStyle.bind(window);
    vi.spyOn(window, 'getComputedStyle').mockImplementation((element) => {
      const style = real(element);
      return element === slide ? ({ ...style, direction: 'rtl' } as CSSStyleDeclaration) : style;
    });
    const release = press(slide, 50, [100, 300]);
    expect(slide.style.transform).toBe('translateX(250px)');
    release();
    expect(onRequestDelete).toHaveBeenCalledTimes(1);
  });

  it('offers a delete button to the keyboard that shows itself and asks once', async () => {
    const user = setupUser();
    const { onRequestDelete } = renderRow(400, { deleteLabel: 'Delete Toast' });
    const row = document.querySelector('[data-ui="entry-row"]');

    await user.tab();
    expect(screen.getByRole('button', { name: 'Toast' })).toHaveFocus();
    expect(row).not.toHaveAttribute('data-revealed');

    await user.tab();
    const remove = screen.getByRole('button', { name: 'Delete Toast' });
    expect(remove).toHaveFocus();
    expect(remove).toHaveAttribute('data-ui', 'entry-row.delete');
    expect(row).toHaveAttribute('data-revealed', 'true');

    await user.keyboard('{Enter}');
    expect(onRequestDelete).toHaveBeenCalledTimes(1);

    await user.tab({ shift: true });
    expect(row).not.toHaveAttribute('data-revealed');
  });

  it('neither swipes nor offers the delete button when disabled', () => {
    const { slide, onRequestDelete, onOpen } = renderRow(400, { disabled: true });
    press(slide, 350, [300, 100])();
    expect(slide.style.transform).toBe('');
    expect(onRequestDelete).not.toHaveBeenCalled();
    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual(['Toast']);
    // The row's own tap still works.
    fireEvent.click(screen.getByRole('button', { name: 'Toast' }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('leaves its keyboard delete button out where the content shows its own, and still swipes (P10-07)', () => {
    const { slide, onRequestDelete } = renderRow(400, {
      deleteLabel: 'Delete Toast',
      keyboardDelete: false,
    });
    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual(['Toast']);
    expect(document.querySelector('[data-ui="entry-row.delete"]')).toBeNull();

    press(slide, 350, [300, 100])();
    expect(onRequestDelete).toHaveBeenCalledTimes(1);
  });

  it('names the delete button from the catalogue by default', () => {
    renderRow(400);
    expect(
      screen.getByRole('button', { name: display.display.swipeRow.delete }),
    ).toBeInTheDocument();
  });
});

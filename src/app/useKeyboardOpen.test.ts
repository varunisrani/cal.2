import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  isTextField,
  KEYBOARD_OPEN_PX,
  keyboardOpen,
  useKeyboardOpen,
  type LayoutSize,
  type OpenViewport,
} from './useKeyboardOpen';

/** A phone's view (a Pixel 7's, 412 × 839) that the test makes room in, as a keyboard would. */
function fakeScreen(width = 412, height = 839) {
  let size: LayoutSize = { width, height };
  const viewport = Object.assign(new EventTarget(), { height, scale: 1 });
  return {
    viewport: viewport as OpenViewport,
    layout: (): LayoutSize => size,
    /** The Android app: the whole view is resized, the visual viewport with it. */
    resizeView(next: Partial<LayoutSize>): void {
      act(() => {
        size = { ...size, ...next };
        viewport.height = size.height;
        viewport.scale = 1;
        window.dispatchEvent(new Event('resize'));
        viewport.dispatchEvent(new Event('resize'));
      });
    },
    /** Chrome on a phone: only the visible part changes (the keyboard over it, or a zoom). */
    resizeVisible(visible: number, scale = 1): void {
      act(() => {
        viewport.height = visible;
        viewport.scale = scale;
        viewport.dispatchEvent(new Event('resize'));
      });
    },
  };
}

const placed: HTMLElement[] = [];

/** An element on the page; it goes after the test. */
function place<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
): HTMLElementTagNameMap[K] {
  const element = Object.assign(document.createElement(tag), props);
  document.body.append(element);
  placed.push(element);
  return element;
}

function focus(element: HTMLElement): void {
  act(() => element.focus());
}

afterEach(() => {
  for (const element of placed.splice(0)) element.remove();
});

describe('isTextField (P14)', () => {
  it('takes the fields that bring up the keyboard', () => {
    for (const type of ['text', 'search', 'email', 'number', 'tel', 'url', 'password']) {
      expect(isTextField(place('input', { type })), type).toBe(true);
    }
    expect(isTextField(place('input'))).toBe(true);
    expect(isTextField(place('textarea'))).toBe(true);
  });

  it('leaves out pickers, choices, buttons, and fields that cannot be typed in', () => {
    const others = ['checkbox', 'radio', 'button', 'submit', 'range', 'color', 'file', 'date'];
    for (const type of [...others, 'time', 'datetime-local']) {
      expect(isTextField(place('input', { type })), type).toBe(false);
    }
    expect(isTextField(place('input', { readOnly: true }))).toBe(false);
    expect(isTextField(place('textarea', { disabled: true }))).toBe(false);
    expect(isTextField(place('button'))).toBe(false);
    expect(isTextField(place('div'))).toBe(false);
    expect(isTextField(document.body)).toBe(false);
    expect(isTextField(null)).toBe(false);
  });
});

describe('keyboardOpen (P14)', () => {
  const at = (layoutHeight: number, visibleHeight: number | null = layoutHeight) => ({
    layoutHeight,
    tallest: 839,
    visibleHeight,
  });

  it('needs a focused text field', () => {
    expect(keyboardOpen(false, at(539))).toBe(false);
    expect(keyboardOpen(false, at(839, 539))).toBe(false);
  });

  it('opens when the view is more than 150 px shorter than the tallest it was', () => {
    expect(KEYBOARD_OPEN_PX).toBe(150);
    expect(keyboardOpen(true, at(539))).toBe(true);
    expect(keyboardOpen(true, at(839 - KEYBOARD_OPEN_PX - 1))).toBe(true);
    expect(keyboardOpen(true, at(839 - KEYBOARD_OPEN_PX))).toBe(false);
    expect(keyboardOpen(true, at(839))).toBe(false);
  });

  it('opens when the visible part is more than 150 px shorter than the view', () => {
    expect(keyboardOpen(true, at(839, 539))).toBe(true);
    expect(keyboardOpen(true, at(839, 839 - KEYBOARD_OPEN_PX - 1))).toBe(true);
    expect(keyboardOpen(true, at(839, 839 - KEYBOARD_OPEN_PX))).toBe(false);
  });

  it('goes by the view alone without a visual viewport', () => {
    expect(keyboardOpen(true, at(839, null))).toBe(false);
    expect(keyboardOpen(true, at(539, null))).toBe(true);
  });
});

describe('useKeyboardOpen (P14)', () => {
  it('opens when the view gets 300 px shorter under a focused field, as in the Android app, and closes when it comes back', () => {
    const screen = fakeScreen();
    const { result } = renderHook(() => useKeyboardOpen(screen.viewport, screen.layout));
    focus(place('textarea'));
    expect(result.current).toBe(false);

    screen.resizeView({ height: 539 });
    expect(result.current).toBe(true);

    screen.resizeView({ height: 839 });
    expect(result.current).toBe(false);
  });

  it('opens when only the visible part gets shorter, as in Chrome on a phone', () => {
    const screen = fakeScreen();
    const { result } = renderHook(() => useKeyboardOpen(screen.viewport, screen.layout));
    focus(place('input'));

    screen.resizeVisible(539);
    expect(result.current).toBe(true);

    screen.resizeVisible(839);
    expect(result.current).toBe(false);
  });

  it('stays closed while no text field has the focus', () => {
    const screen = fakeScreen();
    const { result } = renderHook(() => useKeyboardOpen(screen.viewport, screen.layout));
    screen.resizeView({ height: 539 });
    expect(result.current).toBe(false);

    focus(place('input', { type: 'checkbox' }));
    expect(result.current).toBe(false);
    screen.resizeVisible(339);
    expect(result.current).toBe(false);
  });

  it('takes neither the address bar nor a pinch zoom for a keyboard', () => {
    const screen = fakeScreen();
    const { result } = renderHook(() => useKeyboardOpen(screen.viewport, screen.layout));
    focus(place('input'));

    screen.resizeView({ height: 783 });
    expect(result.current).toBe(false);
    screen.resizeView({ height: 839 });
    // Zoomed in twice: half the CSS pixels show, each twice the size.
    screen.resizeVisible(839 / 2, 2);
    expect(result.current).toBe(false);
  });

  it('takes a turn of the phone for a new screen, not a keyboard', () => {
    const screen = fakeScreen();
    const { result } = renderHook(() => useKeyboardOpen(screen.viewport, screen.layout));
    focus(place('input'));

    screen.resizeView({ width: 839, height: 412 });
    expect(result.current).toBe(false);
    // The keyboard in landscape takes about half the height.
    screen.resizeView({ height: 200 });
    expect(result.current).toBe(true);
  });

  it('takes a window made shorter with no field focused for the new full height', () => {
    const screen = fakeScreen();
    const { result } = renderHook(() => useKeyboardOpen(screen.viewport, screen.layout));
    screen.resizeView({ height: 640 });
    focus(place('input'));
    expect(result.current).toBe(false);

    screen.resizeView({ height: 340 });
    expect(result.current).toBe(true);
    screen.resizeView({ height: 640 });
    expect(result.current).toBe(false);
  });

  it('closes as soon as the focus leaves the field, and stays open while it moves to the next', () => {
    const screen = fakeScreen();
    const seen: boolean[] = [];
    renderHook(() => {
      const open = useKeyboardOpen(screen.viewport, screen.layout);
      seen.push(open);
      return open;
    });
    const name = place('input');
    const energy = place('input', { inputMode: 'numeric' });
    focus(name);
    screen.resizeView({ height: 539 });
    expect(seen.at(-1)).toBe(true);

    const before = seen.length;
    focus(energy);
    expect(seen.slice(before)).not.toContain(false);
    expect(seen.at(-1)).toBe(true);

    act(() => energy.blur());
    expect(seen.at(-1)).toBe(false);
  });

  it('brings the focused field into sight when the keyboard opens and when the view changes under it, not on every focus', () => {
    const screen = fakeScreen();
    renderHook(() => useKeyboardOpen(screen.viewport, screen.layout));
    const name = place('input');
    const fibre = place('input');
    const nameInView = vi.fn();
    const fibreInView = vi.fn();
    name.scrollIntoView = nameInView;
    fibre.scrollIntoView = fibreInView;

    focus(fibre);
    expect(fibreInView).not.toHaveBeenCalled();

    screen.resizeView({ height: 539 });
    expect(fibreInView).toHaveBeenCalledTimes(1);
    expect(fibreInView).toHaveBeenLastCalledWith({ block: 'nearest' });

    // The keyboard grew a row of suggestions: the view changed under the field.
    screen.resizeView({ height: 499 });
    expect(fibreInView).toHaveBeenCalledTimes(2);

    // Moving to another field with the keyboard up: the browser shows it, nothing more here.
    focus(name);
    expect(nameInView).not.toHaveBeenCalled();
  });

  it('stops listening when it goes away', () => {
    const screen = fakeScreen();
    const seen: boolean[] = [];
    const { unmount } = renderHook(() => {
      const open = useKeyboardOpen(screen.viewport, screen.layout);
      seen.push(open);
      return open;
    });
    focus(place('input'));
    unmount();
    const renders = seen.length;
    screen.resizeView({ height: 539 });
    expect(seen).toHaveLength(renders);
  });
});

import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  KEYBOARD_MIN_PX,
  keyboardInset,
  useKeyboardInset,
  type KeyboardViewport,
} from './keyboard';

/** A visual viewport the test moves, as the Android WebView's shrinks for the keyboard. */
function fakeViewport(height: number) {
  const viewport = Object.assign(new EventTarget(), { height, offsetTop: 0 });
  const move = (next: number, offsetTop = 0, event = 'resize'): void => {
    act(() => {
      viewport.height = next;
      viewport.offsetTop = offsetTop;
      viewport.dispatchEvent(new Event(event));
    });
  };
  return { viewport: viewport as KeyboardViewport, move };
}

describe('keyboardInset (P13)', () => {
  it('is what the visual viewport leaves uncovered at the bottom of the window', () => {
    expect(keyboardInset(800, { height: 460, offsetTop: 0 })).toBe(340);
    expect(keyboardInset(800, { height: 460, offsetTop: 40 })).toBe(300);
    expect(keyboardInset(800, { height: 459.6, offsetTop: 0 })).toBe(340);
  });

  it('takes less than 120 px for browser bars, not a keyboard', () => {
    expect(KEYBOARD_MIN_PX).toBe(120);
    expect(keyboardInset(800, { height: 800 - KEYBOARD_MIN_PX + 1, offsetTop: 0 })).toBe(0);
    expect(keyboardInset(800, { height: 800 - KEYBOARD_MIN_PX, offsetTop: 0 })).toBe(120);
    expect(keyboardInset(800, { height: 800, offsetTop: 0 })).toBe(0);
  });
});

describe('useKeyboardInset (P13)', () => {
  it('follows the viewport as the keyboard opens, the page scrolls under it, and it closes', () => {
    const { viewport, move } = fakeViewport(800);
    const { result } = renderHook(() => useKeyboardInset(viewport, () => 800));
    expect(result.current).toBe(0);

    move(460);
    expect(result.current).toBe(340);
    move(460, 40, 'scroll');
    expect(result.current).toBe(300);
    move(800);
    expect(result.current).toBe(0);
  });

  it('is 0 without a visual viewport', () => {
    const { result } = renderHook(() => useKeyboardInset(null, () => 800));
    expect(result.current).toBe(0);
  });

  it('stops listening when it goes away', () => {
    const { viewport, move } = fakeViewport(800);
    const seen: number[] = [];
    const { unmount } = renderHook(() => {
      const inset = useKeyboardInset(viewport, () => 800);
      seen.push(inset);
      return inset;
    });
    unmount();
    const renders = seen.length;
    move(400);
    expect(seen).toHaveLength(renders);
  });
});

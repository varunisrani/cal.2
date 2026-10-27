// How much of the window the on-screen keyboard covers, so the Coach's composer can stay just
// above it. Chrome on Android and the Android app's WebView shrink the visual viewport, not the
// window, when the keyboard opens: the covered part is the window's height less the visible
// height and how far the visible part has been scrolled down.

import { useEffect, useState } from 'react';

/** Less than this between the window and the visible area is browser chrome, not a keyboard. */
export const KEYBOARD_MIN_PX = 120;

/** The parts of `window.visualViewport` read here, with events; a test hands in a fake one. */
export interface KeyboardViewport extends Pick<
  EventTarget,
  'addEventListener' | 'removeEventListener'
> {
  readonly height: number;
  readonly offsetTop: number;
}

/** The keyboard's cover in whole px, from the window's height and the visual viewport; 0 for none. */
export function keyboardInset(
  windowHeight: number,
  viewport: Pick<KeyboardViewport, 'height' | 'offsetTop'>,
): number {
  const covered = windowHeight - viewport.height - viewport.offsetTop;
  return covered >= KEYBOARD_MIN_PX ? Math.round(covered) : 0;
}

const browserWindowHeight = (): number => window.innerHeight;

/**
 * The keyboard's cover as it changes; 0 while it is closed or the browser cannot say (no
 * `visualViewport`). `viewport` and `windowHeight` default to the browser's.
 */
export function useKeyboardInset(
  viewport: KeyboardViewport | null | undefined = window.visualViewport,
  windowHeight: () => number = browserWindowHeight,
): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    if (!viewport) return undefined;
    const measure = (): void => setInset(keyboardInset(windowHeight(), viewport));
    measure();
    viewport.addEventListener('resize', measure);
    viewport.addEventListener('scroll', measure);
    return () => {
      viewport.removeEventListener('resize', measure);
      viewport.removeEventListener('scroll', measure);
    };
  }, [viewport, windowHeight]);

  return inset;
}

// Whether the on-screen keyboard is open (P14), so the shell can put the tab bar away while the
// person types. Browsers do not say so directly; two signs tell, one per way of making room:
// the Android app's WebView is resized to end at the keyboard (the layout viewport gets shorter),
// while Chrome on a phone draws the keyboard over the page (only the visual viewport gets
// shorter). Either counts only while a field that takes typing has the focus, so a window made
// smaller by hand never hides the bar.

import { useEffect, useState } from 'react';

/** A drop smaller than this (px) is browser chrome, such as the address bar, not a keyboard. */
export const KEYBOARD_OPEN_PX = 150;

/** Input types that open a picker or nothing, never the keyboard. */
const NO_KEYBOARD_INPUTS = new Set([
  'button',
  'checkbox',
  'color',
  'date',
  'datetime-local',
  'file',
  'hidden',
  'image',
  'month',
  'radio',
  'range',
  'reset',
  'submit',
  'time',
  'week',
]);

/** True for an element that takes typing: a text-like input, a text area, editable content. */
export function isTextField(element: Element | null): element is HTMLElement {
  if (element instanceof HTMLTextAreaElement) return !element.readOnly && !element.disabled;
  if (element instanceof HTMLInputElement) {
    return !NO_KEYBOARD_INPUTS.has(element.type) && !element.readOnly && !element.disabled;
  }
  // `=== true`: some environments (jsdom) leave `isContentEditable` undefined.
  return element instanceof HTMLElement && element.isContentEditable === true;
}

/** The viewport's heights, in CSS px, at one moment. */
export interface ViewportSample {
  /** The layout viewport's height (the window's inner height). */
  readonly layoutHeight: number;
  /**
   * The view's full height: the tallest layout height since the width last changed or the view
   * last changed size with no field focused.
   */
  readonly tallest: number;
  /** The visual viewport's height at its zoom (height × scale); null without one. */
  readonly visibleHeight: number | null;
}

/** Whether the keyboard is open: a text field has the focus and the view lost room to it. */
export function keyboardOpen(fieldFocused: boolean, sample: ViewportSample): boolean {
  if (!fieldFocused) return false;
  if (sample.tallest - sample.layoutHeight > KEYBOARD_OPEN_PX) return true;
  return (
    sample.visibleHeight !== null && sample.layoutHeight - sample.visibleHeight > KEYBOARD_OPEN_PX
  );
}

/** The parts of `window.visualViewport` read here, with its events; a test hands in a fake. */
export interface OpenViewport extends Pick<
  EventTarget,
  'addEventListener' | 'removeEventListener'
> {
  readonly height: number;
  readonly scale?: number;
}

/** The layout viewport's size. */
export interface LayoutSize {
  readonly width: number;
  readonly height: number;
}

const windowLayout = (): LayoutSize => ({ width: window.innerWidth, height: window.innerHeight });

/** Brings a field into sight by the shortest scroll; nothing where the browser cannot. */
function reveal(field: HTMLElement): void {
  if (typeof field.scrollIntoView === 'function') field.scrollIntoView({ block: 'nearest' });
}

interface KeyboardState {
  readonly open: boolean;
  /** The layout height while open (0 while closed), so a change under the keyboard re-renders. */
  readonly height: number;
}

const CLOSED: KeyboardState = { open: false, height: 0 };

/**
 * True while the on-screen keyboard is open. When it opens, and when the view's height changes
 * under it, the focused field is scrolled into sight (after the render, so the shell's own change
 * of layout is in place): a sheet's field near its bottom is not left under the keyboard.
 * `viewport` and `layout` default to the browser's.
 */
export function useKeyboardOpen(
  viewport: OpenViewport | null | undefined = window.visualViewport,
  layout: () => LayoutSize = windowLayout,
): boolean {
  const [state, setState] = useState<KeyboardState>(CLOSED);

  useEffect(() => {
    let width = Number.NaN;
    let tallest = 0;

    /**
     * Reads the view with `focused` as the element that has (or is about to get) the focus;
     * `resized` when the view's size is what changed.
     */
    const measure = (focused: Element | null, resized: boolean): void => {
      const size = layout();
      const typing = isTextField(focused);
      // A new width (the phone turned, a new window) or a new size with no field focused (a
      // window resized by hand) is a new full height: only a drop while a field has the focus
      // can be the keyboard.
      if (size.width !== width || (resized && !typing)) {
        width = size.width;
        tallest = size.height;
      } else {
        tallest = Math.max(tallest, size.height);
      }
      const visibleHeight = viewport ? viewport.height * (viewport.scale ?? 1) : null;
      const open = keyboardOpen(typing, { layoutHeight: size.height, tallest, visibleHeight });
      const next = open ? { open, height: size.height } : CLOSED;
      setState((now) => (now.open === next.open && now.height === next.height ? now : next));
    };

    const onResize = (): void => measure(document.activeElement, true);
    const onFocusIn = (): void => measure(document.activeElement, false);
    // Leaving one field for the next: the next one counts, so the bar does not flash back.
    const onFocusOut = (event: FocusEvent): void =>
      measure(event.relatedTarget instanceof Element ? event.relatedTarget : null, false);

    measure(document.activeElement, true);
    window.addEventListener('resize', onResize);
    viewport?.addEventListener('resize', onResize);
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    return () => {
      window.removeEventListener('resize', onResize);
      viewport?.removeEventListener('resize', onResize);
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
    };
  }, [viewport, layout]);

  useEffect(() => {
    if (!state.open) return;
    const field = document.activeElement;
    if (isTextField(field)) reveal(field);
  }, [state]);

  return state.open;
}

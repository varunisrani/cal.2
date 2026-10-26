import { useLayoutEffect, type KeyboardEvent, type RefObject } from 'react';

/** Everything that can take focus from the keyboard, before the tab-index filter. */
const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'iframe',
  '[contenteditable]:not([contenteditable="false"])',
  '[tabindex]',
].join(',');

/** The elements Tab reaches inside `root`, in document order. */
export function tabStopsIn(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) => el.tabIndex >= 0 && el.closest('[hidden], [inert]') === null,
  );
}

export interface ModalFocusOptions {
  /** What Escape does; without it Escape is swallowed and nothing closes. */
  readonly onEscape?: () => void;
  /** Takes focus on open instead of the panel itself. */
  readonly initialFocusRef?: RefObject<HTMLElement | null>;
}

/**
 * Focus handling for a modal panel that is mounted while it is open (Sheet, Dialog): on mount
 * focus moves into the panel, on unmount it returns to the element that had it before, if that
 * element is still on the page. The returned key handler goes on the panel: Tab and Shift+Tab
 * wrap inside it, Escape calls `onEscape`. Both keys stop there, so a modal opened from inside
 * another (their React trees nest through the portal) never moves the outer one.
 */
export function useModalFocus(
  panelRef: RefObject<HTMLElement | null>,
  { onEscape, initialFocusRef }: ModalFocusOptions = {},
): (event: KeyboardEvent<HTMLElement>) => void {
  useLayoutEffect(() => {
    const before = document.activeElement;
    const target = initialFocusRef?.current ?? panelRef.current;
    target?.focus({ preventScroll: true });
    return () => {
      if (before instanceof HTMLElement && before.isConnected) {
        before.focus({ preventScroll: true });
      }
    };
    // Mount and unmount only: the panel opens once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (event) => {
    const panel = panelRef.current;
    if (!panel) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onEscape?.();
      return;
    }
    if (event.key !== 'Tab') return;
    event.stopPropagation();
    const stops = tabStopsIn(panel);
    const first = stops[0];
    const last = stops[stops.length - 1];
    const active = document.activeElement;
    if (!first || !last) {
      event.preventDefault();
      panel.focus();
      return;
    }
    // From the panel itself (where focus starts) or from outside, Tab enters at an end.
    const onAStop = active instanceof Node && active !== panel && panel.contains(active);
    const edge = event.shiftKey ? first : last;
    if (!onAStop || active === edge) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    }
  };
}

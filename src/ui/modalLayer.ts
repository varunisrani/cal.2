import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';

/**
 * The modal layer under every Sheet and Dialog. While a layer is open:
 * - it is the only part of the page that can be reached: every other child of <body> is made
 *   `inert`, except elements marked `data-layer-keep` (the toast region, so a toast raised from
 *   a sheet is still announced);
 * - Tab and Shift+Tab wrap inside its panel;
 * - Escape goes to the top layer only, so a dialog opened from a sheet closes first;
 * - the page behind it does not scroll.
 * When it closes, focus goes back to the element that had it when the layer opened.
 *
 * A layer's root must be a direct child of <body> (Sheet and Dialog portal into it), so the
 * inert marks can be set on its siblings.
 */

/** Open layers, bottom first. */
const stack: HTMLElement[] = [];

/** The elements this module made inert, so it never clears an `inert` someone else set. */
const madeInert = new Set<Element>();

/** The page's own `overflow` while a layer holds it, `null` when no layer is open. */
let savedOverflow: string | null = null;

const TABBABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[contenteditable="true"]',
  '[tabindex]',
].join(', ');

function topLayer(): HTMLElement | undefined {
  return stack[stack.length - 1];
}

/** Brings the inert marks and the scroll lock in line with the stack. */
function syncBackground(): void {
  const top = topLayer();
  for (const element of [...madeInert]) {
    if (top && element !== top && element.isConnected) continue;
    element.removeAttribute('inert');
    madeInert.delete(element);
  }
  const page = document.documentElement;
  if (!top) {
    if (savedOverflow !== null) page.style.overflow = savedOverflow;
    savedOverflow = null;
    return;
  }
  if (savedOverflow === null) {
    savedOverflow = page.style.overflow;
    page.style.overflow = 'hidden';
  }
  for (const child of Array.from(document.body.children)) {
    if (child === top || child.hasAttribute('inert') || child.hasAttribute('data-layer-keep')) {
      continue;
    }
    child.setAttribute('inert', '');
    madeInert.add(child);
  }
}

function tabbables(panel: HTMLElement): HTMLElement[] {
  return Array.from(panel.querySelectorAll<HTMLElement>(TABBABLE)).filter(
    (element) => element.tabIndex >= 0 && !element.closest('[inert], [hidden]'),
  );
}

/**
 * Wraps Tab at the panel's edges. Inside, the browser moves focus as usual; we step in only
 * where it would leave the panel, or when focus is not in the panel at all.
 */
function keepTabInside(event: KeyboardEvent, panel: HTMLElement): void {
  const items = tabbables(panel);
  const first = items[0];
  const last = items[items.length - 1];
  if (!first || !last) {
    event.preventDefault();
    panel.focus();
    return;
  }
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || !panel.contains(active)) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
  } else if (event.shiftKey && (active === first || active === panel)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
}

export interface ModalLayerOptions {
  /** Called for Escape while this layer is on top; without it Escape does nothing. */
  readonly onEscape?: () => void;
  /** Where focus goes when the layer opens; the panel itself by default. */
  readonly initialFocus?: RefObject<HTMLElement | null>;
}

/**
 * Makes `root` a modal layer for as long as the calling component is mounted. `panel` is the
 * element that holds focus (it needs `tabIndex={-1}`).
 */
export function useModalLayer(
  root: RefObject<HTMLElement | null>,
  panel: RefObject<HTMLElement | null>,
  options: ModalLayerOptions,
): void {
  const latest = useRef(options);
  useLayoutEffect(() => {
    latest.current = options;
  });

  useEffect(() => {
    const rootElement = root.current;
    const panelElement = panel.current;
    if (!rootElement || !panelElement) return undefined;
    const opener = document.activeElement;

    stack.push(rootElement);
    syncBackground();
    (latest.current.initialFocus?.current ?? panelElement).focus({ preventScroll: true });

    const onKeyDown = (event: KeyboardEvent): void => {
      if (topLayer() !== rootElement || event.defaultPrevented) return;
      if (event.key === 'Escape') {
        const onEscape = latest.current.onEscape;
        if (!onEscape) return;
        event.preventDefault();
        onEscape();
      } else if (event.key === 'Tab') {
        keepTabInside(event, panelElement);
      }
    };
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      const at = stack.lastIndexOf(rootElement);
      if (at !== -1) stack.splice(at, 1);
      syncBackground();
      if (opener instanceof HTMLElement && opener.isConnected)
        opener.focus({ preventScroll: true });
    };
  }, [root, panel]);
}

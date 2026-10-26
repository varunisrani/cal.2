// What both charts need from the page: their measured width, and presses on the plot read as a
// tap, a sideways scrub, or the start of a page scroll.

import {
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';
import { isClearlyHorizontal } from '../../domain/progress/chartMath';

/** The plot's height in px. */
export const PLOT_HEIGHT = 190;
/** The band under the plot that holds the date labels. */
export const DATE_BAND = 22;
/** The column right of the plot that holds the value labels. */
export const TICK_COLUMN = 44;
/** The plot's corner radius. */
export const PLOT_RADIUS = 10;

/** The element's width in px, followed as it resizes; 0 until it has been measured. */
export function useMeasuredWidth<T extends HTMLElement>(): readonly [RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => setWidth(element.getBoundingClientRect().width);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

/** Travel in px before a press is read as a drag at all. */
const DRAG_START = 6;

/** One press on the plot. It lives in a ref: moving the pointer never renders by itself. */
interface Press {
  readonly pointerId: number;
  readonly startX: number;
  readonly startY: number;
  /** The plot's left edge on screen when the press began. */
  readonly left: number;
  /** Not moved yet, scrubbing sideways, or a scroll the chart stays out of. */
  kind: 'still' | 'scrub' | 'scroll';
}

export interface PlotGestureCallbacks {
  /** A clearly sideways drag is at `x`, in px from the plot's left edge, kept inside the plot. */
  readonly onScrub: (x: number) => void;
  /** A drag that scrubbed was released or cancelled. */
  readonly onScrubEnd: () => void;
  /** A press was released before it moved, at `x` in plot px. */
  readonly onTap?: (x: number) => void;
}

type PlotPointerHandler = (event: ReactPointerEvent<HTMLElement>) => void;

export interface PlotGestureHandlers {
  readonly onPointerDown: PlotPointerHandler;
  readonly onPointerMove: PlotPointerHandler;
  readonly onPointerUp: PlotPointerHandler;
  readonly onPointerCancel: PlotPointerHandler;
}

/**
 * Pointer handlers for a plot `plotWidth` px wide. A press that travels decides once, at its
 * first real movement, what it is: clearly sideways (|dx| > 1.5 |dy|) scrubs until it ends;
 * anything else is the page scrolling and is ignored to the end (R05.16). A press released
 * without moving is a tap. The callbacks run only on these events, so the caller decides when
 * to render.
 */
export function usePlotGesture(
  plotWidth: number,
  callbacks: PlotGestureCallbacks,
): PlotGestureHandlers {
  const press = useRef<Press | null>(null);
  const inside = (current: Press, clientX: number) =>
    Math.min(Math.max(clientX - current.left, 0), Math.max(plotWidth, 0));

  const finish = (event: ReactPointerEvent<HTMLElement>, released: boolean) => {
    const current = press.current;
    if (current === null || current.pointerId !== event.pointerId) return;
    press.current = null;
    if (current.kind === 'scrub') callbacks.onScrubEnd();
    else if (current.kind === 'still' && released)
      callbacks.onTap?.(inside(current, event.clientX));
  };

  return {
    onPointerDown: (event) => {
      if (press.current !== null || event.button !== 0) return;
      press.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        left: event.currentTarget.getBoundingClientRect().left,
        kind: 'still',
      };
    },
    onPointerMove: (event) => {
      const current = press.current;
      if (current === null || current.pointerId !== event.pointerId) return;
      if (current.kind === 'still') {
        const dx = event.clientX - current.startX;
        const dy = event.clientY - current.startY;
        if (Math.abs(dx) < DRAG_START && Math.abs(dy) < DRAG_START) return;
        current.kind = isClearlyHorizontal(dx, dy) ? 'scrub' : 'scroll';
        if (current.kind === 'scrub') {
          try {
            event.currentTarget.setPointerCapture(event.pointerId);
          } catch {
            // The pointer is gone already; moves over the plot still arrive.
          }
        }
      }
      if (current.kind === 'scrub') callbacks.onScrub(inside(current, event.clientX));
    },
    onPointerUp: (event) => finish(event, true),
    onPointerCancel: (event) => finish(event, false),
  };
}

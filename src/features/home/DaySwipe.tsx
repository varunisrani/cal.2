import {
  useRef,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { addDays, type DayKey } from '../../domain/dates/dayKey';
import styles from './week.module.css';

/** Sideways travel, in px, a swipe needs before it changes the day. */
export const SWIPE_TRAVEL = 80;
/** How much more sideways than up or down a swipe must be. */
export const SWIPE_RATIO = 1.5;
/** Sideways movement after which a press is treated as a swipe (it keeps the pointer). */
const SLOP = 10;

/**
 * What a press that moved `dx`, `dy` px asks for, in a left-to-right page: 1 for the next day
 * (moved toward the left), -1 for the day before (toward the right), 0 for neither (too short,
 * or not clearly sideways).
 */
export function readSwipe(dx: number, dy: number): -1 | 0 | 1 {
  if (Math.abs(dx) < SWIPE_TRAVEL || Math.abs(dx) <= SWIPE_RATIO * Math.abs(dy)) return 0;
  return dx < 0 ? 1 : -1;
}

/** One press on the region, from pointerdown until it is released or cancelled. */
interface Press {
  readonly pointerId: number;
  readonly startX: number;
  readonly startY: number;
  /** Moved far enough sideways to be a swipe: it holds the pointer and eats the click after. */
  swiping: boolean;
}

export interface DaySwipeProps {
  /** The day shown. */
  readonly day: DayKey;
  /** The last day a swipe may reach: today. */
  readonly latest: DayKey;
  /** The first day a swipe may reach: the week bar's oldest day. */
  readonly earliest: DayKey;
  readonly onChange: (day: DayKey) => void;
  /** The summary the swipe covers. */
  readonly children: ReactNode;
}

/**
 * The day swipe over Home's summary (05 §3.2.1): a sideways swipe toward the leading edge shows
 * the next day, toward the trailing edge the day before. It needs 80 px of sideways travel and
 * must be clearly sideways; up and down stay the page's scroll. It never goes past `latest` or
 * before `earliest`. The diary below is not covered, so its rows keep their own swipe.
 */
export function DaySwipe({ day, latest, earliest, onChange, children }: DaySwipeProps) {
  const press = useRef<Press | null>(null);
  const swallowClick = useRef(false);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (press.current !== null || event.button !== 0) return;
    swallowClick.current = false;
    press.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      swiping: false,
    };
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = press.current;
    if (current === null || current.swiping || event.pointerId !== current.pointerId) return;
    const dx = Math.abs(event.clientX - current.startX);
    if (dx < SLOP || dx <= Math.abs(event.clientY - current.startY)) return;
    current.swiping = true;
    // A mouse press selects text before the move is known to be a swipe; drop that selection.
    window.getSelection()?.removeAllRanges();
    try {
      // Held, so a finger that leaves the card still ends the swipe here.
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // The pointer is already gone; its release may still arrive over the card.
    }
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = press.current;
    if (current === null || event.pointerId !== current.pointerId) return;
    press.current = null;
    const towardNext = readSwipe(event.clientX - current.startX, event.clientY - current.startY);
    if (current.swiping || towardNext !== 0) swallowClick.current = true;
    if (towardNext === 0) return;
    const rtl = getComputedStyle(event.currentTarget).direction === 'rtl';
    const next = addDays(day, rtl ? -towardNext : towardNext);
    if (next > latest || next < earliest) return;
    onChange(next);
  };

  const onPointerCancel = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (press.current?.pointerId === event.pointerId) press.current = null;
  };

  // The click that ends a swipe must not reach a control inside the summary.
  const onClickCapture = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!swallowClick.current) return;
    swallowClick.current = false;
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <div
      className={styles.swipe}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onClickCapture={onClickCapture}
      data-ui="home.swipe"
    >
      {children}
    </div>
  );
}

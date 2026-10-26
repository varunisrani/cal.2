import {
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import styles from './display.module.css';
import { t } from '../i18n/t';
import { Icon } from './icons';

/** Movement in px before a press is read as a swipe or as a scroll. */
const SLOP = 10;
/** The row slides at most this share of its width. */
const TRAVEL_SHARE = 0.72;
/** Releasing this far asks for the delete: 220 px, or 60 % of a narrower row's width. */
const THRESHOLD = 220;
const THRESHOLD_SHARE = 0.6;

/** How far a row of `width` px can slide, and how far it must slide to ask for a delete. */
export function swipeLimits(width: number): { travel: number; threshold: number } {
  const usable = Number.isFinite(width) && width > 0 ? width : 0;
  return {
    travel: usable * TRAVEL_SHARE,
    threshold: Math.min(THRESHOLD, usable * THRESHOLD_SHARE),
  };
}

/** One press on the row, from pointerdown until it is released or read as a scroll. */
interface Gesture {
  readonly pointerId: number;
  readonly startX: number;
  readonly startY: number;
  readonly width: number;
  /** -1 when the leading edge is on the left (left-to-right pages), 1 when it is on the right. */
  readonly towardLeading: -1 | 1;
  swiping: boolean;
}

export interface SwipeRowProps {
  readonly children: ReactNode;
  /**
   * Called once when a swipe is released past the threshold, or the delete button is used. The
   * row deletes nothing itself: the caller confirms, then removes the row.
   */
  readonly onRequestDelete: () => void;
  /** The delete button's name, e.g. "Delete Toast" (default: the catalogue's Delete). */
  readonly deleteLabel?: string;
  /** No swipe and no delete button, e.g. while rows are being picked for a combine. */
  readonly disabled?: boolean;
  /** Extra class for the outer box, e.g. the rounded corners of a first or last row. */
  readonly className?: string;
  /** Hook for the row; the delete button gets `<hook>.delete`. */
  readonly 'data-ui'?: string;
}

/**
 * A diary row that slides toward the leading edge to reveal a delete strip. The slide stops at
 * 72 % of the row's width; letting go past the threshold calls `onRequestDelete` and the row
 * slides back. For the keyboard, a delete button follows the row's content; while it has the
 * focus the row slides aside to show it.
 */
export function SwipeRow({
  children,
  onRequestDelete,
  deleteLabel,
  disabled = false,
  className,
  'data-ui': dataUi,
}: SwipeRowProps) {
  const [slide, setSlide] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [towardLeading, setTowardLeading] = useState<-1 | 1>(-1);
  const gesture = useRef<Gesture | null>(null);
  const swallowClick = useRef(false);

  /** The distance toward the leading edge, clamped to the row's travel. */
  const travelled = (current: Gesture, clientX: number) => {
    const distance = (clientX - current.startX) * current.towardLeading;
    return Math.min(Math.max(distance, 0), swipeLimits(current.width).travel);
  };

  const settle = () => {
    gesture.current = null;
    setDragging(false);
    setSlide(0);
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (disabled || gesture.current !== null || event.button !== 0) return;
    swallowClick.current = false;
    const row = event.currentTarget;
    const direction = getComputedStyle(row).direction === 'rtl' ? 1 : -1;
    gesture.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      width: row.getBoundingClientRect().width,
      towardLeading: direction,
      swiping: false,
    };
    setTowardLeading(direction);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = gesture.current;
    if (current === null || event.pointerId !== current.pointerId) return;
    if (!current.swiping) {
      const dx = Math.abs(event.clientX - current.startX);
      const dy = Math.abs(event.clientY - current.startY);
      if (dx < SLOP && dy < SLOP) return;
      if (dx <= dy) {
        // Mostly vertical: the page scrolls and this press is not a swipe.
        gesture.current = null;
        return;
      }
      current.swiping = true;
      setDragging(true);
      // A mouse press selects text before the move is known to be a swipe; drop that selection.
      window.getSelection()?.removeAllRanges();
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // The pointer is already gone; the moves still arrive on the row while it is under it.
      }
    }
    setSlide(travelled(current, event.clientX));
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = gesture.current;
    if (current === null || event.pointerId !== current.pointerId) return;
    const distance = travelled(current, event.clientX);
    const { threshold } = swipeLimits(current.width);
    settle();
    if (!current.swiping) return;
    swallowClick.current = true;
    if (distance > 0 && distance >= threshold) onRequestDelete();
  };

  const onPointerCancel = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (gesture.current?.pointerId === event.pointerId) settle();
  };

  // The click that ends a swipe must not reach the row's own tap action.
  const onClickCapture = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!swallowClick.current) return;
    swallowClick.current = false;
    event.preventDefault();
    event.stopPropagation();
  };

  const shift = slide * towardLeading;
  return (
    <div
      className={className ? `${styles.swipeRow} ${className}` : styles.swipeRow}
      data-ui={dataUi}
      data-revealed={(revealed && !disabled) || undefined}
    >
      <div
        className={styles.swipeStrip}
        data-part="strip"
        data-dragging={dragging || undefined}
        aria-hidden="true"
        style={slide > 0 ? { width: `${slide}px` } : undefined}
      />
      <div
        className={styles.swipeSlide}
        data-part="slide"
        data-dragging={dragging || undefined}
        style={slide > 0 ? { transform: `translateX(${shift}px)` } : undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onClickCapture={onClickCapture}
      >
        {children}
      </div>
      {disabled ? null : (
        <button
          type="button"
          className={styles.swipeDelete}
          aria-label={deleteLabel ?? t('display.swipeRow.delete')}
          data-ui={dataUi ? `${dataUi}.delete` : undefined}
          onFocus={() => setRevealed(true)}
          onBlur={() => setRevealed(false)}
          onClick={() => onRequestDelete()}
        >
          <Icon name="trash" size={22} />
        </button>
      )}
    </div>
  );
}

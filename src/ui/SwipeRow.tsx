import { useRef, useState, type MouseEvent, type PointerEvent, type ReactNode } from 'react';
import { IconButton } from './Button';
import styles from './display.module.css';
import { Icon } from './icons';
import { clamp, cx, partHook } from './primitives';

/** A release at least this far from rest asks for the delete (or at the cap, if that is less). */
export const SWIPE_DELETE_PX = 220;

/** The row moves at most this share of its own width. */
export const SWIPE_MAX_SHARE = 0.72;

/** Movement up to this is still a tap, or the start of a scroll. */
const SWIPE_SLOP_PX = 8;

/** The strip shows its icon once it is wider than this. */
const STRIP_ICON_PX = 24;

export interface SwipeRowProps {
  /** The root hook; parts get `<hook>.delete` (the button) and `<hook>.strip`. */
  readonly 'data-ui': string;
  /** Names the delete button, e.g. "Delete Oatmeal", so rows on one page stay distinct. */
  readonly deleteLabel: string;
  /**
   * Called after a long enough drag, or a press on the delete button. The row never deletes
   * anything itself: the caller asks for confirmation and deletes.
   */
  readonly onRequestDelete: () => void;
  /**
   * always: the delete button is always drawn. focus: it shows only while the row holds
   * keyboard focus (dense lists); screen readers reach it either way.
   */
  readonly deleteButton?: 'always' | 'focus';
  /** No swipe and no delete button, e.g. while rows are being picked. */
  readonly disabled?: boolean;
  readonly children: ReactNode;
  readonly className?: string;
}

interface Drag {
  readonly pointer: number;
  readonly x: number;
  readonly y: number;
  /** −1 when the leading edge is on the left (left-to-right pages), +1 otherwise. */
  readonly toward: -1 | 1;
  /** The furthest the row may travel, in CSS pixels. */
  readonly limit: number;
  /** The travel at which a release asks for the delete. */
  readonly trigger: number;
  moving: boolean;
}

/**
 * A row that can be dragged toward its leading edge to uncover a delete strip behind it. A
 * release far enough along asks the caller to delete; any release springs the row back. A
 * delete button inside the row offers the same to keyboards and screen readers.
 */
export function SwipeRow({
  'data-ui': hook,
  deleteLabel,
  onRequestDelete,
  deleteButton = 'always',
  disabled = false,
  children,
  className,
}: SwipeRowProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const swallowClick = useRef(false);
  /** Signed offset of the row from rest, in CSS pixels. */
  const [offset, setOffset] = useState(0);
  const [moving, setMoving] = useState(false);

  const travelOf = (current: Drag, clientX: number) =>
    clamp((clientX - current.x) * current.toward, 0, current.limit);

  const settle = () => {
    drag.current = null;
    setMoving(false);
    setOffset(0);
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (disabled || event.button !== 0) return;
    const root = rootRef.current;
    if (!root) return;
    const limit = root.getBoundingClientRect().width * SWIPE_MAX_SHARE;
    drag.current = {
      pointer: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      toward: getComputedStyle(root).direction === 'rtl' ? 1 : -1,
      limit,
      trigger: Math.min(SWIPE_DELETE_PX, limit),
      moving: false,
    };
    swallowClick.current = false;
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current || current.pointer !== event.pointerId) return;
    if (!current.moving) {
      const across = Math.abs(event.clientX - current.x);
      const down = Math.abs(event.clientY - current.y);
      if (down > SWIPE_SLOP_PX && down >= across) {
        // A scroll: the page keeps the gesture.
        drag.current = null;
        return;
      }
      if (across <= SWIPE_SLOP_PX) return;
      current.moving = true;
      setMoving(true);
      event.currentTarget.setPointerCapture?.(event.pointerId);
    }
    setOffset(current.toward * travelOf(current, event.clientX));
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current || current.pointer !== event.pointerId) return;
    settle();
    if (!current.moving) return;
    // The click that follows this release belongs to the drag, not to the row.
    swallowClick.current = true;
    if (current.trigger > 0 && travelOf(current, event.clientX) >= current.trigger) {
      onRequestDelete();
    }
  };

  const onClickCapture = (event: MouseEvent<HTMLDivElement>) => {
    // A click from the keyboard (detail 0) is never the end of a drag.
    if (!swallowClick.current || event.detail === 0) return;
    swallowClick.current = false;
    event.preventDefault();
    event.stopPropagation();
  };

  const uncovered = Math.abs(offset);
  const gestures = disabled
    ? {}
    : {
        onPointerDown,
        onPointerMove,
        onPointerUp,
        onPointerCancel: settle,
        onClickCapture,
      };

  return (
    <div
      ref={rootRef}
      data-ui={hook}
      data-delete={disabled ? undefined : deleteButton}
      className={cx(styles.swipeRow, className)}
    >
      {uncovered > 0 && (
        <div
          className={styles.swipeStrip}
          style={{ inlineSize: `${uncovered}px` }}
          aria-hidden="true"
          data-ui={partHook(hook, 'strip')}
        >
          {uncovered > STRIP_ICON_PX && <Icon name="trash" />}
        </div>
      )}
      <div
        className={styles.swipeContent}
        style={offset === 0 ? undefined : { transform: `translateX(${offset}px)` }}
        data-moving={moving || undefined}
        {...gestures}
      >
        <div className={styles.swipeMain}>{children}</div>
        {!disabled && (
          <IconButton
            label={deleteLabel}
            icon={<Icon name="trash" />}
            variant="quiet"
            data-ui={partHook(hook, 'delete')}
            className={styles.swipeDelete}
            onClick={() => onRequestDelete()}
          />
        )}
      </div>
    </div>
  );
}

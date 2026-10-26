import { useId, useRef, useState, type PointerEvent, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { t } from '../i18n/t';
import { Button } from './Button';
import { useModalFocus } from './modal';
import styles from './primitives.module.css';
import { partHook } from './primitives';

/** How far the title row must be dragged down, in CSS pixels, for the sheet to close. */
export const SHEET_DRAG_CLOSE_PX = 96;

/** Movement below this is still a tap, so the Done button keeps getting its click. */
const DRAG_SLOP_PX = 6;

export interface SheetProps {
  readonly open: boolean;
  /** The visible title; it also names the sheet for screen readers. */
  readonly title: string;
  /** Done, and when dismissable also Escape, a tap on the backdrop and a drag down. */
  readonly onClose: () => void;
  /** The root hook; parts get `<hook>.done` and `<hook>.backdrop`. */
  readonly 'data-ui': string;
  /** false: Escape, the backdrop and the drag do nothing (a review that must not be lost). */
  readonly dismissable?: boolean;
  /** Leaves Done out of the title row, for sheets that close through their own buttons. */
  readonly hideDone?: boolean;
  /** Takes focus on open; by default the sheet itself does, so its title is read first. */
  readonly initialFocusRef?: RefObject<HTMLElement | null>;
  /** Pinned below the scrolling content, e.g. a Save button. */
  readonly footer?: ReactNode;
  readonly children?: ReactNode;
}

/**
 * A bottom sheet over the page: a title row with Done at its end, scrolling content, an
 * optional footer. Focus moves in on open, Tab stays inside, and focus returns on close.
 */
export function Sheet(props: SheetProps) {
  if (!props.open) return null;
  return createPortal(<OpenSheet {...props} />, document.body);
}

function OpenSheet({
  title,
  onClose,
  'data-ui': hook,
  dismissable = true,
  hideDone = false,
  initialFocusRef,
  footer,
  children,
}: SheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const onKeyDown = useModalFocus(panelRef, {
    onEscape: dismissable ? onClose : undefined,
    initialFocusRef,
  });
  const drag = useDragDown(dismissable, onClose);

  return (
    <div className={styles.layer}>
      <div
        className={styles.scrim}
        aria-hidden="true"
        data-ui={partHook(hook, 'backdrop')}
        onClick={dismissable ? onClose : undefined}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-ui={hook}
        className={styles.sheet}
        style={drag.offset > 0 ? { transform: `translateY(${drag.offset}px)` } : undefined}
        data-dragging={drag.offset > 0 || undefined}
        onKeyDown={onKeyDown}
      >
        <div
          className={styles.sheetHead}
          data-draggable={dismissable || undefined}
          {...drag.handlers}
        >
          {dismissable && <span className={styles.grip} aria-hidden="true" />}
          <h2 id={titleId} className={styles.sheetTitle}>
            {title}
          </h2>
          {!hideDone && (
            <Button variant="quiet" data-ui={partHook(hook, 'done')} onClick={onClose}>
              {t('common.done')}
            </Button>
          )}
        </div>
        <div className={styles.sheetBody}>{children}</div>
        {footer !== undefined && <div className={styles.sheetFoot}>{footer}</div>}
      </div>
    </div>
  );
}

/** A downward drag on the title row that follows the pointer and closes past the threshold. */
function useDragDown(enabled: boolean, onClose: () => void) {
  const [offset, setOffset] = useState(0);
  const start = useRef<{ pointer: number; y: number; dragging: boolean } | null>(null);

  if (!enabled) return { offset: 0, handlers: {} };

  const travel = (event: PointerEvent<HTMLElement>) =>
    Math.max(0, event.clientY - (start.current?.y ?? event.clientY));

  const handlers = {
    onPointerDown(event: PointerEvent<HTMLElement>) {
      if (event.button !== 0) return;
      start.current = { pointer: event.pointerId, y: event.clientY, dragging: false };
    },
    onPointerMove(event: PointerEvent<HTMLElement>) {
      const drag = start.current;
      if (!drag || drag.pointer !== event.pointerId) return;
      const distance = travel(event);
      if (!drag.dragging && distance > DRAG_SLOP_PX) {
        drag.dragging = true;
        // Captured only once it is a drag, so a tap still clicks the button under it.
        event.currentTarget.setPointerCapture?.(event.pointerId);
      }
      if (drag.dragging) setOffset(distance);
    },
    onPointerUp(event: PointerEvent<HTMLElement>) {
      const drag = start.current;
      if (!drag || drag.pointer !== event.pointerId) return;
      const distance = travel(event);
      start.current = null;
      setOffset(0);
      if (drag.dragging && distance >= SHEET_DRAG_CLOSE_PX) onClose();
    },
    onPointerCancel() {
      start.current = null;
      setOffset(0);
    },
  };
  return { offset, handlers };
}

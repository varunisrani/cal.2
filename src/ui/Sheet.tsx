import {
  useId,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { t } from '../i18n/t';
import { Button } from './Button';
import { cx } from './classes';
import { useModalLayer } from './modalLayer';
import styles from './primitives.module.css';

/** How far the header must be pulled down, in CSS pixels, for letting go to close the sheet. */
export const SHEET_SWIPE_CLOSE_PX = 80;

export interface SheetProps {
  open: boolean;
  /** Shown in the title row; it also names the sheet for assistive tech. */
  title: string;
  /** Done, and when dismissable also Escape, a tap on the scrim and a downward pull. */
  onClose: () => void;
  'data-ui': string;
  /**
   * `false` for sheets that must not close by accident (review, manual entry): Escape, the scrim
   * and the pull do nothing; only the sheet's own buttons close it.
   */
  dismissable?: boolean;
  /** An action at the start of the title row (e.g. Cancel). */
  leading?: ReactNode;
  /** Replaces the trailing Done (e.g. Save); `null` leaves the place empty. */
  trailing?: ReactNode;
  /** Where focus goes on open; the sheet itself by default. */
  initialFocus?: RefObject<HTMLElement | null>;
  children?: ReactNode;
}

/** A bottom sheet over a scrim. Renders nothing while closed. */
export function Sheet(props: SheetProps) {
  return props.open ? <OpenSheet {...props} /> : null;
}

interface Pull {
  pointerId: number;
  startY: number;
}

function OpenSheet({
  title,
  onClose,
  dismissable = true,
  leading,
  trailing,
  initialFocus,
  children,
  'data-ui': ui,
}: SheetProps) {
  const titleId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const pull = useRef<Pull | null>(null);
  const [offset, setOffset] = useState(0);

  useModalLayer(rootRef, panelRef, {
    onEscape: dismissable ? onClose : undefined,
    initialFocus,
  });

  const startPull = (event: ReactPointerEvent<HTMLElement>): void => {
    if (!dismissable || (event.pointerType === 'mouse' && event.button !== 0)) return;
    // A press on a button in the header is a press, not a pull: capturing the pointer here
    // would take the button's click away.
    if (event.target instanceof Element && event.target.closest('button, a, input, select')) {
      return;
    }
    pull.current = { pointerId: event.pointerId, startY: event.clientY };
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Not every environment can capture (a synthetic pointer); the pull still works.
    }
  };

  const movePull = (event: ReactPointerEvent<HTMLElement>): void => {
    const current = pull.current;
    if (!current || current.pointerId !== event.pointerId) return;
    setOffset(Math.max(0, event.clientY - current.startY));
  };

  const endPull = (event: ReactPointerEvent<HTMLElement>): void => {
    const current = pull.current;
    if (!current || current.pointerId !== event.pointerId) return;
    pull.current = null;
    setOffset(0);
    if (event.type === 'pointerup' && event.clientY - current.startY >= SHEET_SWIPE_CLOSE_PX) {
      onClose();
    }
  };

  const trailingAction =
    trailing === undefined ? (
      <Button variant="quiet" data-ui={`${ui}.done`} onClick={onClose}>
        {t('common.done')}
      </Button>
    ) : (
      trailing
    );

  return createPortal(
    <div ref={rootRef} className={cx(styles.layer, styles.sheetLayer)}>
      <div
        className={styles.scrim}
        aria-hidden="true"
        data-ui={`${ui}.scrim`}
        onClick={dismissable ? onClose : undefined}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-ui={ui}
        className={cx(styles.sheet, offset > 0 && styles.pulling)}
        style={offset > 0 ? { transform: `translateY(${offset}px)` } : undefined}
      >
        <div
          className={styles.sheetHeader}
          data-ui={`${ui}.handle`}
          onPointerDown={startPull}
          onPointerMove={movePull}
          onPointerUp={endPull}
          onPointerCancel={endPull}
        >
          {dismissable ? <span className={styles.grabber} aria-hidden="true" /> : null}
          <div className={styles.sheetBar}>
            <div className={styles.sheetLeading}>{leading}</div>
            <h2 id={titleId} className={styles.sheetTitle}>
              {title}
            </h2>
            <div className={styles.sheetTrailing}>{trailingAction}</div>
          </div>
        </div>
        <div className={styles.sheetBody}>{children}</div>
      </div>
    </div>,
    document.body,
  );
}

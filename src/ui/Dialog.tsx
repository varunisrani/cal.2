import { useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { t } from '../i18n/t';
import { Button } from './Button';
import { cx } from './classes';
import { useModalLayer } from './modalLayer';
import styles from './primitives.module.css';

export interface DialogProps {
  open: boolean;
  title: string;
  message?: ReactNode;
  /** The primary action's label ("Delete", "Log anyway"). */
  confirmLabel: string;
  /**
   * The secondary action's label; Cancel by default. `null` shows the primary action alone
   * (Escape and the scrim still call `onCancel`).
   */
  cancelLabel?: string | null;
  /** Draws the primary action in the danger colour, and puts first focus on Cancel. */
  destructive?: boolean;
  confirmDisabled?: boolean;
  /** May return a promise; the primary action shows busy until it settles. */
  onConfirm: () => unknown;
  /** The secondary action, Escape and a tap on the scrim. */
  onCancel: () => void;
  'data-ui': string;
  /** Extra content between the message and the actions. */
  children?: ReactNode;
}

/**
 * A centred confirmation over a scrim. Each opening answers once: after either action fires,
 * neither fires again until the dialog is opened anew. Renders nothing while closed.
 */
export function Dialog(props: DialogProps) {
  return props.open ? <OpenDialog {...props} /> : null;
}

function OpenDialog({
  title,
  message,
  confirmLabel,
  cancelLabel,
  destructive = false,
  confirmDisabled = false,
  onConfirm,
  onCancel,
  'data-ui': ui,
  children,
}: DialogProps) {
  const titleId = useId();
  const messageId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const answered = useRef(false);

  const cancel = (): void => {
    if (answered.current) return;
    answered.current = true;
    onCancel();
  };
  const confirm = (): unknown => {
    if (answered.current) return undefined;
    answered.current = true;
    return onConfirm();
  };

  useModalLayer(rootRef, panelRef, {
    onEscape: cancel,
    // Cancel when it is there and the action is risky or off; the panel when neither can take it.
    initialFocus:
      (destructive || confirmDisabled) && cancelLabel !== null
        ? cancelRef
        : confirmDisabled
          ? undefined
          : confirmRef,
  });

  return createPortal(
    <div ref={rootRef} className={cx(styles.layer, styles.dialogLayer)}>
      <div className={styles.scrim} aria-hidden="true" data-ui={`${ui}.scrim`} onClick={cancel} />
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={message ? messageId : undefined}
        tabIndex={-1}
        data-ui={ui}
        className={styles.dialog}
      >
        <h2 id={titleId} className={styles.dialogTitle}>
          {title}
        </h2>
        {message ? (
          <div id={messageId} className={styles.dialogMessage}>
            {message}
          </div>
        ) : null}
        {children}
        <div className={styles.dialogActions}>
          {cancelLabel === null ? null : (
            <Button ref={cancelRef} variant="quiet" data-ui={`${ui}.cancel`} onClick={cancel}>
              {cancelLabel ?? t('common.cancel')}
            </Button>
          )}
          <Button
            ref={confirmRef}
            variant={destructive ? 'danger' : 'primary'}
            disabled={confirmDisabled}
            data-ui={`${ui}.confirm`}
            onClick={confirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

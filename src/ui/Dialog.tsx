import { useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { t } from '../i18n/t';
import { Button } from './Button';
import { useModalFocus } from './modal';
import styles from './primitives.module.css';
import { cx, isThenable, partHook } from './primitives';

export interface DialogProps {
  readonly open: boolean;
  readonly title: string;
  readonly message?: string;
  /** The primary action's label, e.g. "Delete". */
  readonly confirmLabel: string;
  /** The secondary action's label; Cancel by default. null leaves it out (Escape still cancels). */
  readonly cancelLabel?: string | null;
  /** Holds the primary action back, e.g. until a field in `children` is filled. */
  readonly confirmDisabled?: boolean;
  /** Draws the primary action in the danger colour. */
  readonly destructive?: boolean;
  /**
   * The primary action. A returned promise shows the button busy; if it rejects, the dialog
   * can be answered again (the handler reports its own error).
   */
  readonly onConfirm: () => void | Promise<unknown>;
  /** Cancel, Escape and a tap on the backdrop. */
  readonly onCancel: () => void;
  /** The root hook; the actions get `<hook>.confirm` and `<hook>.cancel`. */
  readonly 'data-ui': string;
  /** Extra content between the message and the actions. */
  readonly children?: ReactNode;
}

/**
 * Asks one question with a secondary and a primary action. It answers once per opening: after
 * either action (or Escape) further presses do nothing, so a double tap deletes once.
 */
export function Dialog(props: DialogProps) {
  if (!props.open) return null;
  return createPortal(<OpenDialog {...props} />, document.body);
}

function OpenDialog({
  title,
  message,
  confirmLabel,
  cancelLabel,
  confirmDisabled = false,
  destructive = false,
  onConfirm,
  onCancel,
  'data-ui': hook,
  children,
}: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const answered = useRef(false);
  const titleId = useId();
  const messageId = useId();

  const cancel = () => {
    if (answered.current) return;
    answered.current = true;
    onCancel();
  };
  const confirm = () => {
    if (answered.current) return;
    answered.current = true;
    const outcome = onConfirm();
    if (!isThenable(outcome)) return;
    // Handing the promise to the Button keeps it busy until the action settles.
    return Promise.resolve(outcome).then(
      () => undefined,
      () => {
        answered.current = false;
      },
    );
  };

  // Focus starts on the secondary action, the safe one, when there is one.
  const onKeyDown = useModalFocus(panelRef, {
    onEscape: cancel,
    initialFocusRef: cancelLabel === null ? confirmRef : cancelRef,
  });

  return (
    <div className={cx(styles.layer, styles.centred)}>
      <div
        className={styles.scrim}
        aria-hidden="true"
        data-ui={partHook(hook, 'backdrop')}
        onClick={cancel}
      />
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={message === undefined ? undefined : messageId}
        tabIndex={-1}
        data-ui={hook}
        className={styles.dialog}
        onKeyDown={onKeyDown}
      >
        <h2 id={titleId} className={styles.dialogTitle}>
          {title}
        </h2>
        {message !== undefined && (
          <p id={messageId} className={styles.dialogMessage}>
            {message}
          </p>
        )}
        {children}
        <div className={styles.dialogActions}>
          {cancelLabel !== null && (
            <Button
              ref={cancelRef}
              variant="quiet"
              data-ui={partHook(hook, 'cancel')}
              onClick={cancel}
            >
              {cancelLabel ?? t('common.cancel')}
            </Button>
          )}
          <Button
            ref={confirmRef}
            variant={destructive ? 'danger' : 'primary'}
            aria-disabled={confirmDisabled || undefined}
            data-ui={partHook(hook, 'confirm')}
            onClick={confirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

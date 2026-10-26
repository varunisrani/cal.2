import {
  useRef,
  useState,
  type ComponentPropsWithRef,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { cx } from './classes';
import styles from './primitives.module.css';

export type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'danger';

interface PressableProps extends Omit<
  ComponentPropsWithRef<'button'>,
  'onClick' | 'type' | 'children'
> {
  /** The hook e2e tests and parity scenarios find this button by: `<area>.<thing>`. */
  'data-ui': string;
  variant?: ButtonVariant;
  type?: 'button' | 'submit' | 'reset';
  /** Shows a spinner, tells assistive tech, and ignores presses. */
  busy?: boolean;
  /**
   * May return a promise: the button is then busy until it settles, and presses in between are
   * ignored, even a second one that lands before the busy state is drawn.
   */
  onClick?: (event: MouseEvent<HTMLButtonElement>) => unknown;
}

export interface ButtonProps extends PressableProps {
  children: ReactNode;
  /** Stretches the button to the width of its container. */
  block?: boolean;
}

export interface IconButtonProps extends PressableProps {
  /** The button's accessible name (the icon itself is hidden from assistive tech). */
  label: string;
  icon: ReactNode;
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { then?: unknown }).then === 'function'
  );
}

/** The busy state and the click handler that respects it. */
function useGatedClick(
  onClick: PressableProps['onClick'],
  busyProp: boolean,
): { busy: boolean; onClick: (event: MouseEvent<HTMLButtonElement>) => void } {
  // A ref, not state: a second press in the same frame reads it before React re-renders.
  const inFlight = useRef(false);
  const [waiting, setWaiting] = useState(false);
  const busy = busyProp || waiting;

  const gated = (event: MouseEvent<HTMLButtonElement>): void => {
    if (busy || inFlight.current) {
      // Also keeps a busy submit button from submitting its form again.
      event.preventDefault();
      return;
    }
    const result = onClick?.(event);
    if (!isThenable(result)) return;
    inFlight.current = true;
    setWaiting(true);
    const release = (): void => {
      inFlight.current = false;
      setWaiting(false);
    };
    // `finally` passes a rejection on, so a failing handler still surfaces its error.
    void Promise.resolve(result).finally(release);
  };
  return { busy, onClick: gated };
}

function Spinner() {
  return (
    <svg className={styles.spinner} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

/** A text button in one of four looks. */
export function Button({
  variant = 'secondary',
  type = 'button',
  busy: busyProp = false,
  block = false,
  onClick,
  className,
  children,
  'data-ui': ui,
  ...rest
}: ButtonProps) {
  const { busy, onClick: gated } = useGatedClick(onClick, busyProp);
  return (
    <button
      {...rest}
      type={type}
      className={cx(
        styles.button,
        styles[variant],
        block && styles.block,
        busy && styles.busy,
        className,
      )}
      aria-busy={busy || undefined}
      aria-disabled={busy || rest['aria-disabled'] || undefined}
      data-ui={ui}
      onClick={gated}
    >
      {busy ? <Spinner /> : null}
      <span className={styles.buttonLabel}>{children}</span>
    </button>
  );
}

/** A button that shows only an icon; `label` names it. */
export function IconButton({
  variant = 'quiet',
  type = 'button',
  busy: busyProp = false,
  label,
  icon,
  onClick,
  className,
  'data-ui': ui,
  ...rest
}: IconButtonProps) {
  const { busy, onClick: gated } = useGatedClick(onClick, busyProp);
  return (
    <button
      {...rest}
      type={type}
      className={cx(
        styles.button,
        styles.iconButton,
        styles[variant],
        busy && styles.busy,
        className,
      )}
      aria-label={label}
      aria-busy={busy || undefined}
      aria-disabled={busy || rest['aria-disabled'] || undefined}
      data-ui={ui}
      onClick={gated}
    >
      {busy ? <Spinner /> : null}
      <span className={styles.buttonIcon} aria-hidden="true">
        {icon}
      </span>
    </button>
  );
}

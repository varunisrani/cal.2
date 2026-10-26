import {
  useRef,
  useState,
  type ComponentPropsWithRef,
  type MouseEvent,
  type ReactNode,
} from 'react';
import styles from './primitives.module.css';
import { cx, isThenable } from './primitives';

export type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'danger';

type NativeButtonProps = Omit<ComponentPropsWithRef<'button'>, 'onClick'>;

export interface ButtonProps extends NativeButtonProps {
  /** The hook e2e tests and parity scenarios find this control by: `<area>.<thing>`. */
  readonly 'data-ui': string;
  /** primary: the one main act of a screen; danger: destructive; quiet: text only. */
  readonly variant?: ButtonVariant;
  /** Shows a spinner and ignores presses; the button keeps its place and its focus. */
  readonly busy?: boolean;
  /** Stretches to the width of its container. */
  readonly wide?: boolean;
  /**
   * A handler that returns a promise makes the button busy until the promise settles, so a
   * second press meanwhile does nothing. The handler reports its own errors.
   */
  readonly onClick?: (event: MouseEvent<HTMLButtonElement>) => void | Promise<unknown>;
}

const VARIANT_CLASS: Readonly<Record<ButtonVariant, string | undefined>> = {
  primary: styles.primary,
  secondary: styles.secondary,
  quiet: styles.quiet,
  danger: styles.danger,
};

/** The app's push button. Busy and `aria-disabled` buttons stay focusable but ignore presses. */
export function Button({
  variant = 'secondary',
  busy = false,
  wide = false,
  type = 'button',
  className,
  children,
  onClick,
  ...native
}: ButtonProps) {
  const inFlight = useRef(false);
  const [pending, setPending] = useState(false);
  const showBusy = busy || pending;
  const ariaDisabled = native['aria-disabled'];
  const blocked = showBusy || ariaDisabled === true || ariaDisabled === 'true';

  const press = (event: MouseEvent<HTMLButtonElement>) => {
    // A ref, not state: two presses in the same tick both see it before any re-render.
    if (blocked || inFlight.current) {
      event.preventDefault();
      return;
    }
    const outcome = onClick?.(event);
    if (!isThenable(outcome)) return;
    inFlight.current = true;
    setPending(true);
    const release = () => {
      inFlight.current = false;
      setPending(false);
    };
    outcome.then(release, release);
  };

  return (
    <button
      {...native}
      type={type}
      className={cx(styles.button, VARIANT_CLASS[variant], wide && styles.wide, className)}
      aria-busy={showBusy || undefined}
      aria-disabled={showBusy ? true : ariaDisabled}
      data-busy={showBusy || undefined}
      onClick={press}
    >
      {showBusy && <span className={styles.spinner} aria-hidden="true" />}
      <span className={styles.buttonLabel}>{children}</span>
    </button>
  );
}

export interface IconButtonProps extends Omit<ButtonProps, 'children' | 'aria-label' | 'wide'> {
  /** The accessible name; required because the button shows only a drawing. */
  readonly label: string;
  /** The drawing; it is hidden from screen readers, which read `label`. */
  readonly icon: ReactNode;
}

/** A button that shows only an icon; its label is its accessible name. */
export function IconButton({
  label,
  icon,
  variant = 'quiet',
  className,
  ...rest
}: IconButtonProps) {
  return (
    <Button
      {...rest}
      variant={variant}
      aria-label={label}
      className={cx(styles.iconButton, className)}
    >
      <span className={styles.iconGlyph} aria-hidden="true">
        {icon}
      </span>
    </Button>
  );
}

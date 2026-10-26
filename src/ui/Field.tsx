import { useId, type ComponentPropsWithRef } from 'react';
import { cx } from './classes';
import styles from './inputs.module.css';

export interface FieldProps extends Omit<
  ComponentPropsWithRef<'input'>,
  'value' | 'onChange' | 'children'
> {
  label: string;
  value: string;
  /** The text as typed; parsing is the caller's job. */
  onChange: (value: string) => void;
  /** A short help line under the input. */
  hint?: string;
  /** Marks the input invalid and shows this line under it. */
  error?: string;
  /** A unit shown after the value ("kcal", "g"). */
  unit?: string;
  'data-ui': string;
}

/**
 * A labelled text input. Hint, unit and error describe the input for assistive tech; pick
 * `inputMode` (`decimal`, `numeric`) so a phone shows the right keypad.
 */
export function Field({
  label,
  value,
  onChange,
  hint,
  error,
  unit,
  id,
  className,
  'data-ui': ui,
  ...rest
}: FieldProps) {
  const ownId = useId();
  const inputId = id ?? ownId;
  const unitId = `${inputId}-unit`;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  const describedBy = [unit && unitId, hint && hintId, error && errorId].filter(Boolean).join(' ');

  return (
    <div className={cx(styles.field, className)}>
      <label htmlFor={inputId} className={styles.fieldLabel}>
        {label}
      </label>
      <div className={cx(styles.fieldBox, error && styles.fieldBoxInvalid)}>
        <input
          type="text"
          {...rest}
          id={inputId}
          className={styles.fieldInput}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy || undefined}
          data-ui={ui}
        />
        {unit ? (
          <span id={unitId} className={styles.fieldUnit}>
            {unit}
          </span>
        ) : null}
      </div>
      {hint ? (
        <p id={hintId} className={styles.fieldHint}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className={styles.fieldError}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

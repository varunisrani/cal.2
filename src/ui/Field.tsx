import { useId, type ChangeEvent, type ComponentPropsWithRef } from 'react';
import styles from './inputs.module.css';
import { cx } from './primitives';

type NativeInputProps = Omit<ComponentPropsWithRef<'input'>, 'id' | 'type' | 'value'>;

export interface FieldProps extends NativeInputProps {
  /** The visible label; it names the input. */
  readonly label: string;
  readonly 'data-ui': string;
  readonly value: string;
  /** The new text on every edit (the native `onChange` still works too). */
  readonly onValueChange?: (value: string) => void;
  /** Help below the input, read as its description. */
  readonly hint?: string;
  /** Marks the input invalid and is read as part of its description. */
  readonly error?: string;
  /** Shown after the input, e.g. "kcal"; read as part of its description. */
  readonly unit?: string;
  /** Numbers use `text` with an `inputMode`, so every locale's decimal mark can be typed. */
  readonly type?: 'text' | 'search' | 'email' | 'url' | 'tel' | 'password';
}

/** A labelled one-line input with an optional hint, error and unit. */
export function Field({
  label,
  value,
  onValueChange,
  hint,
  error,
  unit,
  type = 'text',
  className,
  onChange,
  ...native
}: FieldProps) {
  const id = useId();
  const unitId = `${id}-unit`;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [
    unit !== undefined && unitId,
    hint !== undefined && hintId,
    error !== undefined && errorId,
  ]
    .filter((part): part is string => typeof part === 'string')
    .join(' ');

  const change = (event: ChangeEvent<HTMLInputElement>) => {
    onChange?.(event);
    onValueChange?.(event.target.value);
  };

  return (
    <div className={cx(styles.field, className)} data-invalid={error !== undefined || undefined}>
      <label htmlFor={id} className={styles.fieldLabel}>
        {label}
      </label>
      <div className={styles.fieldControl}>
        <input
          {...native}
          id={id}
          type={type}
          value={value}
          className={styles.fieldInput}
          aria-invalid={error !== undefined || undefined}
          aria-describedby={describedBy === '' ? undefined : describedBy}
          onChange={change}
        />
        {unit !== undefined && (
          <span id={unitId} className={styles.fieldUnit}>
            {unit}
          </span>
        )}
      </div>
      {hint !== undefined && (
        <p id={hintId} className={styles.fieldHint}>
          {hint}
        </p>
      )}
      {error !== undefined && (
        <p id={errorId} className={styles.fieldError}>
          {error}
        </p>
      )}
    </div>
  );
}

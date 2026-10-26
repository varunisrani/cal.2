import { useId, type ReactNode } from 'react';
import styles from './aiSetup.module.css';

export interface SelectFieldProps {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  /** The `<option>` and `<optgroup>` elements. */
  readonly children: ReactNode;
  readonly 'data-ui': string;
}

/**
 * A labelled native picker, so a phone shows its own list and groups stay real `<optgroup>`s for
 * assistive tech.
 */
export function SelectField({ label, value, onChange, children, 'data-ui': ui }: SelectFieldProps) {
  const id = useId();
  return (
    <div className={styles.select}>
      <label htmlFor={id} className={styles.selectLabel}>
        {label}
      </label>
      <select
        id={id}
        className={styles.selectInput}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        data-ui={ui}
      >
        {children}
      </select>
    </div>
  );
}

import { useId } from 'react';
import styles from './inputs.module.css';

export interface SwitchProps {
  /** The visible label; it names the switch, and tapping it flips the switch too. */
  readonly label: string;
  /** A line under the label, read as the switch's description. */
  readonly description?: string;
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  readonly disabled?: boolean;
  readonly 'data-ui': string;
}

/** An on/off setting row: the label (and description) at the start, the switch at the end. */
export function Switch({
  label,
  description,
  checked,
  onChange,
  disabled = false,
  'data-ui': hook,
}: SwitchProps) {
  const id = useId();
  const labelId = `${id}-label`;
  const descriptionId = `${id}-description`;
  return (
    <div className={styles.switchRow} data-disabled={disabled || undefined}>
      <label htmlFor={id} className={styles.switchText}>
        <span id={labelId} className={styles.switchLabel}>
          {label}
        </span>
        {description !== undefined && (
          <span id={descriptionId} className={styles.switchDescription}>
            {description}
          </span>
        )}
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={labelId}
        aria-describedby={description === undefined ? undefined : descriptionId}
        disabled={disabled}
        data-ui={hook}
        className={styles.switch}
        onClick={() => onChange(!checked)}
      >
        <span className={styles.switchThumb} aria-hidden="true" />
      </button>
    </div>
  );
}

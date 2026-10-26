import { useId } from 'react';
import styles from './inputs.module.css';

export interface SwitchProps {
  label: string;
  /** A muted line under the label; it describes the switch for assistive tech. */
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  'data-ui': string;
}

/** An on/off row: the whole row (label, description, track) is one switch, a large target. */
export function Switch({
  label,
  description,
  checked,
  onChange,
  disabled = false,
  'data-ui': ui,
}: SwitchProps) {
  const labelId = useId();
  const descriptionId = useId();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelId}
      aria-describedby={description ? descriptionId : undefined}
      disabled={disabled}
      className={styles.switchRow}
      data-ui={ui}
      onClick={() => onChange(!checked)}
    >
      <span className={styles.switchText}>
        <span id={labelId} className={styles.switchLabel}>
          {label}
        </span>
        {description ? (
          <span id={descriptionId} className={styles.switchDescription}>
            {description}
          </span>
        ) : null}
      </span>
      <span className={styles.switchTrack} aria-hidden="true">
        <span className={styles.switchThumb} />
      </span>
    </button>
  );
}

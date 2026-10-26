import { useId } from 'react';
import { t } from '../i18n/t';
import styles from './inputs.module.css';
import { partHook } from './primitives';

/** date: `YYYY-MM-DD`; time: `HH:mm`; datetime: `YYYY-MM-DDTHH:mm` (local wall-clock time). */
export type DateTimeMode = 'date' | 'time' | 'datetime';

/** The length of a value in each mode; longer bounds (with seconds) are cut to it. */
const LENGTH: Readonly<Record<DateTimeMode, number>> = { date: 10, time: 5, datetime: 16 };

export interface DateTimeFieldProps {
  /** Names the input (date or time) or the group of both (datetime). */
  readonly label: string;
  /** The root hook; the inputs get `<hook>.date` and `<hook>.time`. */
  readonly 'data-ui': string;
  readonly mode?: DateTimeMode;
  /** The value in the mode's shape; values of one shape compare correctly as text. */
  readonly value: string;
  /** The earliest value that can be picked. */
  readonly min?: string;
  /** The latest value that can be picked, e.g. now, so the future cannot be chosen. */
  readonly max?: string;
  /** Called with the picked value, already brought inside min…max. */
  readonly onChange: (value: string) => void;
  readonly hint?: string;
}

/** `value` brought inside `min`…`max`; all three in the same shape. */
export function clampWallClock(value: string, min?: string, max?: string): string {
  if (max !== undefined && value > max) return max;
  if (min !== undefined && value < min) return min;
  return value;
}

/**
 * The browser's own date and time inputs. A value picked outside `min`…`max` is clamped back
 * to the bound (a future day becomes today), and an emptied input reports nothing.
 */
export function DateTimeField({
  label,
  'data-ui': hook,
  mode = 'date',
  value,
  min: rawMin,
  max: rawMax,
  onChange,
  hint,
}: DateTimeFieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const describedBy = hint === undefined ? undefined : hintId;
  const min = rawMin?.slice(0, LENGTH[mode]);
  const max = rawMax?.slice(0, LENGTH[mode]);

  const report = (next: string) => {
    if (next === '') return;
    const kept = clampWallClock(next, min, max);
    if (kept !== value) onChange(kept);
  };

  const hintLine = hint !== undefined && (
    <p id={hintId} className={styles.fieldHint}>
      {hint}
    </p>
  );

  if (mode !== 'datetime') {
    const part = mode === 'date' ? 'date' : 'time';
    return (
      <div className={styles.field} data-ui={hook}>
        <label htmlFor={id} className={styles.fieldLabel}>
          {label}
        </label>
        <input
          id={id}
          type={mode}
          value={value}
          min={min}
          max={max}
          aria-describedby={describedBy}
          data-ui={partHook(hook, part)}
          className={styles.fieldInput}
          onChange={(event) => report(event.target.value)}
        />
        {hintLine}
      </div>
    );
  }

  const day = value.slice(0, 10);
  const clock = value.slice(11, 16);
  // The clock is bounded only on the bound's own day.
  const clockMin = min !== undefined && min.slice(0, 10) === day ? min.slice(11) : undefined;
  const clockMax = max !== undefined && max.slice(0, 10) === day ? max.slice(11) : undefined;

  return (
    <fieldset className={styles.dateTime} data-ui={hook} aria-describedby={describedBy}>
      <legend className={styles.fieldLabel}>{label}</legend>
      <div className={styles.dateTimeInputs}>
        <label className={styles.dateTimePart}>
          <span className={styles.dateTimePartLabel}>{t('common.date')}</span>
          <input
            type="date"
            value={day}
            min={min?.slice(0, 10)}
            max={max?.slice(0, 10)}
            data-ui={partHook(hook, 'date')}
            className={styles.fieldInput}
            onChange={(event) => report(event.target.value && `${event.target.value}T${clock}`)}
          />
        </label>
        <label className={styles.dateTimePart}>
          <span className={styles.dateTimePartLabel}>{t('common.time')}</span>
          <input
            type="time"
            value={clock}
            min={clockMin}
            max={clockMax}
            data-ui={partHook(hook, 'time')}
            className={styles.fieldInput}
            onChange={(event) => report(event.target.value && `${day}T${event.target.value}`)}
          />
        </label>
      </div>
      {hintLine}
    </fieldset>
  );
}

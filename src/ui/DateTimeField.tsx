import { useId } from 'react';
import { t } from '../i18n/t';
import { cx } from './classes';
import styles from './inputs.module.css';

/** A date (`YYYY-MM-DD`, a day key) and a time (`HH:MM`), as the native inputs write them. */
export interface DateTimeValue {
  readonly date: string;
  readonly time: string;
}

interface CommonProps {
  /** Names the input, or the pair of inputs for `kind="datetime"`. */
  label: string;
  disabled?: boolean;
  /** The hook of the input; for `kind="datetime"`, of the group (inputs `.date` and `.time`). */
  'data-ui': string;
  className?: string;
}

interface SingleProps extends CommonProps {
  kind: 'date' | 'time';
  value: string;
  onChange: (value: string) => void;
  /** The earliest value; the native picker offers nothing before it, and leaving the input
   * holds a value typed below it to it. */
  min?: string;
  /** The latest value: the native picker offers nothing after it, and a later value is held
   * to it at once, so a picker can forbid the future. */
  max?: string;
}

interface DateAndTimeProps extends CommonProps {
  kind: 'datetime';
  value: DateTimeValue;
  onChange: (value: DateTimeValue) => void;
  min?: DateTimeValue;
  max?: DateTimeValue;
}

export type DateTimeFieldProps = SingleProps | DateAndTimeProps;

// Both parts are zero-padded, so text order is time order.

/** Holds `value` at or before `max`: the day first, then the time on the max day. */
export function notAfter(value: DateTimeValue, max: DateTimeValue | undefined): DateTimeValue {
  if (!max) return value;
  const date = value.date > max.date ? max.date : value.date;
  const time = date === max.date && value.time > max.time ? max.time : value.time;
  return date === value.date && time === value.time ? value : { date, time };
}

/** Holds `value` at or after `min`: the day first, then the time on the min day. */
export function notBefore(value: DateTimeValue, min: DateTimeValue | undefined): DateTimeValue {
  if (!min) return value;
  const date = value.date < min.date ? min.date : value.date;
  const time = date === min.date && value.time < min.time ? min.time : value.time;
  return date === value.date && time === value.time ? value : { date, time };
}

/**
 * Native date and/or time inputs. `max` forbids later values (a typed one is held to it at once);
 * `min` is held on leaving the input, so typing a year digit by digit is not fought on the way.
 * An emptied input reports nothing: the last value stays.
 */
export function DateTimeField(props: DateTimeFieldProps) {
  return props.kind === 'datetime' ? <DateAndTime {...props} /> : <SingleInput {...props} />;
}

function SingleInput({
  kind,
  label,
  value,
  onChange,
  min,
  max,
  disabled,
  className,
  'data-ui': ui,
}: SingleProps) {
  const id = useId();
  const report = (next: string): void => {
    if (next !== '' && next !== value) onChange(next);
  };
  return (
    <div className={cx(styles.field, className)}>
      <label htmlFor={id} className={styles.fieldLabel}>
        {label}
      </label>
      <input
        id={id}
        type={kind}
        className={styles.dateInput}
        value={value}
        min={min}
        max={max}
        disabled={disabled}
        data-ui={ui}
        onChange={(event) => {
          const typed = event.target.value;
          report(max !== undefined && typed > max ? max : typed);
        }}
        onBlur={() => {
          if (min !== undefined && value !== '' && value < min) report(min);
        }}
      />
    </div>
  );
}

function DateAndTime({
  label,
  value,
  onChange,
  min,
  max,
  disabled,
  className,
  'data-ui': ui,
}: DateAndTimeProps) {
  const dateId = useId();
  const timeId = useId();
  const report = (next: DateTimeValue): void => {
    if (next.date === '' || next.time === '') return;
    if (next.date !== value.date || next.time !== value.time) onChange(next);
  };
  const holdToMin = (): void => report(notBefore(value, min));
  return (
    <fieldset className={cx(styles.dateTime, className)} disabled={disabled} data-ui={ui}>
      <legend className={styles.fieldLabel}>{label}</legend>
      <div className={styles.dateTimeInputs}>
        <div className={styles.dateTimePart}>
          <label htmlFor={dateId} className={styles.dateTimePartLabel}>
            {t('common.date')}
          </label>
          <input
            id={dateId}
            type="date"
            className={styles.dateInput}
            value={value.date}
            min={min?.date}
            max={max?.date}
            data-ui={`${ui}.date`}
            onChange={(event) => report(notAfter({ ...value, date: event.target.value }, max))}
            onBlur={holdToMin}
          />
        </div>
        <div className={styles.dateTimePart}>
          <label htmlFor={timeId} className={styles.dateTimePartLabel}>
            {t('common.time')}
          </label>
          <input
            id={timeId}
            type="time"
            className={styles.dateInput}
            value={value.time}
            // The time limits hold only on the first and last allowed day.
            min={min && value.date === min.date ? min.time : undefined}
            max={max && value.date === max.date ? max.time : undefined}
            data-ui={`${ui}.time`}
            onChange={(event) => report(notAfter({ ...value, time: event.target.value }, max))}
            onBlur={holdToMin}
          />
        </div>
      </div>
    </fieldset>
  );
}

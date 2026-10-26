import { useId, type KeyboardEvent } from 'react';
import { formatDecimal } from '../i18n/format';
import { t } from '../i18n/t';
import { IconButton } from './Button';
import styles from './inputs.module.css';
import { clamp, partHook } from './primitives';

export interface StepperProps {
  /** Names the value and both buttons ("Increase <label>"). */
  readonly label: string;
  /** The root hook; parts get `<hook>.value`, `<hook>.decrease` and `<hook>.increase`. */
  readonly 'data-ui': string;
  readonly value: number;
  readonly onChange: (value: number) => void;
  readonly min: number;
  readonly max: number;
  /** The change per press or arrow key; fractional steps are kept free of float drift. */
  readonly step?: number;
  /** The value as shown and read out; by default the number with the step's decimals. */
  readonly format?: (value: number) => string;
  /** Keeps the label for screen readers only, when the row around it already shows it. */
  readonly hideLabel?: boolean;
  readonly disabled?: boolean;
}

/** Decimals in a step as written: 5 → 0, 0.5 → 1, 0.25 → 2. */
function decimalsOf(step: number): number {
  const text = String(step);
  const dot = text.indexOf('.');
  return dot < 0 ? 0 : text.length - dot - 1;
}

/** `value` moved by `count` steps, rounded to the step's decimals and kept in min…max. */
export function stepBy(value: number, count: number, step: number, min: number, max: number) {
  const scale = 10 ** decimalsOf(step);
  return clamp(Math.round((value + count * step) * scale) / scale, min, max);
}

/** A number changed by − and + buttons or the arrow keys, never leaving min…max. */
export function Stepper({
  label,
  'data-ui': hook,
  value,
  onChange,
  min,
  max,
  step = 1,
  format,
  hideLabel = false,
  disabled = false,
}: StepperProps) {
  const labelId = useId();
  const text = format ? format(value) : formatDecimal(value, decimalsOf(step));
  const atMin = value <= min;
  const atMax = value >= max;

  const set = (next: number) => {
    if (!disabled && next !== value) onChange(next);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const keys: Record<string, () => number> = {
      ArrowUp: () => stepBy(value, 1, step, min, max),
      ArrowDown: () => stepBy(value, -1, step, min, max),
      Home: () => min,
      End: () => max,
    };
    const target = keys[event.key];
    if (!target) return;
    event.preventDefault();
    set(target());
  };

  return (
    <div
      role="group"
      aria-labelledby={labelId}
      data-ui={hook}
      className={styles.stepper}
      data-disabled={disabled || undefined}
    >
      <span id={labelId} className={hideLabel ? styles.visuallyHidden : styles.stepperLabel}>
        {label}
      </span>
      <div className={styles.stepperControls}>
        <IconButton
          label={t('common.decrease', { name: label })}
          icon="−"
          variant="secondary"
          data-ui={partHook(hook, 'decrease')}
          aria-disabled={disabled || atMin}
          onClick={() => set(stepBy(value, -1, step, min, max))}
        />
        <span
          role="spinbutton"
          tabIndex={disabled ? -1 : 0}
          aria-labelledby={labelId}
          aria-valuenow={value}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuetext={text}
          aria-disabled={disabled || undefined}
          data-ui={partHook(hook, 'value')}
          className={styles.stepperValue}
          onKeyDown={onKeyDown}
        >
          {text}
        </span>
        <IconButton
          label={t('common.increase', { name: label })}
          icon="+"
          variant="secondary"
          data-ui={partHook(hook, 'increase')}
          aria-disabled={disabled || atMax}
          onClick={() => set(stepBy(value, 1, step, min, max))}
        />
      </div>
    </div>
  );
}

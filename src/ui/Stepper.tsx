import type { KeyboardEvent } from 'react';
import { formatDecimal } from '../i18n/format';
import { t } from '../i18n/t';
import { cx } from './classes';
import styles from './inputs.module.css';

/** How many steps Page Up and Page Down take. */
const PAGE_STEPS = 10;

/** Slack for float noise when deciding whether a value sits on the step grid. */
const GRID_SLACK = 1e-9;

export interface StepRange {
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
}

function decimalsOf(step: number): number {
  const text = String(step);
  const dot = text.indexOf('.');
  return dot === -1 ? 0 : text.length - dot - 1;
}

function clamp(value: number, min: number | undefined, max: number | undefined): number {
  if (max !== undefined && value > max) return max;
  if (min !== undefined && value < min) return min;
  return value;
}

/**
 * The value `steps` grid points away from `value` (negative: down), held to min…max. The grid
 * starts at `min` (or 0) and is `step` apart; a value between two points moves to the nearer
 * one in the direction asked, so 12 steps up to 15 and down to 10 with a step of 5.
 */
export function stepFrom(value: number, steps: number, { min, max, step = 1 }: StepRange): number {
  const base = min ?? 0;
  const position = (value - base) / step;
  const index =
    steps > 0
      ? Math.floor(position + GRID_SLACK) + steps
      : Math.ceil(position - GRID_SLACK) + steps;
  const decimals = Math.max(decimalsOf(step), decimalsOf(base));
  const next = Number((base + index * step).toFixed(decimals));
  return clamp(next, min, max);
}

export interface StepperProps extends StepRange {
  /** Names the value and its buttons ("Protein" → "Decrease Protein"). */
  label: string;
  value: number;
  onChange: (value: number) => void;
  /** The value as shown and read out; the locale's number by default. */
  format?: (value: number) => string;
  disabled?: boolean;
  'data-ui': string;
}

/**
 * A number with − and + buttons. The value is a spinbutton: arrows take one step, Page keys ten,
 * Home and End go to min and max. The buttons sit outside the tab order (keyboard users have the
 * arrows) and switch off at the ends.
 */
export function Stepper({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  format,
  disabled = false,
  'data-ui': ui,
}: StepperProps) {
  const range = { min, max, step };
  const text = format ? format(value) : formatDecimal(value, decimalsOf(step));
  const atMin = min !== undefined && value <= min;
  const atMax = max !== undefined && value >= max;

  const commit = (next: number): void => {
    if (!disabled && next !== value) onChange(next);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    let next: number;
    switch (event.key) {
      case 'ArrowUp':
      case 'ArrowRight':
        next = stepFrom(value, 1, range);
        break;
      case 'ArrowDown':
      case 'ArrowLeft':
        next = stepFrom(value, -1, range);
        break;
      case 'PageUp':
        next = stepFrom(value, PAGE_STEPS, range);
        break;
      case 'PageDown':
        next = stepFrom(value, -PAGE_STEPS, range);
        break;
      case 'Home':
        if (min === undefined) return;
        next = min;
        break;
      case 'End':
        if (max === undefined) return;
        next = max;
        break;
      default:
        return;
    }
    event.preventDefault();
    commit(next);
  };

  return (
    <div className={cx(styles.stepper, disabled && styles.stepperDisabled)}>
      <button
        type="button"
        tabIndex={-1}
        className={styles.stepperButton}
        aria-label={t('common.decrease', { name: label })}
        disabled={disabled || atMin}
        data-ui={`${ui}.decrease`}
        onClick={() => commit(stepFrom(value, -1, range))}
      >
        <span aria-hidden="true">−</span>
      </button>
      <span
        role="spinbutton"
        tabIndex={disabled ? -1 : 0}
        className={styles.stepperValue}
        aria-label={label}
        aria-valuenow={value}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuetext={text}
        aria-disabled={disabled || undefined}
        data-ui={ui}
        onKeyDown={onKeyDown}
      >
        {text}
      </span>
      <button
        type="button"
        tabIndex={-1}
        className={styles.stepperButton}
        aria-label={t('common.increase', { name: label })}
        disabled={disabled || atMax}
        data-ui={`${ui}.increase`}
        onClick={() => commit(stepFrom(value, 1, range))}
      >
        <span aria-hidden="true">+</span>
      </button>
    </div>
  );
}

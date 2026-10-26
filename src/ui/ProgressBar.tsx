import type { CSSProperties } from 'react';
import styles from './display.module.css';
import { clamp, cx } from './primitives';

/** The filled share of the bar, 0…1; an empty bar when `max` is 0 or less. */
export function progressShare(value: number, max: number): number {
  if (!(max > 0)) return 0;
  const share = value / max;
  return Number.isNaN(share) ? 0 : clamp(share, 0, 1);
}

export interface ProgressBarProps {
  readonly 'data-ui': string;
  /** Names the bar for screen readers. */
  readonly label: string;
  readonly value: number;
  /** The value that fills the bar (default 1, so `value` can be a share). */
  readonly max?: number;
  /**
   * What a screen reader says for the value, e.g. "Step 2 of 5"; when the caller shows the
   * value as text next to the bar, pass the same text. Without it the percentage is read.
   */
  readonly valueText?: string;
  readonly className?: string;
}

/** A thin bar filling from the start edge; a progressbar that reports a percentage. */
export function ProgressBar({
  'data-ui': hook,
  label,
  value,
  max = 1,
  valueText,
  className,
}: ProgressBarProps) {
  const share = progressShare(value, max);
  const fill = { '--bar-share': share } as CSSProperties;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(share * 100)}
      aria-valuetext={valueText}
      data-ui={hook}
      className={cx(styles.bar, className)}
      style={fill}
    >
      <span className={styles.barFill} />
    </div>
  );
}

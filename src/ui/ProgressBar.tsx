import styles from './display.module.css';

/** value ÷ max between 0 and 1; 0 when there is no max (≤ 0 or not a number). */
export function progressShare(value: number, max: number): number {
  if (!Number.isFinite(max) || max <= 0 || !Number.isFinite(value)) return 0;
  return Math.min(Math.max(value / max, 0), 1);
}

export interface ProgressBarProps {
  readonly value: number;
  readonly max: number;
  /** The bar's accessible name. */
  readonly label: string;
  /** What a screen reader says for the value, e.g. "3h 10m of 16h"; percent otherwise. */
  readonly valueText?: string;
  readonly 'data-ui'?: string;
}

/** A thin bar filled by value ÷ max, capped at full. Its value is exposed in percent. */
export function ProgressBar({ value, max, label, valueText, 'data-ui': dataUi }: ProgressBarProps) {
  const share = progressShare(value, max);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(share * 100)}
      aria-valuetext={valueText}
      className={styles.progress}
      data-ui={dataUi}
    >
      <span className={styles.progressFill} data-part="fill" style={{ width: `${share * 100}%` }} />
    </div>
  );
}

import { useId } from 'react';
import styles from './display.module.css';
import { clamp, cx, partHook } from './primitives';

/** The tube's width and height, in SVG units (drawn at the same size in CSS pixels). */
export const PILLAR_WIDTH = 16;
export const PILLAR_HEIGHT = 64;

/**
 * How tall the fill stands in the tube: its share of the goal, capped at the top, and never
 * shorter than the tube is wide, so even nothing (or no goal) shows a round dot at the bottom.
 */
export function pillarFillHeight(amount: number, goal: number): number {
  const share = goal > 0 ? amount / goal : 0;
  const height = PILLAR_HEIGHT * clamp(Number.isNaN(share) ? 0 : share, 0, 1);
  return Math.max(PILLAR_WIDTH, height);
}

export interface PillarProps {
  /** The root hook; parts get `<hook>.value`, `<hook>.fill` and `<hook>.status`. */
  readonly 'data-ui': string;
  /** The day's total so far, in the same unit as `goal`. */
  readonly amount: number;
  /** The amount that fills the tube; 0 or less means no goal. */
  readonly goal: number;
  /** The nutrient's name under the tube; it also names the pillar for screen readers. */
  readonly label: string;
  /** The total above the tube, formatted by the caller. */
  readonly value: string;
  /** The line under the name, e.g. how much is left or over. */
  readonly status: string;
  readonly className?: string;
}

/**
 * A nutrient pillar: a small rounded tube filling from the bottom toward the goal, the total
 * above it and the name and status below. The tube is hidden from screen readers; the texts
 * are read in the order they are shown.
 */
export function Pillar({
  'data-ui': hook,
  amount,
  goal,
  label,
  value,
  status,
  className,
}: PillarProps) {
  const labelId = useId();
  const fill = pillarFillHeight(amount, goal);
  const over = goal > 0 && amount > goal;
  const radius = PILLAR_WIDTH / 2;

  return (
    <div
      role="group"
      aria-labelledby={labelId}
      data-ui={hook}
      className={cx(styles.pillar, className)}
    >
      <span className={styles.pillarValue} data-ui={partHook(hook, 'value')}>
        {value}
      </span>
      <svg
        viewBox={`0 0 ${PILLAR_WIDTH} ${PILLAR_HEIGHT}`}
        className={styles.pillarTube}
        aria-hidden="true"
        focusable="false"
      >
        <rect
          className={styles.pillarTrack}
          width={PILLAR_WIDTH}
          height={PILLAR_HEIGHT}
          rx={radius}
        />
        <rect
          className={styles.pillarFill}
          y={PILLAR_HEIGHT - fill}
          width={PILLAR_WIDTH}
          height={fill}
          rx={radius}
          data-ui={partHook(hook, 'fill')}
        />
      </svg>
      <span id={labelId} className={styles.pillarName}>
        {label}
      </span>
      <span
        className={styles.pillarStatus}
        data-over={over || undefined}
        data-ui={partHook(hook, 'status')}
      >
        {status}
      </span>
    </div>
  );
}

import type { ReactNode } from 'react';
import styles from './display.module.css';

export interface StatBadgeProps {
  /** The figure, e.g. "72.4 kg". */
  readonly value: ReactNode;
  /** What the figure is, e.g. "Average". */
  readonly label: ReactNode;
  readonly 'data-ui'?: string;
}

/**
 * A small tinted tile: a bold value over a muted label. Both stay on one line; the type shrinks
 * with the tile's width rather than wrapping.
 */
export function StatBadge({ value, label, 'data-ui': dataUi }: StatBadgeProps) {
  return (
    <div className={styles.badge} data-ui={dataUi}>
      <span className={styles.badgeValue}>{value}</span>
      <span className={styles.badgeLabel}>{label}</span>
    </div>
  );
}

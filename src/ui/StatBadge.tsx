import styles from './display.module.css';
import { cx } from './primitives';

export interface StatBadgeProps {
  readonly 'data-ui': string;
  /** The figure, formatted by the caller (unit included). */
  readonly value: string;
  /** What the figure is, e.g. an average or a change. */
  readonly label: string;
  readonly className?: string;
}

/**
 * A small stat tile: the value drawn over its label. Both stay on one line and shrink with the
 * tile instead of wrapping. It is a one-pair description list, so a screen reader hears the
 * label, then the value.
 */
export function StatBadge({ 'data-ui': hook, value, label, className }: StatBadgeProps) {
  return (
    <dl data-ui={hook} className={cx(styles.badge, className)}>
      <dt className={styles.badgeLabel}>{label}</dt>
      <dd className={styles.badgeValue}>{value}</dd>
    </dl>
  );
}

import { useId } from 'react';
import type { BodyMetric } from '../../domain/progress/ranges';
import { t, type TKey } from '../../i18n/t';
import { Icon } from '../../ui/icons';
import styles from './readings.module.css';

/** The words of each metric's history: its title, the count line and the delete question. */
export const HISTORY_WORDS: Readonly<
  Record<BodyMetric, { readonly title: TKey; readonly count: TKey; readonly deleteTitle: TKey }>
> = {
  weight: {
    title: 'progress.history.weight.title',
    count: 'progress.history.weight.count',
    deleteTitle: 'progress.history.weight.deleteTitle',
  },
  bodyFat: {
    title: 'progress.history.bodyFat.title',
    count: 'progress.history.bodyFat.count',
    deleteTitle: 'progress.history.bodyFat.deleteTitle',
  },
};

export interface HistoryLinkProps {
  /** The metric on show; the link opens its history. */
  readonly metric: BodyMetric;
  /** How many readings of that metric are stored. */
  readonly count: number;
  readonly onOpen: () => void;
}

/**
 * The card under the metric card that opens its history: a list mark, the history's name, how
 * many readings it holds with a word on what the list is for, and a chevron. Nothing while the
 * metric has no readings at all.
 */
export function HistoryLink({ metric, count, onOpen }: HistoryLinkProps) {
  const id = useId();
  if (count <= 0) return null;
  const words = HISTORY_WORDS[metric];
  const titleId = `${id}-title`;
  const detailId = `${id}-detail`;
  return (
    <button
      type="button"
      className={styles.link}
      aria-labelledby={titleId}
      aria-describedby={detailId}
      data-ui="progress.history"
      onClick={onOpen}
    >
      <span className={styles.linkIcon} aria-hidden="true">
        <Icon name="text" size={18} />
      </span>
      <span className={styles.linkText}>
        <span id={titleId} className={styles.linkTitle}>
          {t(words.title)}
        </span>
        <span id={detailId} className={styles.linkDetail}>
          {t(words.count, { count })}
        </span>
      </span>
      <Icon name="chevronRight" size={18} className={styles.chevron} />
    </button>
  );
}

import type { DayKey } from '../../domain/dates/dayKey';
import {
  canGoLater,
  earlier,
  hasPeriods,
  later,
  periodWindow,
  PROGRESS_RANGES,
  withRange,
  type PeriodView,
  type ProgressRange,
} from '../../domain/progress/ranges';
import { formatPeriod } from '../../i18n/format';
import { t, type TKey } from '../../i18n/t';
import { IconButton } from '../../ui/Button';
import { Icon } from '../../ui/icons';
import { Segmented } from '../../ui/Segmented';
import styles from './progress.module.css';

const RANGE_LABELS: Readonly<Record<ProgressRange, TKey>> = {
  week: 'progress.range.week',
  month: 'progress.range.month',
  quarter: 'progress.range.quarter',
  half: 'progress.range.half',
  year: 'progress.range.year',
  all: 'progress.range.all',
};

const RANGE_OPTIONS = PROGRESS_RANGES.map((value) => ({ value, label: RANGE_LABELS[value] }));

export interface RangeBarProps {
  /** The range and period on show. */
  readonly view: PeriodView;
  readonly today: DayKey;
  readonly onChange: (view: PeriodView) => void;
}

/**
 * The range control (1W … All) and, for every range but All, the period row: arrows that step a
 * whole window back or forward (forward only from a past window) around the window's dates, the
 * year written only when an end is outside this year. Arrows rather than a swipe, because the
 * charts below take sideways drags for their inspectors.
 */
export function RangeBar({ view, today, onChange }: RangeBarProps) {
  const window = periodWindow(view, today);
  return (
    <div className={styles.rangeBar}>
      <Segmented
        label={t('progress.range.label')}
        options={RANGE_OPTIONS.map(({ value, label }) => ({ value, label: t(label) }))}
        value={view.range}
        onChange={(range) => onChange(withRange(view, range))}
        data-ui="progress.range"
      />
      {hasPeriods(view.range) ? (
        <div className={styles.period} data-ui="progress.period">
          <IconButton
            label={t('progress.period.earlier')}
            icon={<Icon name="chevronLeft" />}
            data-ui="progress.period.earlier"
            onClick={() => onChange(earlier(view))}
          />
          <p className={styles.periodLabel} aria-live="polite" data-ui="progress.period.label">
            {formatPeriod(window.first, window.last, today)}
          </p>
          <IconButton
            label={t('progress.period.later')}
            icon={<Icon name="chevronRight" />}
            disabled={!canGoLater(view)}
            data-ui="progress.period.later"
            onClick={() => onChange(later(view))}
          />
        </div>
      ) : null}
    </div>
  );
}

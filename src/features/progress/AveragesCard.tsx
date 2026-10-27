import { useId } from 'react';
import type { MassUnit } from '../../domain/nutrients/catalogue';
import { t } from '../../i18n/t';
import { Card } from '../../ui/Card';
import { progressShare } from '../../ui/ProgressBar';
import { amountWithUnit } from '../home/dayNutrients';
import styles from './nutrition.module.css';
import progressStyles from './progress.module.css';

/** One nutrient's average per logged day, in its storage unit. */
export interface AverageRow {
  readonly key: string;
  readonly name: string;
  readonly average: number;
  /** The daily goal; 0 means none. */
  readonly goal: number;
  readonly unit: MassUnit;
}

export interface AveragesCardProps {
  readonly title: string;
  readonly rows: readonly AverageRow[];
  readonly 'data-ui': string;
}

/** "93.3 g / 150 g", or the amount alone without a goal. One decimal only when not whole. */
export function averageText({ average, goal, unit }: AverageRow): string {
  const shown = amountWithUnit(average, unit);
  if (!(goal > 0)) return shown;
  return t('progress.averages.ofGoal', { average: shown, goal: amountWithUnit(goal, unit) });
}

/**
 * A card of averages: per row the nutrient's name, its average against the goal and a thin bar
 * filled by the share of the goal (full at or over it). The bar never shrinks below a dot, so a
 * row without a goal or with a tiny average still shows one.
 */
export function AveragesCard({ title, rows, 'data-ui': dataUi }: AveragesCardProps) {
  const headingId = useId();
  return (
    <Card
      as="section"
      aria-labelledby={headingId}
      className={progressStyles.metricCard}
      data-ui={dataUi}
    >
      <h2 id={headingId} className={progressStyles.cardTitle}>
        {title}
      </h2>
      <ul className={styles.rows}>
        {rows.map((row) => (
          <li key={row.key} className={styles.row} data-ui={`${dataUi}.${row.key}`}>
            <span className={styles.rowText}>
              <span className={styles.rowName}>{row.name}</span>
              <span className={styles.rowValue} data-part="value">
                {averageText(row)}
              </span>
            </span>
            <span className={styles.track} aria-hidden="true">
              <span
                className={styles.fill}
                data-part="fill"
                style={{ width: `${progressShare(row.average, row.goal) * 100}%` }}
              />
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

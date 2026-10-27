import { useId, useMemo } from 'react';
import type { CalorieDay } from '../../domain/progress/averages';
import { toDisplay, type EnergyDisplayUnit } from '../../domain/units/energy';
import { formatInt } from '../../i18n/format';
import { t } from '../../i18n/t';
import { Card } from '../../ui/Card';
import { BarChart } from '../../ui/charts/BarChart';
import { cx } from '../../ui/classes';
import { energyText } from '../home/energy';
import styles from './nutrition.module.css';
import progressStyles from './progress.module.css';

/** An amount already in the display unit, with its unit word: "2,140 kcal", "8,954 kJ". */
function displayedEnergy(value: number, unit: EnergyDisplayUnit): string {
  const amount = formatInt(value);
  return unit === 'kJ' ? t('home.energy.kJ', { amount }) : t('home.energy.kcal', { amount });
}

export interface CaloriesCardProps {
  /** The days with energy, oldest first, in kcal. A day left out gets no bar. */
  readonly days: readonly CalorieDay[];
  /** The whole-kcal mean of `days`; null when there is none. */
  readonly averageKcal: number | null;
  /** The daily calorie goal in kcal; 0 draws no goal line. */
  readonly goalKcal: number;
  readonly unit: EnergyDisplayUnit;
}

/**
 * The calorie history of the nutrition window: a heading with "Avg" (the whole mean of the days
 * with energy), then a bar per such day with the goal as a dashed line, or a short message when
 * no food was logged. Values show in kcal or kJ; the mean is taken in kcal first.
 */
export function CaloriesCard({ days, averageKcal, goalKcal, unit }: CaloriesCardProps) {
  const headingId = useId();
  const bars = useMemo(
    () => days.map(({ day, kcal }) => ({ day, value: toDisplay(kcal, unit) })),
    [days, unit],
  );
  const goal = goalKcal > 0 ? toDisplay(goalKcal, unit) : null;

  return (
    <Card
      as="section"
      aria-labelledby={headingId}
      className={progressStyles.metricCard}
      data-ui="progress.calories"
    >
      <div className={cx(progressStyles.cardHeader, styles.caloriesHeader)}>
        <h2 id={headingId} className={progressStyles.cardTitle}>
          {t('progress.calories.title')}
        </h2>
        {averageKcal === null ? null : (
          <p className={styles.average} data-ui="progress.calories.average">
            {t('progress.calories.average', { amount: energyText(averageKcal, unit) })}
          </p>
        )}
      </div>
      {bars.length === 0 ? (
        <p className={progressStyles.empty} data-ui="progress.calories.empty">
          {t('progress.calories.empty')}
        </p>
      ) : (
        <BarChart
          days={bars}
          goal={goal}
          label={t('progress.calories.chart')}
          valueLabel={t('progress.calories.title')}
          formatValue={(value) => displayedEnergy(value, unit)}
          data-ui="progress.calories.chart"
        />
      )}
    </Card>
  );
}

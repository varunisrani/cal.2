import { useId, useMemo, useState } from 'react';
import { useActivity, useSettings, type ActivityDay } from '../../data/hooks';
import type { DayKey } from '../../domain/dates/dayKey';
import { windowEnding } from '../../domain/dates/ranges';
import { toDisplay, type EnergyDisplayUnit } from '../../domain/units/energy';
import { formatDecimal, formatInt } from '../../i18n/format';
import { t } from '../../i18n/t';
import { Card } from '../../ui/Card';
import { BarChart, type BarChartDay } from '../../ui/charts/BarChart';
import { Segmented } from '../../ui/Segmented';
import { distanceIn, distanceText, distanceUnitOf } from '../home/distance';
import nutritionStyles from './nutrition.module.css';
import styles from './progress.module.css';

/** The two spans the card offers; Health Connect data is kept for 30 days. */
type ActivitySpan = 'week' | 'month';

const SPAN_DAYS: Readonly<Record<ActivitySpan, number>> = { week: 7, month: 30 };

const SETTINGS = ['units.energy', 'units.height'] as const;

/**
 * The days with a value above 0, as bars, and their mean (null without one). The mean is rounded
 * only where it is written, so a distance keeps its decimal.
 */
function series(
  days: readonly ActivityDay[],
  valueOf: (day: ActivityDay) => number | null,
): { bars: BarChartDay[]; average: number | null } {
  const bars = days.flatMap((day) => {
    const value = valueOf(day);
    return value !== null && value > 0 ? [{ day: day.day, value }] : [];
  });
  const sum = bars.reduce((total, bar) => total + bar.value, 0);
  return { bars, average: bars.length === 0 ? null : sum / bars.length };
}

/** An amount already in the display unit, with its unit word. */
function displayedEnergy(value: number, unit: EnergyDisplayUnit): string {
  const amount = formatInt(Math.round(value));
  return unit === 'kJ' ? t('home.energy.kJ', { amount }) : t('home.energy.kcal', { amount });
}

interface HistoryProps {
  readonly title: string;
  readonly chartLabel: string;
  readonly average: string | null;
  readonly bars: readonly BarChartDay[];
  readonly formatValue: (value: number) => string;
  readonly formatTick?: (value: number) => string;
  readonly 'data-ui': string;
}

function History({
  title,
  chartLabel,
  average,
  bars,
  formatValue,
  formatTick,
  'data-ui': ui,
}: HistoryProps) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className={styles.metricCard} data-ui={ui}>
      <div className={styles.cardHeader}>
        <h3 id={headingId} className={styles.cardTitle}>
          {title}
        </h3>
        {average === null ? null : <p className={nutritionStyles.average}>{average}</p>}
      </div>
      {bars.length === 0 ? null : (
        <BarChart
          days={bars}
          label={chartLabel}
          valueLabel={title}
          formatValue={formatValue}
          formatTick={formatTick}
          data-ui={`${ui}.chart`}
        />
      )}
    </section>
  );
}

export interface ActivityHistoryCardProps {
  readonly today: DayKey;
}

/**
 * Progress's activity card (P11-04), on the Android app while Health Connect is connected: the
 * last 7 or 30 days, today included, with a bar per day for steps and for active calories and the
 * mean of the days that have one; then, only when the days shown have any, the total calories
 * burned and the distance the same way (shown, never counted: D-16.89), the distance in km beside
 * centimetres and miles beside feet and inches, as Home writes it. Its span is its own: Health
 * Connect data is kept for 30 days, so the range bar above does not apply.
 */
export function ActivityHistoryCard({ today }: ActivityHistoryCardProps) {
  const headingId = useId();
  const [span, setSpan] = useState<ActivitySpan>('week');
  const window = windowEnding(today, SPAN_DAYS[span]);
  const read = useActivity(window.first, window.last);
  const settings = useSettings(SETTINGS);
  const days = read.status === 'ready' ? read.value : null;
  const unit = settings.status === 'ready' ? settings.value['units.energy'] : 'kcal';
  const distanceUnit = distanceUnitOf(
    settings.status === 'ready' ? settings.value['units.height'] : 'cm',
  );

  const steps = useMemo(() => series(days ?? [], (day) => day.steps), [days]);
  const active = useMemo(
    () =>
      series(days ?? [], (day) =>
        day.activeKcal === null ? null : toDisplay(day.activeKcal, unit),
      ),
    [days, unit],
  );
  const total = useMemo(
    () =>
      series(days ?? [], (day) => (day.totalKcal === null ? null : toDisplay(day.totalKcal, unit))),
    [days, unit],
  );
  const distance = useMemo(
    () =>
      series(days ?? [], (day) =>
        day.distanceM === null ? null : distanceIn(day.distanceM, distanceUnit),
      ),
    [days, distanceUnit],
  );

  let body;
  if (days === null || settings.status !== 'ready') {
    body = null;
  } else if ([steps, active, total, distance].every((figure) => figure.bars.length === 0)) {
    body = (
      <p className={styles.empty} data-ui="progress.activity.empty">
        {t('health.progress.empty')}
      </p>
    );
  } else {
    body = (
      <>
        <History
          title={t('health.progress.steps')}
          chartLabel={t('health.progress.stepsChart')}
          average={
            steps.average === null
              ? null
              : t('health.progress.average', { amount: formatInt(steps.average) })
          }
          bars={steps.bars}
          formatValue={(value) => t('health.home.steps', { count: value })}
          data-ui="progress.activity.steps"
        />
        <History
          title={t('health.progress.active')}
          chartLabel={t('health.progress.activeChart')}
          average={
            active.average === null
              ? null
              : t('health.progress.average', { amount: displayedEnergy(active.average, unit) })
          }
          bars={active.bars}
          formatValue={(value) => displayedEnergy(value, unit)}
          data-ui="progress.activity.active"
        />
        {total.average === null ? null : (
          <History
            title={t('health.progress.total')}
            chartLabel={t('health.progress.totalChart')}
            average={t('health.progress.average', {
              amount: displayedEnergy(total.average, unit),
            })}
            bars={total.bars}
            formatValue={(value) => displayedEnergy(value, unit)}
            data-ui="progress.activity.total"
          />
        )}
        {distance.average === null ? null : (
          <History
            title={t('health.progress.distance')}
            chartLabel={t('health.progress.distanceChart')}
            average={t('health.progress.average', {
              amount: distanceText(distance.average, distanceUnit),
            })}
            bars={distance.bars}
            formatValue={(value) => distanceText(value, distanceUnit)}
            formatTick={(value) => formatDecimal(value, 1)}
            data-ui="progress.activity.distance"
          />
        )}
      </>
    );
  }

  return (
    <Card
      as="section"
      aria-labelledby={headingId}
      className={styles.metricCard}
      data-ui="progress.activity"
    >
      <div className={styles.cardHeader}>
        <h2 id={headingId} className={styles.cardTitle}>
          {t('health.progress.title')}
        </h2>
      </div>
      <Segmented
        label={t('health.progress.days')}
        options={[
          { value: 'week', label: t('health.progress.week') },
          { value: 'month', label: t('health.progress.month') },
        ]}
        value={span}
        onChange={setSpan}
        data-ui="progress.activity.span"
      />
      {body}
    </Card>
  );
}

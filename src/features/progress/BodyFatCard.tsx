import { useId, useMemo } from 'react';
import type { BodyFatReading } from '../../domain/model';
import { changeToTenth, summarise } from '../../domain/progress/ranges';
import { formatNumber } from '../../domain/units/numbers';
import { formatDecimal, numberFormat } from '../../i18n/format';
import { currentLocale } from '../../i18n/locale';
import { t } from '../../i18n/t';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { LineChart } from '../../ui/charts/LineChart';
import { Icon } from '../../ui/icons';
import { StatBadge } from '../../ui/StatBadge';
import styles from './progress.module.css';

/** The chart pads at least one percentage point around the readings and the goal. */
const BODY_FAT_PAD = 1;
/** The chart's value axis never goes under 0 %. */
const BODY_FAT_FLOOR = 0;

const SIGNED_TENTH: Intl.NumberFormatOptions = {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
  signDisplay: 'exceptZero',
};

/** A value already in percent, one decimal and the sign: "18.5%". */
function percentAmount(percent: number): string {
  return t('progress.bodyFat.amount', { value: formatNumber(percent, currentLocale(), 1, 1) });
}

/** A stored body fat (a fraction) as Progress writes it: 0.185 → "18.5%". */
export function shownBodyFat(fraction: number): string {
  return percentAmount(fraction * 100);
}

/** A change in percentage points with its sign; closer to zero than 0.05 reads "0.0%". */
function signedPercent(change: number): string {
  const value = numberFormat(currentLocale(), SIGNED_TENTH).format(changeToTenth(change));
  return t('progress.bodyFat.amount', { value });
}

/** An axis label: whole percents stay short ("18%"), others keep one decimal ("17.5%"). */
function percentTick(percent: number): string {
  return t('progress.bodyFat.amount', { value: formatDecimal(percent, 1) });
}

export interface BodyFatCardProps {
  /** The readings on the window's days, oldest first. */
  readonly readings: readonly BodyFatReading[];
  /** The newest reading of all, inside the window or not. */
  readonly latest: BodyFatReading | null;
  /** The profile's body fat (a fraction), when set. */
  readonly profileValue?: number;
  /** The profile's goal body fat (a fraction), when set. */
  readonly goal?: number;
  /** Opens the Log body fat sheet. */
  readonly onLog: () => void;
}

/**
 * The body-fat card: a heading with "Log body fat", then a short prompt when there is nothing to
 * show at all (no reading on the window's days and no body fat known), or the badges: Current (the
 * newest reading of all, else the profile's value), Goal when one is set, and Net change and
 * Average only when the window has readings, which also bring the chart (axis from 0 %, percent
 * labels). Every figure has one decimal.
 */
export function BodyFatCard({ readings, latest, profileValue, goal, onLog }: BodyFatCardProps) {
  const headingId = useId();
  const points = useMemo(
    () => readings.map((reading) => ({ at: reading.at, value: reading.fraction * 100 })),
    [readings],
  );
  const summary = summarise(points);
  const current = latest?.fraction ?? profileValue;

  return (
    <Card
      as="section"
      aria-labelledby={headingId}
      className={styles.metricCard}
      data-ui="progress.bodyFat"
    >
      <div className={styles.cardHeader}>
        <h2 id={headingId} className={styles.cardTitle}>
          {t('progress.bodyFat.title')}
        </h2>
        <Button variant="quiet" data-ui="progress.bodyFat.log" onClick={onLog}>
          <Icon name="plus" size={18} className={styles.actionIcon} />
          {t('progress.bodyFat.log')}
        </Button>
      </div>
      {summary === null && current === undefined ? (
        <p className={styles.empty} data-ui="progress.bodyFat.empty">
          {t('progress.bodyFat.empty')}
        </p>
      ) : (
        <>
          <div className={styles.badges}>
            {current === undefined ? null : (
              <StatBadge
                value={shownBodyFat(current)}
                label={t('progress.bodyFat.current')}
                data-ui="progress.bodyFat.current"
              />
            )}
            {goal === undefined ? null : (
              <StatBadge
                value={shownBodyFat(goal)}
                label={t('progress.bodyFat.goal')}
                data-ui="progress.bodyFat.goal"
              />
            )}
            {summary === null ? null : (
              <>
                <StatBadge
                  value={signedPercent(summary.change)}
                  label={t('progress.bodyFat.change')}
                  data-ui="progress.bodyFat.change"
                />
                <StatBadge
                  value={percentAmount(summary.average)}
                  label={t('progress.bodyFat.average')}
                  data-ui="progress.bodyFat.average"
                />
              </>
            )}
          </div>
          {summary === null ? null : (
            <LineChart
              points={points}
              goal={goal === undefined ? null : goal * 100}
              minPad={BODY_FAT_PAD}
              floor={BODY_FAT_FLOOR}
              label={t('progress.bodyFat.chart')}
              valueLabel={t('progress.bodyFat.title')}
              formatValue={percentAmount}
              formatTick={percentTick}
              data-ui="progress.bodyFat.chart"
            />
          )}
        </>
      )}
    </Card>
  );
}

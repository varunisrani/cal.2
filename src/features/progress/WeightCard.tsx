import { useId, useMemo } from 'react';
import type { WeighIn } from '../../domain/model';
import { changeToTenth, summarise } from '../../domain/progress/ranges';
import { weightToDisplay, type WeightDisplayUnit } from '../../domain/units/body';
import { formatNumber } from '../../domain/units/numbers';
import { numberFormat } from '../../i18n/format';
import { currentLocale } from '../../i18n/locale';
import { t } from '../../i18n/t';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { LineChart } from '../../ui/charts/LineChart';
import { Icon } from '../../ui/icons';
import { StatBadge } from '../../ui/StatBadge';
import { shownWeight, WEIGHT_AMOUNT_KEYS } from '../onboarding/steps/WeightPicker';
import styles from './progress.module.css';

/** The chart pads at least this many units around the readings and the goal. */
const WEIGHT_PAD = 2;

/** A value already in the display unit, one decimal and the unit word: "70.0 kg". */
function displayedAmount(value: number, unit: WeightDisplayUnit): string {
  return t(WEIGHT_AMOUNT_KEYS[unit], { value: formatNumber(value, currentLocale(), 1, 1) });
}

const SIGNED_TENTH: Intl.NumberFormatOptions = {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
  signDisplay: 'exceptZero',
};

/**
 * A change in the display unit with its sign: "+1.9 kg", "-1.1 kg". A change closer to zero than
 * 0.05 reads "0.0 kg", with no sign (ACC-G3-2).
 */
function signedAmount(change: number, unit: WeightDisplayUnit): string {
  const value = numberFormat(currentLocale(), SIGNED_TENTH).format(changeToTenth(change));
  return t(WEIGHT_AMOUNT_KEYS[unit], { value });
}

export interface WeightCardProps {
  /** The weigh-ins on the window's days, oldest first. */
  readonly readings: readonly WeighIn[];
  /** The newest weigh-in of all, inside the window or not. */
  readonly latest: WeighIn | null;
  /** The profile's goal weight, when one is set. */
  readonly goalKg?: number;
  readonly unit: WeightDisplayUnit;
  /** Opens the Log weight sheet. */
  readonly onLog: () => void;
}

/**
 * The weight card: a heading with "Log weight", then either a short prompt (no weigh-ins on the
 * window's days) or four badges and the trend chart with the goal line. Current is the newest
 * weigh-in of all; Net change and Average are the window's. One decimal in the person's unit.
 */
export function WeightCard({ readings, latest, goalKg, unit, onLog }: WeightCardProps) {
  const headingId = useId();
  const points = useMemo(
    () => readings.map((reading) => ({ at: reading.at, value: weightToDisplay(reading.kg, unit) })),
    [readings, unit],
  );
  const summary = summarise(points);
  const goal = goalKg === undefined ? null : weightToDisplay(goalKg, unit);
  const amount = (value: number) => displayedAmount(value, unit);

  return (
    <Card
      as="section"
      aria-labelledby={headingId}
      className={styles.metricCard}
      data-ui="progress.weight"
    >
      <div className={styles.cardHeader}>
        <h2 id={headingId} className={styles.cardTitle}>
          {t('progress.weight.title')}
        </h2>
        <Button variant="quiet" data-ui="progress.weight.log" onClick={onLog}>
          <Icon name="plus" size={18} className={styles.actionIcon} />
          {t('progress.weight.log')}
        </Button>
      </div>
      {summary === null ? (
        <p className={styles.empty} data-ui="progress.weight.empty">
          {t('progress.weight.empty')}
        </p>
      ) : (
        <>
          <div className={styles.badges}>
            {latest ? (
              <StatBadge
                value={shownWeight(latest.kg, unit)}
                label={t('progress.weight.current')}
                data-ui="progress.weight.current"
              />
            ) : null}
            {goalKg === undefined ? null : (
              <StatBadge
                value={shownWeight(goalKg, unit)}
                label={t('progress.weight.goal')}
                data-ui="progress.weight.goal"
              />
            )}
            <StatBadge
              value={signedAmount(summary.change, unit)}
              label={t('progress.weight.change')}
              data-ui="progress.weight.change"
            />
            <StatBadge
              value={amount(summary.average)}
              label={t('progress.weight.average')}
              data-ui="progress.weight.average"
            />
          </div>
          <LineChart
            points={points}
            goal={goal}
            minPad={WEIGHT_PAD}
            label={t('progress.weight.chart')}
            valueLabel={t('progress.weight.title')}
            formatValue={amount}
            data-ui="progress.weight.chart"
          />
        </>
      )}
    </Card>
  );
}

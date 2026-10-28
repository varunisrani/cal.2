import { splitDayKey, type DayKey } from '../../../domain/dates/dayKey';
import type { SpendDay } from '../../../domain/money/report';
import { dateFormat, formatDay, formatMoney, numberFormat } from '../../../i18n/format';
import { currentLocale } from '../../../i18n/locale';
import { t } from '../../../i18n/t';
import { ChartTable } from '../../../ui/charts/ChartTable';
import styles from './spending.module.css';

/** Days at most whose bars carry their amount above them; longer periods label a few dates. */
const LABELLED_BARS = 7;
/** Every how many days a long period names a date under its bars, counted back from today. */
const DATE_EVERY = 7;
/** The first named date is this many days before today, so no date sits at the chart's edge. */
const DATE_OFFSET = 3;

const WEEKDAY: Intl.DateTimeFormatOptions = { weekday: 'short', timeZone: 'UTC' };

/** A day key at UTC midnight, for formats that take a Date. */
function dayDate(day: DayKey): Date {
  const { year, month, day: date } = splitDayKey(day);
  const at = new Date(0);
  at.setUTCFullYear(year, month - 1, date);
  return at;
}

/** A short amount above a bar: "₹240", "₹1.2K". */
function shortMoney(amount: number, currency: string): string {
  return numberFormat(currentLocale(), {
    style: 'currency',
    currency,
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(amount);
}

export interface SpendBarsProps {
  /** Every day of the period, oldest first; `amount` null for a day without prices. */
  readonly days: readonly SpendDay[];
  readonly currency: string;
  /** The chart's name, also the hidden table's caption. */
  readonly label: string;
}

/**
 * The period's spend as one bar a day (D-16.108): every day keeps its slot, so a day without
 * prices shows a hollow mark ("no prices"), never a bar of 0; a day whose prices add up to 0 has a
 * flat bar. A week carries each day's amount above its bar and its weekday under it; a longer
 * period names a date every week. The drawing is hidden from assistive tech; a hidden table lists
 * every day's amount or "No prices".
 */
export function SpendBars({ days, currency, label }: SpendBarsProps) {
  const peak = days.reduce((top, day) => Math.max(top, day.amount ?? 0), 0);
  const labelled = days.length <= LABELLED_BARS;
  const locale = currentLocale();
  const rows = days.map(({ day, amount }) => ({
    key: day,
    date: formatDay(day, 'medium'),
    value: amount === null ? t('spending.days.none') : formatMoney(amount, currency),
  }));

  return (
    <figure className={styles.chart} aria-label={label} data-ui="spending.bars">
      <div className={styles.bars} aria-hidden="true" data-count={days.length}>
        {days.map(({ day, amount }, index) => {
          let caption: string | null = null;
          if (labelled) caption = dateFormat(locale, WEEKDAY).format(dayDate(day));
          else if ((days.length - 1 - index) % DATE_EVERY === DATE_OFFSET) {
            caption = formatDay(day, 'short');
          }
          return (
            <div
              key={day}
              className={styles.slot}
              data-day={day}
              data-none={amount === null || undefined}
            >
              <span className={styles.amount}>
                {labelled && amount !== null ? shortMoney(amount, currency) : ''}
              </span>
              <span className={styles.track}>
                {amount === null ? (
                  <span className={styles.none} data-part="none" />
                ) : (
                  <span
                    className={styles.bar}
                    data-part="bar"
                    style={{ blockSize: `${peak > 0 ? (amount / peak) * 100 : 0}%` }}
                  />
                )}
              </span>
              <span className={styles.date}>{caption ?? ''}</span>
            </div>
          );
        })}
      </div>
      <ChartTable
        caption={label}
        valueLabel={t('spending.title')}
        rows={rows}
        data-ui="spending.bars.table"
      />
    </figure>
  );
}

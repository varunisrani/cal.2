import { useMemo, useState } from 'react';
import { tabRoute } from '../../../app/router';
import { useToday } from '../../../app/TodayProvider';
import { useRouter } from '../../../app/useRoute';
import { useEntriesBetween, useSettings } from '../../../data/hooks';
import {
  spendingReport,
  spendingWindow,
  type SpendingReport,
  type SpendPeriod,
} from '../../../domain/money/report';
import type { CurrencyTotal } from '../../../domain/money/spending';
import { dateFormat, formatMoney, formatMoneyList } from '../../../i18n/format';
import { currentLocale } from '../../../i18n/locale';
import { t } from '../../../i18n/t';
import { Card } from '../../../ui/Card';
import { Icon } from '../../../ui/icons';
import { Segmented } from '../../../ui/Segmented';
import { MEAL_NAME_KEYS } from '../../log/meals';
import { SpendBars } from './SpendBars';
import styles from './spending.module.css';

const SETTINGS = ['money.currency'] as const;

const MONTH: Intl.DateTimeFormatOptions = { month: 'long', year: 'numeric', timeZone: 'UTC' };

/** "October 2026" for `2026-10`. */
function monthName(month: string): string {
  const [year = 0, number = 1] = month.split('-').map(Number);
  const at = new Date(0);
  at.setUTCFullYear(year, number - 1, 1);
  return dateFormat(currentLocale(), MONTH).format(at);
}

/** An amount, or "No prices" for a stretch without any. */
function moneyOrNone(amount: number | null, currency: string): string {
  return amount === null ? t('spending.days.none') : formatMoney(amount, currency);
}

/** "Also €12.50 in other currencies", or nothing when every price was in the person's. */
function Others({
  totals,
  ui,
}: {
  readonly totals: readonly CurrencyTotal[];
  readonly ui: string;
}) {
  if (totals.length === 0) return null;
  return (
    <p className={styles.others} data-ui={ui}>
      {t('spending.others', { amounts: formatMoneyList(totals) })}
    </p>
  );
}

/** A list of names with an amount each, as the month, meal and food cards show them. */
function Rows({
  rows,
  ui,
}: {
  readonly rows: readonly { key: string; name: string; detail?: string; amount: string }[];
  readonly ui: string;
}) {
  return (
    <ul className={styles.rows} data-ui={ui}>
      {rows.map((row) => (
        <li key={row.key} className={styles.row} data-ui={`${ui}.row`}>
          <span className={styles.rowName}>
            <span>{row.name}</span>
            {row.detail ? <span className={styles.rowDetail}>{row.detail}</span> : null}
          </span>
          <span className={styles.rowAmount}>{row.amount}</span>
        </li>
      ))}
    </ul>
  );
}

function Report({
  report,
  period,
  onPeriod,
}: {
  readonly report: SpendingReport;
  readonly period: SpendPeriod;
  readonly onPeriod: (period: SpendPeriod) => void;
}) {
  const { currency, month } = report;
  return (
    <>
      <Segmented
        label={t('spending.period.label')}
        options={[
          { value: '7', label: t('spending.period.week') },
          { value: '30', label: t('spending.period.month') },
        ]}
        value={String(period) as '7' | '30'}
        onChange={(value) => onPeriod(value === '7' ? 7 : 30)}
        data-ui="spending.period"
      />
      <Card heading={t('spending.days.title')} className={styles.card} data-ui="spending.days">
        <p className={styles.lead} data-ui="spending.days.total">
          {report.periodTotal === null
            ? t('spending.days.none')
            : t('spending.days.total', { amount: formatMoney(report.periodTotal, currency) })}
        </p>
        <SpendBars days={report.days} currency={currency} label={t('spending.days.chart')} />
        <Others totals={report.periodOthers} ui="spending.days.others" />
      </Card>
      <Card heading={t('spending.month.title')} className={styles.card} data-ui="spending.month">
        <p className={styles.big} data-ui="spending.month.total">
          {moneyOrNone(month.total, currency)}
        </p>
        {month.average === null ? null : (
          <>
            <p className={styles.lead} data-ui="spending.month.days">
              {t('spending.month.days', { count: month.pricedDays })}
            </p>
            <dl className={styles.facts}>
              <dt>{t('spending.month.average')}</dt>
              <dd data-ui="spending.month.average">{formatMoney(month.average, currency)}</dd>
            </dl>
          </>
        )}
        <Others totals={month.others} ui="spending.month.others" />
      </Card>
      {report.months.length > 0 ? (
        <Card heading={t('spending.months')} className={styles.card} data-ui="spending.months">
          <Rows
            ui="spending.months.list"
            rows={report.months.map(({ month: key, amount }) => ({
              key,
              name: monthName(key),
              amount: moneyOrNone(amount, currency),
            }))}
          />
        </Card>
      ) : null}
      {report.meals.length > 0 ? (
        <Card heading={t('spending.meals')} className={styles.card} data-ui="spending.meals">
          <Rows
            ui="spending.meals.list"
            rows={report.meals.map(({ meal, amount }) => ({
              key: meal,
              name: t(MEAL_NAME_KEYS[meal]),
              amount: formatMoney(amount, currency),
            }))}
          />
        </Card>
      ) : null}
      {report.topFoods.length > 0 ? (
        <Card heading={t('spending.top.title')} className={styles.card} data-ui="spending.top">
          <Rows
            ui="spending.top.list"
            rows={report.topFoods.map(({ name, amount, count }) => ({
              key: name,
              name,
              detail: t('spending.top.times', { count }),
              amount: formatMoney(amount, currency),
            }))}
          />
        </Card>
      ) : null}
    </>
  );
}

/**
 * Progress › Spending (D-16.108), at `#/progress/spending`: what food cost in the person's
 * currency. The last 7 or 30 days as bars (a day without prices marked, never 0), with their total;
 * this month's total, the average per day with a price and how many such days; the months from
 * the first with a price (at most 12); the period by meal and the foods that cost most. Prices in
 * another currency are totalled apart under the bars and the month. Without any price yet, a word
 * on how to add one. A back link returns to Progress. The period opens on 7 days at every visit.
 */
export function SpendingPage() {
  const today = useToday();
  const router = useRouter();
  const settings = useSettings(SETTINGS);
  const window = spendingWindow(today);
  const entries = useEntriesBetween(window.first, window.last);
  const [period, setPeriod] = useState<SpendPeriod>(7);

  const list = entries.status === 'ready' ? entries.value : null;
  const currency = settings.status === 'ready' ? settings.value['money.currency'] : null;
  const report = useMemo(
    () =>
      list === null || currency === null
        ? null
        : spendingReport({ entries: list, today, currency, period }),
    [list, currency, today, period],
  );

  let body;
  if (entries.status === 'error' || settings.status === 'error') {
    body = (
      <Card data-ui="spending.error">
        <p className={styles.empty}>{t('spending.loadFailed')}</p>
      </Card>
    );
  } else if (report === null) {
    body = <div className={styles.placeholder} aria-hidden="true" data-ui="spending.loading" />;
  } else if (!report.anyPrice) {
    body = (
      <Card data-ui="spending.empty">
        <p className={styles.empty}>{t('spending.empty')}</p>
      </Card>
    );
  } else {
    body = <Report report={report} period={period} onPeriod={setPeriod} />;
  }

  const loading = entries.status === 'loading' || settings.status === 'loading';
  return (
    <section
      className={styles.page}
      aria-busy={loading || undefined}
      data-ui="screen.progress.spending"
    >
      <button
        type="button"
        className={styles.back}
        data-ui="spending.back"
        onClick={() => router.navigate(tabRoute('progress'))}
      >
        <Icon name="chevronLeft" size={20} />
        <span>{t('common.tabs.progress')}</span>
      </button>
      <h1 className={styles.title}>{t('spending.title')}</h1>
      {body}
    </section>
  );
}

import { useId, useMemo, useState } from 'react';
import { useToday } from '../../app/TodayProvider';
import { useEntriesBetween, useSettings, useTargets, useWeighIns } from '../../data/hooks';
import type { DayKey } from '../../domain/dates/dayKey';
import type { WeekStart } from '../../domain/dates/week';
import { changeToTenth } from '../../domain/progress/ranges';
import {
  buildRecap,
  hasActivity,
  recapSpan,
  WEEK_DAYS,
  type Highlight,
  type WeeklyRecap,
} from '../../domain/progress/recap';
import { weightToDisplay, type WeightDisplayUnit } from '../../domain/units/body';
import { formatEnergy, type EnergyDisplayUnit } from '../../domain/units/energy';
import { formatPeriod, numberFormat } from '../../i18n/format';
import { currentLocale } from '../../i18n/locale';
import { t, type TKey } from '../../i18n/t';
import { IconButton } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { cx } from '../../ui/classes';
import { Icon } from '../../ui/icons';
import { WEIGHT_AMOUNT_KEYS } from '../onboarding/steps/WeightPicker';
import styles from './recap.module.css';

const SETTINGS = ['display.weekStart', 'units.energy', 'units.weight'] as const;

const NEAR_GOAL_LABELS: Readonly<Record<EnergyDisplayUnit, TKey>> = {
  kcal: 'progress.recap.nearGoal.kcal',
  kJ: 'progress.recap.nearGoal.kJ',
};

const AVERAGE_LABELS: Readonly<Record<EnergyDisplayUnit, TKey>> = {
  kcal: 'progress.recap.average.kcal',
  kJ: 'progress.recap.average.kJ',
};

const MORE_NEAR_GOAL: Readonly<Record<EnergyDisplayUnit, TKey>> = {
  kcal: 'progress.recap.highlight.moreNearGoal.kcal',
  kJ: 'progress.recap.highlight.moreNearGoal.kJ',
};

const AVERAGE_NEAR_GOAL: Readonly<Record<EnergyDisplayUnit, TKey>> = {
  kcal: 'progress.recap.highlight.averageNearGoal.kcal',
  kJ: 'progress.recap.highlight.averageNearGoal.kJ',
};

const SIGNED_TENTH: Intl.NumberFormatOptions = {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
  signDisplay: 'exceptZero',
};

/** A weight change in the display unit as the weight card writes it: "-0.6 kg", "0.0 lb". */
function signedWeight(changeKg: number, unit: WeightDisplayUnit): string {
  const tenth = changeToTenth(weightToDisplay(changeKg, unit));
  return t(WEIGHT_AMOUNT_KEYS[unit], {
    value: numberFormat(currentLocale(), SIGNED_TENTH).format(tenth),
  });
}

/** "5/7". */
function dayCount(days: number): string {
  return t('progress.recap.days', { count: days, week: WEEK_DAYS });
}

/** A tile's change from the week before ("+2", "−1", "0"), and whether it is better. */
function changeFrom(now: number, before: number): { detail: string; better: boolean } {
  const delta = now - before;
  let key: TKey = 'progress.recap.change.same';
  if (delta > 0) key = 'progress.recap.change.up';
  else if (delta < 0) key = 'progress.recap.change.down';
  return { detail: t(key, { amount: Math.abs(delta) }), better: delta > 0 };
}

function highlightText(line: Highlight, energy: EnergyDisplayUnit): string {
  switch (line.kind) {
    case 'everyDay':
      return t('progress.recap.highlight.everyDay');
    case 'run':
      return t('progress.recap.highlight.run', { days: line.days });
    case 'moreNearGoal':
      return t(MORE_NEAR_GOAL[energy], { more: line.more });
    case 'moreProtein':
      return t('progress.recap.highlight.moreProtein', { more: line.more });
    case 'averageNearGoal':
      return t(AVERAGE_NEAR_GOAL[energy]);
    case 'moreLogged':
      return t('progress.recap.highlight.moreLogged', { more: line.more });
  }
}

interface TileProps {
  readonly value: string;
  readonly label: string;
  readonly detail: string;
  /** Drawn in the accent: the week did better than the one before. */
  readonly better: boolean;
  readonly 'data-ui': string;
}

function Tile({ value, label, detail, better, 'data-ui': dataUi }: TileProps) {
  return (
    <li className={styles.tile} data-ui={dataUi}>
      <span className={styles.tileValue}>{value}</span>
      <span className={styles.tileLabel}>{label}</span>
      <span
        className={cx(styles.tileDetail, better && styles.better)}
        data-better={better || undefined}
      >
        {detail}
      </span>
    </li>
  );
}

function RecapPlaceholder() {
  return <div className={styles.placeholder} aria-hidden="true" data-ui="progress.recap.loading" />;
}

function RecapFailed() {
  return (
    <Card data-ui="progress.recap.error">
      <p className={styles.empty}>{t('progress.recap.loadFailed')}</p>
    </Card>
  );
}

interface RecapWeekProps {
  readonly today: DayKey;
  readonly weekStart: WeekStart;
  readonly energy: EnergyDisplayUnit;
  readonly weight: WeightDisplayUnit;
  readonly kcalGoal: number;
  readonly proteinGoal: number;
  /** Weeks back from the last one that has ended. */
  readonly offset: number;
  readonly onEarlier: () => void;
  readonly onLater: () => void;
}

/** The card for one week: reads the food entries and weigh-ins of that week and the one before. */
function RecapWeek({
  today,
  weekStart,
  energy,
  weight,
  kcalGoal,
  proteinGoal,
  offset,
  onEarlier,
  onLater,
}: RecapWeekProps) {
  const headingId = useId();
  const span = recapSpan(today, weekStart, offset);
  // Food entries only: water logs and fasts are never read here (R05.4).
  const entries = useEntriesBetween(span.first, span.last);
  const weighIns = useWeighIns(span.first, span.last);
  const fresh = useMemo(
    () =>
      entries.status === 'ready' && weighIns.status === 'ready'
        ? buildRecap({
            todayKey: today,
            weekStart,
            offset,
            entries: entries.value,
            weighIns: weighIns.value,
            goals: { kcal: kcalGoal, protein: proteinGoal },
          })
        : null,
    [entries, weighIns, today, weekStart, offset, kcalGoal, proteinGoal],
  );
  // While another week is read, the last one stays on show (busy) instead of a blank block.
  const [last, setLast] = useState<WeeklyRecap | null>(null);
  if (fresh !== null && fresh !== last) setLast(fresh);
  const shown = fresh ?? last;

  if (entries.status === 'error' || weighIns.status === 'error') return <RecapFailed />;
  if (shown === null) return <RecapPlaceholder />;

  const { week, tally, before, highlights } = shown;
  const locale = currentLocale();
  const average =
    tally.averageKcal === null
      ? t('progress.recap.noAverage')
      : formatEnergy(tally.averageKcal, energy, locale);

  return (
    <Card
      as="section"
      aria-labelledby={headingId}
      aria-busy={fresh === null || undefined}
      className={styles.card}
      data-ui="progress.recap"
    >
      <h2 id={headingId} className={styles.title}>
        {t('progress.recap.title')}
      </h2>
      <div className={styles.week}>
        <IconButton
          label={t('progress.recap.earlier')}
          icon={<Icon name="chevronLeft" />}
          data-ui="progress.recap.earlier"
          onClick={onEarlier}
        />
        <p className={styles.weekLabel} aria-live="polite" data-ui="progress.recap.dates">
          {formatPeriod(week.first, week.last, today)}
        </p>
        <IconButton
          label={t('progress.recap.later')}
          icon={<Icon name="chevronRight" />}
          disabled={offset <= 0}
          data-ui="progress.recap.later"
          onClick={onLater}
        />
      </div>
      {hasActivity(tally) ? (
        <>
          <ul className={styles.tiles}>
            <Tile
              value={dayCount(tally.loggedDays)}
              label={t('progress.recap.logged')}
              {...changeFrom(tally.loggedDays, before.loggedDays)}
              data-ui="progress.recap.logged"
            />
            <Tile
              value={dayCount(tally.nearGoalDays)}
              label={t(NEAR_GOAL_LABELS[energy])}
              {...changeFrom(tally.nearGoalDays, before.nearGoalDays)}
              data-ui="progress.recap.nearGoal"
            />
            <Tile
              value={dayCount(tally.proteinDays)}
              label={t('progress.recap.protein')}
              {...changeFrom(tally.proteinDays, before.proteinDays)}
              data-ui="progress.recap.protein"
            />
            <Tile
              value={average}
              label={t(AVERAGE_LABELS[energy])}
              detail={t('progress.recap.goal', { amount: formatEnergy(kcalGoal, energy, locale) })}
              better={false}
              data-ui="progress.recap.average"
            />
          </ul>
          {tally.weightChangeKg === null ? null : (
            <p className={styles.line} data-ui="progress.recap.weight">
              <Icon name="scale" size={18} className={styles.lineIcon} />
              <span className={styles.lineText}>{t('progress.recap.weightChange')}</span>
              <span className={styles.lineValue}>{signedWeight(tally.weightChangeKg, weight)}</span>
            </p>
          )}
          {highlights.length > 0 ? (
            <ul className={styles.lines} data-ui="progress.recap.highlights">
              {highlights.map((line) => (
                <li key={line.kind} className={styles.line}>
                  <Icon name="check" size={18} className={styles.lineIcon} />
                  <span className={styles.lineText}>{highlightText(line, energy)}</span>
                </li>
              ))}
            </ul>
          ) : null}
          <p className={styles.note}>{t('progress.recap.note')}</p>
        </>
      ) : (
        <p className={styles.empty} data-ui="progress.recap.empty">
          {t('progress.recap.empty')}
        </p>
      )}
    </Card>
  );
}

/**
 * The weekly recap at the top of Progress: the last week that has ended, by the app's week start,
 * against the week before it. Four tiles (days logged, days near the calorie goal, days the
 * protein goal was met, each with its change, and the average with the goal), the weight change,
 * up to three lines of good news and a note; a week without food or weigh-ins shows one message.
 * The arrows step to earlier weeks and back; how far back is kept only while the page is open.
 * Today comes from `useToday()`, which looks again when the page is shown after a night away, so
 * a week that ended meanwhile takes over. Energy is shown in the person's unit; every count is
 * worked out in kcal. Nothing is drawn without a profile, which holds the goals.
 */
export function RecapCard() {
  const today = useToday();
  const settings = useSettings(SETTINGS);
  const targets = useTargets(today);
  const [offset, setOffset] = useState(0);

  if (settings.status === 'error' || targets.status === 'error') return <RecapFailed />;
  if (settings.status !== 'ready' || targets.status !== 'ready') return <RecapPlaceholder />;
  if (targets.value.kind !== 'ok') return null;

  return (
    <RecapWeek
      today={today}
      weekStart={settings.value['display.weekStart']}
      energy={settings.value['units.energy']}
      weight={settings.value['units.weight']}
      kcalGoal={targets.value.targets.kcal}
      proteinGoal={targets.value.targets.protein}
      offset={offset}
      onEarlier={() => setOffset((weeks) => weeks + 1)}
      onLater={() => setOffset((weeks) => Math.max(0, weeks - 1))}
    />
  );
}

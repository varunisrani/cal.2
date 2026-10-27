import { useMemo } from 'react';
import { useToday } from '../../app/TodayProvider';
import { useEntriesBetween, useSettings, useTargets } from '../../data/hooks';
import type { DayWindow } from '../../domain/dates/ranges';
import { MACRO_KEYS } from '../../domain/model';
import { isGoalKey, unitOf, type GoalKey } from '../../domain/nutrients/catalogue';
import type { WindowNutritionInput } from '../../domain/progress/averages';
import { t } from '../../i18n/t';
import { Card } from '../../ui/Card';
import { NO_TARGETS, nutrientName, PICKER_ORDER } from '../home/dayNutrients';
import { AveragesCard, type AverageRow } from './AveragesCard';
import { CaloriesCard } from './CaloriesCard';
import styles from './nutrition.module.css';
import progressStyles from './progress.module.css';
import { useNutritionStats } from './useNutritionStats';

const SETTINGS = ['units.energy', 'goals.nutrients'] as const;

/** The nutrients averaged after the macros, in the order Home's pillar picker lists them. */
const AVERAGED: readonly GoalKey[] = PICKER_ORDER.filter(isGoalKey);

export interface NutritionCardsProps {
  /** The nutrition window: the period, ending yesterday while Count today is off. */
  readonly window: DayWindow;
}

/**
 * The Calories card and the macro and nutrient averages over the nutrition window, from the
 * window's diary entries only (water and fasts are never read here, R05.4). The numbers are worked
 * out in slices; a newer window, entry list or goal list cancels the run in progress. A loading
 * card stands in until the first numbers are in; after that the shown numbers stay, under a small
 * spinner, until newer ones replace them.
 */
export function NutritionCards({ window }: NutritionCardsProps) {
  const today = useToday();
  const { first, last } = window;
  const entries = useEntriesBetween(first, last);
  const targets = useTargets(today);
  const settings = useSettings(SETTINGS);

  const list = entries.status === 'ready' ? entries.value : null;
  const goals = settings.status === 'ready' ? settings.value['goals.nutrients'] : null;
  const input = useMemo<WindowNutritionInput | null>(
    () =>
      list === null || goals === null
        ? null
        : { entries: list, window: { first, last }, goals, keys: AVERAGED },
    [list, goals, first, last],
  );
  const { stats, stale } = useNutritionStats(input);

  if ([entries, targets, settings].some((read) => read.status === 'error')) {
    return (
      <Card data-ui="progress.nutrition.error">
        <p className={progressStyles.empty}>{t('progress.nutrition.loadFailed')}</p>
      </Card>
    );
  }
  if (stats === null || targets.status !== 'ready' || settings.status !== 'ready') {
    return (
      <Card data-ui="progress.nutrition.loading">
        <p className={styles.loading} role="status">
          <span className={styles.spinner} aria-hidden="true" />
          {t('progress.nutrition.loading')}
        </p>
      </Card>
    );
  }

  const plan = targets.value.kind === 'ok' ? targets.value.targets : NO_TARGETS;
  const macros: AverageRow[] = MACRO_KEYS.map((key) => ({
    key,
    name: nutrientName(key),
    average: stats.macros[key],
    goal: plan[key],
    unit: 'g',
  }));
  const nutrients: AverageRow[] = stats.nutrients.map(({ key, average, goal }) => ({
    key,
    name: nutrientName(key),
    average,
    goal,
    unit: unitOf(key),
  }));

  return (
    <div className={styles.group} aria-busy={stale || undefined} data-ui="progress.nutrition">
      <CaloriesCard
        days={stats.calorieDays}
        averageKcal={stats.averageKcal}
        goalKcal={plan.kcal}
        unit={settings.value['units.energy']}
      />
      <AveragesCard title={t('progress.averages.macros')} rows={macros} data-ui="progress.macros" />
      {nutrients.length > 0 ? (
        <AveragesCard
          title={t('progress.averages.nutrients')}
          rows={nutrients}
          data-ui="progress.nutrients"
        />
      ) : null}
      {stale ? (
        <span
          className={styles.updating}
          role="status"
          aria-label={t('progress.nutrition.updating')}
          data-ui="progress.nutrition.updating"
        >
          <span className={styles.spinner} aria-hidden="true" />
        </span>
      ) : null}
    </div>
  );
}

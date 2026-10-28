import { Suspense, useMemo, useState } from 'react';
import { onDemand } from '../../app/onDemand';
import { useToday } from '../../app/TodayProvider';
import { useSheet } from '../../app/useRoute';
import { useBodyFat, useProfile, useSettings, useWeighIns } from '../../data/hooks';
import type { DayKey } from '../../domain/dates/dayKey';
import type { BodyFatReading, WeighIn } from '../../domain/model';
import {
  availableMetrics,
  FIRST_READABLE_DAY,
  FIRST_VIEW,
  hasPeriods,
  nutritionWindow,
  periodWindow,
  readingsIn,
  shownMetric,
  type BodyMetric,
  type PeriodView,
} from '../../domain/progress/ranges';
import { latestWeighIn } from '../../domain/trackers/goalCrossing';
import { formatPeriod } from '../../i18n/format';
import { t } from '../../i18n/t';
import { useServices } from '../../services/context';
import { Card } from '../../ui/Card';
import { Switch } from '../../ui/Switch';
import { useToast } from '../../ui/Toast';
import { shownWeight } from '../onboarding/steps/WeightPicker';
import { BodyFatCard, shownBodyFat } from './BodyFatCard';
import { HistoryLink } from './HistoryLink';
import { HISTORY_SHEET, HistorySheet, type HistoryReading } from './HistorySheet';
import { LogBodyFatSheet, seedBodyFat } from './LogBodyFatSheet';
import { LogWeightSheet, seedWeightKg } from './LogWeightSheet';
import { MetricSwitch } from './MetricSwitch';
import { NutritionCards } from './NutritionCards';
import styles from './progress.module.css';
import { RangeBar } from './RangeBar';
import { RecapCard } from './RecapCard';
import { WeightCard } from './WeightCard';

/** The Log weight sheet's place on the sheet stack. */
export const LOG_WEIGHT_SHEET = 'logWeight';
/** The Log body fat sheet's place on the sheet stack. */
export const LOG_BODY_FAT_SHEET = 'logBodyFat';

const SETTINGS = ['units.weight', 'progress.countToday', 'health.connected'] as const;

// Health Connect's card (P11-04) exists only in the Android app; fetched when it is first drawn.
const ActivityHistoryCard = onDemand(() =>
  import('./ActivityHistoryCard').then((module) => module.ActivityHistoryCard),
);

// Progress › Walks (P15-03) exists only where the app records walks; fetched when first drawn.
const WalksCard = onDemand(() => import('../walk/WalksCard').then((module) => module.WalksCard));

const NO_WEIGH_INS: readonly WeighIn[] = [];
const NO_BODY_FAT: readonly BodyFatReading[] = [];
const NO_HISTORY: readonly HistoryReading[] = [];

interface CountTodayProps {
  readonly on: boolean;
  readonly view: PeriodView;
  readonly today: DayKey;
  readonly onChange: (on: boolean) => void;
}

/**
 * The Count today switch. While it is off the calorie chart and the averages end yesterday, and
 * the caption names the days they cover (for every range but All, whose window has no label).
 */
function CountToday({ on, view, today, onChange }: CountTodayProps) {
  let description = t('progress.countToday.on');
  if (!on && hasPeriods(view.range)) {
    const window = nutritionWindow(view, today, false);
    const period = formatPeriod(window.first, window.last, today);
    description = t('progress.countToday.offWindow', { period });
  } else if (!on) {
    description = t('progress.countToday.off');
  }
  return (
    <Card className={styles.switchCard}>
      <Switch
        label={t('progress.countToday.label')}
        description={description}
        checked={on}
        onChange={onChange}
        data-ui="progress.countToday"
      />
    </Card>
  );
}

/**
 * The Progress tab: the recap, the range and its periods, the metric switch with the chosen
 * metric's card and history, the Count today switch and the nutrition cards, then, on the
 * Android app with Health Connect connected, the activity card (P11-04), and where the app records
 * walks, the Walks card with the week's moderate minutes and every walk (P15-03). Nothing with a
 * number is drawn until the settings, the profile and every weigh-in and body-fat reading are
 * read. The range opens on 1W at every visit and is never stored; Count today is stored.
 */
export function ProgressPage() {
  const today = useToday();
  const services = useServices();
  const toast = useToast();
  const settings = useSettings(SETTINGS);
  const profileRead = useProfile();
  const weighIns = useWeighIns(FIRST_READABLE_DAY, today);
  const bodyFat = useBodyFat(FIRST_READABLE_DAY, today);
  const logWeight = useSheet(LOG_WEIGHT_SHEET);
  const logBodyFat = useSheet(LOG_BODY_FAT_SHEET);
  const history = useSheet(HISTORY_SHEET);
  const [view, setView] = useState<PeriodView>(FIRST_VIEW);
  const [chosen, setChosen] = useState<BodyMetric>('weight');

  const { first, last } = periodWindow(view, today);
  const allWeighIns = weighIns.status === 'ready' ? weighIns.value : NO_WEIGH_INS;
  const inWindow = useMemo(
    () => readingsIn(allWeighIns, { first, last }),
    [allWeighIns, first, last],
  );
  const latest = useMemo(() => latestWeighIn(allWeighIns), [allWeighIns]);
  const allBodyFat = bodyFat.status === 'ready' ? bodyFat.value : NO_BODY_FAT;
  const bodyFatInWindow = useMemo(
    () => readingsIn(allBodyFat, { first, last }),
    [allBodyFat, first, last],
  );
  const latestBodyFat = useMemo(() => latestWeighIn(allBodyFat), [allBodyFat]);

  const setCountToday = (on: boolean): void => {
    const progress = services.progress;
    if (!progress) throw new Error('Progress: no progress service above it');
    progress.setCountToday(on).catch((error: unknown) => {
      console.error('Storing Count today failed', error);
      toast.show(t('progress.countToday.failed'));
    });
  };

  const reads = [settings, profileRead, weighIns, bodyFat];
  const failed = reads.some((read) => read.status === 'error');
  let body;
  if (failed) {
    body = (
      <Card data-ui="progress.error">
        <p className={styles.empty}>{t('progress.loadFailed')}</p>
      </Card>
    );
  } else if (
    settings.status === 'ready' &&
    profileRead.status === 'ready' &&
    weighIns.status === 'ready' &&
    bodyFat.status === 'ready'
  ) {
    const profile = profileRead.value.kind === 'ok' ? profileRead.value.value : null;
    const unit = settings.value['units.weight'];
    const countToday = settings.value['progress.countToday'];
    const metrics = availableMetrics({
      readings: bodyFat.value.length,
      profileValue: profile?.bodyFat,
      goal: profile?.goalBodyFat,
    });
    const metric = shownMetric(chosen, metrics);
    // A metric that went away stays away: Weight is the choice from then on.
    if (metric !== chosen) setChosen(metric);
    // Only the open history is written out; the link needs just the count.
    let historyRows = NO_HISTORY;
    if (history.open) {
      historyRows =
        metric === 'weight'
          ? allWeighIns.map(({ id, at, kg }) => ({ id, at, value: shownWeight(kg, unit) }))
          : allBodyFat.map(({ id, at, fraction }) => ({ id, at, value: shownBodyFat(fraction) }));
    }
    body = (
      <>
        <RecapCard />
        <RangeBar view={view} today={today} onChange={setView} />
        <MetricSwitch metrics={metrics} value={metric} onChange={setChosen} />
        {metric === 'weight' ? (
          <WeightCard
            readings={inWindow}
            latest={latest}
            goalKg={profile?.goalWeightKg}
            unit={unit}
            onLog={logWeight.show}
          />
        ) : (
          <BodyFatCard
            readings={bodyFatInWindow}
            latest={latestBodyFat}
            profileValue={profile?.bodyFat}
            goal={profile?.goalBodyFat}
            onLog={logBodyFat.show}
          />
        )}
        <HistoryLink
          metric={metric}
          count={metric === 'weight' ? allWeighIns.length : allBodyFat.length}
          onOpen={history.show}
        />
        <CountToday on={countToday} view={view} today={today} onChange={setCountToday} />
        <NutritionCards window={nutritionWindow(view, today, countToday)} />
        {services.health && settings.value['health.connected'] ? (
          <Suspense fallback={null}>
            <ActivityHistoryCard today={today} />
          </Suspense>
        ) : null}
        {services.walks ? (
          <Suspense fallback={null}>
            <WalksCard today={today} />
          </Suspense>
        ) : null}
        <LogWeightSheet
          open={logWeight.open}
          seedKg={seedWeightKg(latest?.kg, profile?.weightKg)}
          unit={unit}
          onClose={logWeight.close}
        />
        <LogBodyFatSheet
          open={logBodyFat.open}
          seed={seedBodyFat(latestBodyFat?.fraction, profile?.bodyFat)}
          onClose={logBodyFat.close}
        />
        <HistorySheet
          open={history.open}
          metric={metric}
          readings={historyRows}
          onClose={history.close}
        />
      </>
    );
  } else {
    body = (
      <div className={styles.placeholder} aria-hidden="true" data-ui="progress.loading">
        <div className={styles.placeholderBar} />
        <div className={styles.placeholderCard} />
        <div className={styles.placeholderBar} />
      </div>
    );
  }

  return (
    <section
      className={styles.page}
      aria-busy={reads.some((read) => read.status === 'loading') || undefined}
      data-ui="screen.progress"
    >
      <h1 className={styles.title}>{t('common.tabs.progress')}</h1>
      {body}
    </section>
  );
}

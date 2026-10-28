import { useEffect, useMemo, useState } from 'react';
import { useProfile } from '../../data/hooks';
import { walkStats } from '../../domain/walks/stats';
import type { EnergyDisplayUnit } from '../../domain/units/energy';
import { formatNumber } from '../../domain/units/numbers';
import { currentLocale } from '../../i18n/locale';
import { t } from '../../i18n/t';
import type { Clock } from '../../lib/clock';
import type { LiveWalk as Walking } from '../../services/walks/service';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { Dialog } from '../../ui/Dialog';
import { RouteLine } from './RouteLine';
import {
  cadenceText,
  clockText,
  paceText,
  walkDistance,
  walkEnergy,
  type DistanceUnit,
} from './text';
import styles from './walk.module.css';

/** Until the profile is read, live calories use a middle weight and height (never stored). */
const NO_BODY = { heightCm: 170, weightKg: 70 };

export interface LiveWalkProps {
  readonly walk: Walking;
  readonly clock: Clock;
  readonly energyUnit: EnergyDisplayUnit;
  readonly distanceUnit: DistanceUnit;
  readonly onPause: () => unknown;
  readonly onResume: () => unknown;
  readonly onStop: () => unknown;
}

/** The time walked now: the tracker's count plus the time since it last spoke, while running. */
function activeNow(walk: Walking, now: number): number {
  const since = walk.state === 'running' ? Math.max(0, now - walk.receivedAt) / 1000 : 0;
  return walk.activeSeconds + since;
}

/**
 * A walk in progress (P15-03): the time large, then distance, pace over the last minute, steps,
 * cadence and active calories, the route so far, and Pause/Resume and Stop. Stop asks first, and
 * Keep walking is the safe answer. The time moves on every second between the tracker's updates.
 */
export function LiveWalk({
  walk,
  clock,
  energyUnit,
  distanceUnit,
  onPause,
  onResume,
  onStop,
}: LiveWalkProps) {
  const profile = useProfile();
  const [now, setNow] = useState(() => clock.now());
  const [confirming, setConfirming] = useState(false);
  const running = walk.state === 'running';

  useEffect(() => {
    setNow(clock.now());
    if (!running) return undefined;
    const timer = setInterval(() => setNow(clock.now()), 1000);
    return () => clearInterval(timer);
  }, [clock, running, walk]);

  const body =
    profile.status === 'ready' && profile.value.kind === 'ok' ? profile.value.value : NO_BODY;
  const seconds = activeNow(walk, now);
  const stats = useMemo(
    () =>
      walkStats({
        startedAt: walk.startedAt,
        endAt: Math.max(walk.startedAt, walk.receivedAt),
        activeSeconds: walk.activeSeconds,
        points: walk.points,
        steps: walk.steps,
        locationGranted: walk.locationGranted,
        stepsGranted: walk.stepsGranted,
        heightCm: body.heightCm,
        weightKg: body.weightKg,
      }),
    [walk, body.heightCm, body.weightKg],
  );
  // Energy grows with the time shown, at the walk's METs so far.
  const activeKcal = walk.activeSeconds > 0 ? (stats.activeKcal * seconds) / walk.activeSeconds : 0;
  const none = t('walk.figure.none');
  const pace = stats.recentPaceSecPerKm ?? stats.paceSecPerKm;

  return (
    <div className={styles.live} data-ui="walk.live" data-state={walk.state}>
      <div className={styles.clockBlock}>
        <span className={styles.clockLabel}>
          {running ? t('walk.live.label') : t('walk.live.paused')}
        </span>
        <span
          className={styles.clock}
          role="timer"
          aria-label={t('walk.live.time')}
          data-ui="walk.live.time"
        >
          {clockText(seconds)}
        </span>
      </div>
      <dl className={styles.liveFigures}>
        <div className={styles.figure} data-ui="walk.live.distance">
          <dt className={styles.figureName}>{t('walk.live.distance')}</dt>
          <dd className={styles.figureValue}>
            {stats.distanceM === null ? none : walkDistance(stats.distanceM, distanceUnit)}
          </dd>
        </div>
        <div className={styles.figure} data-ui="walk.live.pace">
          <dt className={styles.figureName}>{t('walk.live.pace')}</dt>
          <dd className={styles.figureValue}>{paceText(pace, distanceUnit)}</dd>
        </div>
        <div className={styles.figure} data-ui="walk.live.steps">
          <dt className={styles.figureName}>{t('walk.live.steps')}</dt>
          <dd className={styles.figureValue}>
            {stats.steps === null ? none : formatNumber(stats.steps, currentLocale())}
          </dd>
        </div>
        <div className={styles.figure} data-ui="walk.live.cadence">
          <dt className={styles.figureName}>{t('walk.live.cadence')}</dt>
          <dd className={styles.figureValue}>{cadenceText(stats.cadence)}</dd>
        </div>
        <div className={styles.figure} data-ui="walk.live.active">
          <dt className={styles.figureName}>{t('walk.live.active')}</dt>
          <dd className={styles.figureValue}>{walkEnergy(activeKcal, energyUnit)}</dd>
        </div>
      </dl>
      <Card className={styles.routeCard}>
        <RouteLine fixes={walk.points} live located={walk.locationGranted} />
      </Card>
      {walk.locationGranted ? null : (
        <p className={styles.note} data-ui="walk.live.noRoute">
          {t('walk.live.noRoute')}
        </p>
      )}
      {walk.stepsGranted ? null : (
        <p className={styles.note} data-ui="walk.live.noSteps">
          {t('walk.live.noSteps')}
        </p>
      )}
      <div className={styles.controls}>
        {running ? (
          <Button onClick={onPause} block data-ui="walk.pause">
            {t('walk.live.pause')}
          </Button>
        ) : (
          <Button onClick={onResume} block data-ui="walk.resume">
            {t('walk.live.resume')}
          </Button>
        )}
        <Button variant="primary" onClick={() => setConfirming(true)} block data-ui="walk.stop">
          {t('walk.live.stop')}
        </Button>
      </div>
      <Dialog
        open={confirming}
        title={t('walk.live.stopTitle')}
        message={t('walk.live.stopMessage')}
        confirmLabel={t('walk.live.stopConfirm')}
        cancelLabel={t('walk.live.keepWalking')}
        onConfirm={() => {
          setConfirming(false);
          return onStop();
        }}
        onCancel={() => setConfirming(false)}
        data-ui="walk.stopConfirm"
      />
    </div>
  );
}

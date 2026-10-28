import { useId } from 'react';
import type { ActivityDay, ActivitySession } from '../../data/hooks';
import type { HeightDisplayUnit } from '../../domain/units/body';
import type { EnergyDisplayUnit } from '../../domain/units/energy';
import type { Walk } from '../../domain/walks/model';
import { formatDuration, formatTime } from '../../i18n/format';
import { t, type TKey } from '../../i18n/t';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { Icon } from '../../ui/icons';
import styles from './activity.module.css';
import {
  distanceAmount,
  distanceIn,
  distanceText,
  distanceUnitOf,
  type DistanceUnit,
} from './distance';
import { energyText } from './energy';

/** Words for the common workout types; anything else is a "Workout". */
const WORKOUT_TYPES: ReadonlyArray<[RegExp, TKey]> = [
  [/run/, 'health.home.type.running'],
  [/walk|hik/, 'health.home.type.walking'],
  [/cycl|bik/, 'health.home.type.cycling'],
  [/swim/, 'health.home.type.swimming'],
  [/strength|weight/, 'health.home.type.strength'],
];

/** A workout's name: its own title, else its type in our words. */
export function workoutName(session: ActivitySession): string {
  if (session.title !== null) return session.title;
  const type = session.type.toLowerCase();
  const known = WORKOUT_TYPES.find(([pattern]) => pattern.test(type));
  return t(known ? known[1] : 'health.home.type.other');
}

function workoutLine(session: ActivitySession, unit: EnergyDisplayUnit): string {
  const name = workoutName(session);
  const length = formatDuration((session.end - session.start) / 60_000);
  return session.activeKcal === null
    ? t('health.home.workout', { name, length })
    : t('health.home.workoutEnergy', {
        name,
        length,
        amount: energyText(session.activeKcal, unit),
      });
}

/** The day's distance, to one decimal in the locale's marks: "7.1 km", "4.4 mi". */
function DistanceFigure({
  metres,
  unit,
}: {
  readonly metres: number;
  readonly unit: DistanceUnit;
}) {
  const amount = distanceIn(metres, unit);
  return (
    <li
      aria-label={t(`health.home.distanceName.${unit}`, { amount: distanceAmount(amount) })}
      data-ui="home.activity.distance"
    >
      {distanceText(amount, unit)}
    </li>
  );
}

function hasData(day: ActivityDay | null): day is ActivityDay {
  return (
    day !== null &&
    (day.steps !== null ||
      day.activeKcal !== null ||
      day.totalKcal !== null ||
      day.distanceM !== null ||
      day.sessions.length > 0)
  );
}

/** One recorded walk of the day: its start, length, distance and active energy. */
function walkLine(walk: Walk, energyUnit: EnergyDisplayUnit, unit: DistanceUnit): string {
  const time = formatTime(walk.startedAt);
  const length = formatDuration(walk.activeSeconds / 60);
  const amount = energyText(walk.activeKcal, energyUnit);
  return walk.distanceM === null
    ? t('walk.home.line', { time, length, amount })
    : t('walk.home.lineDistance', {
        time,
        length,
        amount,
        distance: distanceText(distanceIn(walk.distanceM, unit), unit),
      });
}

export interface ActivityCardProps {
  /** The day on show as Health Connect gave it, or null when it gave nothing. */
  readonly day: ActivityDay | null;
  readonly energyUnit: EnergyDisplayUnit;
  /** The person's length unit (`units.height`), which picks km or miles for the distance. */
  readonly lengthUnit: HeightDisplayUnit;
  /**
   * Health Connect is connected, so its figures show (the default). False when the card is there
   * for the walks alone (P15-03).
   */
  readonly healthConnected?: boolean;
  /** The day's recorded walks, oldest first, where the app records walks (P15-03). */
  readonly walks?: readonly Walk[];
  /** Opens the walk recorder; with it the card has the Walk button. */
  readonly onWalk?: () => void;
  /** A walk is under way or waits on its summary: the button goes back to it. */
  readonly walking?: boolean;
}

/** Health Connect's figures and workouts of the day, or the line saying it has none. */
function HealthFigures({
  day,
  energyUnit,
  unit,
}: {
  readonly day: ActivityDay | null;
  readonly energyUnit: EnergyDisplayUnit;
  readonly unit: DistanceUnit;
}) {
  const workoutsId = useId();
  if (!hasData(day)) {
    return (
      <p className={styles.empty} data-ui="home.activity.empty">
        {t('health.home.empty')}
      </p>
    );
  }
  return (
    <>
      <ul className={styles.figures}>
        {day.steps === null ? null : (
          <li className={styles.figure} data-ui="home.activity.steps">
            {t('health.home.steps', { count: Math.round(day.steps) })}
          </li>
        )}
        {day.activeKcal === null ? null : (
          <li className={styles.figure} data-ui="home.activity.active">
            {t('health.home.active', { amount: energyText(day.activeKcal, energyUnit) })}
          </li>
        )}
      </ul>
      {day.totalKcal === null && day.distanceM === null ? null : (
        <ul className={styles.more} data-ui="home.activity.more">
          {day.totalKcal === null ? null : (
            <li data-ui="home.activity.total">
              {t('health.home.total', { amount: energyText(day.totalKcal, energyUnit) })}
            </li>
          )}
          {day.distanceM === null ? null : <DistanceFigure metres={day.distanceM} unit={unit} />}
        </ul>
      )}
      {day.sessions.length === 0 ? null : (
        <>
          <h3 id={workoutsId} className={styles.workoutsHeading}>
            {t('health.home.workouts')}
          </h3>
          <ul
            className={styles.workouts}
            aria-labelledby={workoutsId}
            data-ui="home.activity.workouts"
          >
            {day.sessions.map((session) => (
              <li key={session.id}>{workoutLine(session, energyUnit)}</li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

/** The day's recorded walks (P15-03), or a line saying there are none. */
function WalkLines({
  walks,
  energyUnit,
  unit,
}: {
  readonly walks: readonly Walk[];
  readonly energyUnit: EnergyDisplayUnit;
  readonly unit: DistanceUnit;
}) {
  const walksId = useId();
  if (walks.length === 0) {
    return (
      <p className={styles.empty} data-ui="home.activity.walks.none">
        {t('walk.home.none')}
      </p>
    );
  }
  return (
    <>
      <h3 id={walksId} className={styles.workoutsHeading}>
        {t('walk.home.heading')}
      </h3>
      <ul className={styles.workouts} aria-labelledby={walksId} data-ui="home.activity.walks">
        {walks.map((walk) => (
          <li key={walk.id}>{walkLine(walk, energyUnit, unit)}</li>
        ))}
      </ul>
    </>
  );
}

/**
 * Home's activity card (P11-04), on the Android app while Health Connect is connected: the day's
 * steps and active calories, under them its total calories burned and distance (shown, never
 * counted in the target: D-16.89), then its workouts with their length and energy, or a line
 * saying Health Connect has nothing for the day. Each figure shows only when Health Connect gave
 * it, as it gave it, rounded. Where the app records walks (P15-03) the card also lists the day's
 * walks and has the Walk button, also while Health Connect is not connected; with Health Connect
 * connected a day without walks adds no line.
 */
export function ActivityCard({
  day,
  energyUnit,
  lengthUnit,
  healthConnected = true,
  walks,
  onWalk,
  walking = false,
}: ActivityCardProps) {
  const unit = distanceUnitOf(lengthUnit);
  const showWalks = walks !== undefined && (walks.length > 0 || !healthConnected);
  return (
    <Card heading={t('health.home.title')} className={styles.card} data-ui="home.activity">
      {healthConnected ? <HealthFigures day={day} energyUnit={energyUnit} unit={unit} /> : null}
      {showWalks ? <WalkLines walks={walks} energyUnit={energyUnit} unit={unit} /> : null}
      {onWalk ? (
        <Button onClick={onWalk} block data-ui="home.activity.walk">
          <span className={styles.walkLabel}>
            <Icon name="walk" size={20} />
            {t(walking ? 'walk.home.back' : 'walk.home.start')}
          </span>
        </Button>
      ) : null}
    </Card>
  );
}

import { useId } from 'react';
import type { ActivityDay, ActivitySession } from '../../data/hooks';
import type { HeightDisplayUnit } from '../../domain/units/body';
import type { EnergyDisplayUnit } from '../../domain/units/energy';
import { formatDuration } from '../../i18n/format';
import { t, type TKey } from '../../i18n/t';
import { Card } from '../../ui/Card';
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

export interface ActivityCardProps {
  /** The day on show as Health Connect gave it, or null when it gave nothing. */
  readonly day: ActivityDay | null;
  readonly energyUnit: EnergyDisplayUnit;
  /** The person's length unit (`units.height`), which picks km or miles for the distance. */
  readonly lengthUnit: HeightDisplayUnit;
}

/**
 * Home's activity card (P11-04), on the Android app while Health Connect is connected: the day's
 * steps and active calories, under them its total calories burned and distance (shown, never
 * counted in the target: D-16.89), then its workouts with their length and energy, or a line
 * saying Health Connect has nothing for the day. Each figure shows only when Health Connect gave
 * it, as it gave it, rounded.
 */
export function ActivityCard({ day, energyUnit, lengthUnit }: ActivityCardProps) {
  const workoutsId = useId();
  return (
    <Card heading={t('health.home.title')} className={styles.card} data-ui="home.activity">
      {hasData(day) ? (
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
              {day.distanceM === null ? null : (
                <DistanceFigure metres={day.distanceM} unit={distanceUnitOf(lengthUnit)} />
              )}
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
      ) : (
        <p className={styles.empty} data-ui="home.activity.empty">
          {t('health.home.empty')}
        </p>
      )}
    </Card>
  );
}

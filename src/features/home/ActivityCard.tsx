import { useId } from 'react';
import type { ActivityDay, ActivitySession } from '../../data/hooks';
import type { EnergyDisplayUnit } from '../../domain/units/energy';
import { formatDuration } from '../../i18n/format';
import { t, type TKey } from '../../i18n/t';
import { Card } from '../../ui/Card';
import styles from './activity.module.css';
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

function hasData(day: ActivityDay | null): day is ActivityDay {
  return day !== null && (day.steps !== null || day.activeKcal !== null || day.sessions.length > 0);
}

export interface ActivityCardProps {
  /** The day on show as Health Connect gave it, or null when it gave nothing. */
  readonly day: ActivityDay | null;
  readonly energyUnit: EnergyDisplayUnit;
}

/**
 * Home's activity card (P11-04), on the Android app while Health Connect is connected: the day's
 * steps and active calories, then its workouts with their length and energy, or a line saying
 * Health Connect has nothing for the day. Figures are shown as Health Connect gives them, rounded.
 */
export function ActivityCard({ day, energyUnit }: ActivityCardProps) {
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

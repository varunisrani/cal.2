import { MODERATE_GOAL_MINUTES } from '../../domain/walks/week';
import { t } from '../../i18n/t';
import styles from './walk.module.css';

const SIZE = 120;
const STROKE = 12;
const RADIUS = (SIZE - STROKE) / 2;

export interface WeekRingProps {
  /** Moderate minutes so far this week. */
  readonly minutes: number;
  readonly 'data-ui'?: string;
}

/**
 * The week's moderate minutes against 150 as a ring (P15-03): the ring fills with the share, the
 * minutes sit in its middle. It is a progress bar for assistive tech, read out as "x of 150".
 */
export function WeekRing({ minutes, 'data-ui': dataUi = 'walk.week' }: WeekRingProps) {
  const whole = Math.max(0, Math.round(minutes));
  const share = Math.min(1, whole / MODERATE_GOAL_MINUTES);
  return (
    <div
      className={styles.ring}
      role="progressbar"
      aria-label={t('walk.summary.week')}
      aria-valuemin={0}
      aria-valuemax={MODERATE_GOAL_MINUTES}
      aria-valuenow={Math.min(whole, MODERATE_GOAL_MINUTES)}
      aria-valuetext={t('walk.summary.weekRing', { minutes: whole })}
      data-ui={dataUi}
      data-minutes={whole}
    >
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className={styles.ringArt}
        aria-hidden="true"
        focusable="false"
      >
        <circle
          className={styles.ringTrack}
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          strokeWidth={STROKE}
        />
        {share > 0 ? (
          <circle
            className={styles.ringFill}
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            strokeWidth={STROKE}
            pathLength={100}
            strokeDasharray={`${share * 100} 100`}
            transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
          />
        ) : null}
      </svg>
      <span className={styles.ringText} aria-hidden="true">
        <span className={styles.ringValue}>
          {t('walk.summary.weekRingValue', { minutes: whole })}
        </span>
        <span className={styles.ringGoal}>{t('walk.summary.weekRingGoal')}</span>
      </span>
    </div>
  );
}

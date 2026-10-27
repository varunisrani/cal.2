import { WaterSettings } from '../../water/WaterSettings';
import styles from './tracking.module.css';

/**
 * Settings › Tracking & reminders (06 §3.4): one card per tracker, each with its switch first and
 * its own rows only while it is on. Water is here (P07-06); the places below are kept for the
 * cards still to come.
 */
export function TrackingPage() {
  return (
    <div className={styles.page} data-ui="tracking">
      {/* P09-03: the meal times row goes first, above the trackers. */}
      <WaterSettings />
      {/* P07-07: the fasting card goes here, under water (`FastingSettings`, mounted at landing). */}
      {/* P09-09: the reminders section goes last. */}
    </div>
  );
}

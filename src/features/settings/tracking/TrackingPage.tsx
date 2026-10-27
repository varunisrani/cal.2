import { FastingSettings } from '../../fasting/FastingSettings';
import { WaterSettings } from '../../water/WaterSettings';
import styles from './tracking.module.css';

/**
 * Settings › Tracking & reminders (06 §3.4): one card per tracker, each with its switch first and
 * its own rows only while it is on. Water (P07-06) and fasting (P07-07) are here; the places below
 * are kept for the cards still to come.
 */
export function TrackingPage() {
  return (
    <div className={styles.page} data-ui="tracking">
      {/* P09-03: the meal times row goes first, above the trackers. */}
      <WaterSettings />
      <FastingSettings />
      {/* P09-09: the reminders section goes last. */}
    </div>
  );
}

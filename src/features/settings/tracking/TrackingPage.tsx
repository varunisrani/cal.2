import { FastingSettings } from '../../fasting/FastingSettings';
import { WaterSettings } from '../../water/WaterSettings';
import { MealTimesCard } from './MealTimesSheet';
import { RemindersSection } from './RemindersSection';
import styles from './tracking.module.css';

/**
 * Settings › Tracking & reminders (06 §3.4): the meal times first (P09-03), then one card per
 * tracker, each with its switch first and its own rows only while it is on (water P07-06, fasting
 * P07-07), and the notifications last, since some reminders follow the trackers (P09-09).
 */
export function TrackingPage() {
  return (
    <div className={styles.page} data-ui="tracking">
      <MealTimesCard />
      <WaterSettings />
      <FastingSettings />
      <RemindersSection />
    </div>
  );
}

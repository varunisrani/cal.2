import { FastingSettings } from '../../fasting/FastingSettings';
import { WaterSettings } from '../../water/WaterSettings';
import { CoachSettings } from './CoachSettings';
import { CustomRemindersCard } from './CustomReminders';
import { MealTimesCard } from './MealTimesSheet';
import { RemindersSection } from './RemindersSection';
import { SmartNotifications } from './SmartNotifications';
import styles from './tracking.module.css';

/**
 * Settings › Tracking & reminders (06 §3.4): the meal times first (P09-03), then one card per
 * tracker, each with its switch first and its own rows only while it is on (water P07-06, fasting
 * P07-07), then the notifications, since some reminders follow the trackers (P09-09), and the
 * reminders the person writes (P13), and in the Android app the Coach's (Let the Coach set
 * reminders, its check-ins) and the Smart notifications last (P17).
 */
export function TrackingPage() {
  return (
    <div className={styles.page} data-ui="tracking">
      <MealTimesCard />
      <WaterSettings />
      <FastingSettings />
      <RemindersSection />
      <CustomRemindersCard />
      <CoachSettings />
      <SmartNotifications />
    </div>
  );
}

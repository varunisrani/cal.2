import { useEffect, useState } from 'react';
import { useSettings } from '../../../data/hooks';
import type { ReminderSetting } from '../../../data/settingsSchema';
import { t } from '../../../i18n/t';
import { useOptionalServices } from '../../../services/context';
import { isHealthAvailable } from '../../../services/health/platform';
import type { NotificationState } from '../../../services/reminders/notifier';
import type { DailyReminder } from '../../../services/reminders/schedule';
import type { TrackingSettingsService } from '../../../services/trackingSettings';
import { Card } from '../../../ui/Card';
import { DateTimeField } from '../../../ui/DateTimeField';
import { Switch } from '../../../ui/Switch';
import { useToast } from '../../../ui/Toast';
import styles from './tracking.module.css';

const SETTINGS = [
  'remind.master',
  'remind.breakfast',
  'remind.lunch',
  'remind.dinner',
  'remind.summary',
  'remind.water',
  'remind.fastGoal',
  'alerts.goalReached',
  'water.on',
  'fasting.on',
] as const;

/** The reminders with a time, in the card's order; water joins them while water is tracked. */
const TIMED: readonly DailyReminder[] = ['breakfast', 'lunch', 'dinner', 'summary'];

/** The switches that are written on their own, so each can wait for its write. */
type SwitchId = 'master' | DailyReminder | 'fastGoal' | 'goalReached';

/**
 * The Notifications card of Settings › Tracking & reminders (06 §3.9–3.10, R06.13, D-16.5). The
 * master switch shows on only while it is stored on and the browser allows notifications; turning
 * it on asks the browser, and only a grant stores it on. While the browser blocks them, a line
 * says where to allow them. The permission is read again whenever the page comes back into focus.
 * While on: breakfast, lunch, dinner and the daily summary, each a switch with its time; water
 * (switch and time) only while water is tracked; the fasting goal only while fasting is tracked;
 * the goal-weight alert. A last line says when reminders can show. Inside the Android app, whose
 * page has no notifications, one line says reminders are not available there yet, in place of
 * the browser's line and the last line. Nothing is drawn until the settings are read (R06.22),
 * nor without the service (screens tested without one).
 */
export function RemindersSection() {
  const service = useOptionalServices()?.trackingSettings;
  return service ? <RemindersCard service={service} /> : null;
}

/** The browser's permission, read again on every return of focus to the page. */
function usePermission(
  service: TrackingSettingsService,
): [NotificationState, (state: NotificationState) => void] {
  const [state, setState] = useState(() => service.permission());
  useEffect(() => {
    const reread = (): void => setState(service.recheck());
    const onVisibility = (): void => {
      if (document.visibilityState === 'visible') reread();
    };
    // Also once on opening: it may have changed since it was last read.
    reread();
    window.addEventListener('focus', reread);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('focus', reread);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [service]);
  return [state, setState];
}

function RemindersCard({ service }: { readonly service: TrackingSettingsService }) {
  const settings = useSettings(SETTINGS);
  const toast = useToast();
  const [permission, setPermission] = usePermission(service);
  const [writing, setWriting] = useState<ReadonlySet<SwitchId>>(() => new Set());

  if (settings.status === 'loading') return null;
  if (settings.status === 'error') {
    return (
      <p className={styles.note} data-ui="reminders.unavailable">
        {t('reminders.settings.unavailable')}
      </p>
    );
  }

  const stored = settings.value;
  const unsupported = permission === 'unsupported';
  // The Android app's page has no notifications at all: the browser's advice cannot help there.
  const androidApp = unsupported && isHealthAvailable();
  // The switch never claims more than the browser allows (R06.13).
  const on = stored['remind.master'] && permission === 'granted';

  /** Runs one switch's write, holding that switch until it settles. */
  const run = async (id: SwitchId, write: () => Promise<unknown>): Promise<void> => {
    setWriting((now) => new Set(now).add(id));
    try {
      await write();
    } catch (error) {
      console.error('A notification setting could not be saved', error);
      toast.show(t('reminders.settings.saveFailed'));
    } finally {
      setWriting((now) => {
        const next = new Set(now);
        next.delete(id);
        return next;
      });
    }
  };

  const switchMaster = (next: boolean): void => {
    // The request starts inside this press: browsers only prompt from one.
    const write = next ? service.turnRemindersOn().then(setPermission) : service.turnRemindersOff();
    void run('master', () => write);
  };

  const timed = stored['water.on'] ? [...TIMED, 'water' as const] : TIMED;
  const anyOn =
    timed.some((id) => stored[`remind.${id}`].on) ||
    (stored['fasting.on'] && stored['remind.fastGoal']) ||
    stored['alerts.goalReached'];

  return (
    <Card
      heading={t('reminders.settings.heading')}
      className={styles.card}
      data-ui="reminders.settings"
    >
      <ul className={styles.rows}>
        <li className={`${styles.rowItem} ${styles.switchItem}`}>
          <Switch
            label={t('reminders.settings.master')}
            description={t('reminders.settings.masterHint')}
            checked={on}
            disabled={unsupported || writing.has('master')}
            onChange={switchMaster}
            data-ui="reminders.master"
          />
        </li>
        {on ? (
          <>
            {timed.map((id) => (
              <TimedReminderRow
                key={id}
                id={id}
                value={stored[`remind.${id}`]}
                busy={writing.has(id)}
                onSwitch={(next) => void run(id, () => service.setReminder(id, { on: next }))}
                onTime={(at) => service.setReminder(id, { at })}
              />
            ))}
            {stored['fasting.on'] ? (
              <li className={`${styles.rowItem} ${styles.switchItem}`}>
                <Switch
                  label={t('reminders.settings.fastGoal')}
                  description={t('reminders.settings.fastGoalHint')}
                  checked={stored['remind.fastGoal']}
                  disabled={writing.has('fastGoal')}
                  onChange={(next) => void run('fastGoal', () => service.setFastGoalAlert(next))}
                  data-ui="reminders.fastGoal"
                />
              </li>
            ) : null}
            <li className={`${styles.rowItem} ${styles.switchItem}`}>
              <Switch
                label={t('reminders.settings.goalReached')}
                description={t('reminders.settings.goalReachedHint')}
                checked={stored['alerts.goalReached']}
                disabled={writing.has('goalReached')}
                onChange={(next) =>
                  void run('goalReached', () => service.setGoalReachedAlert(next))
                }
                data-ui="reminders.goalReached"
              />
            </li>
          </>
        ) : null}
      </ul>

      {permission === 'denied' ? (
        <p
          className={`${styles.note} ${styles.cardNote} ${styles.pointer}`}
          role="status"
          data-ui="reminders.blocked"
        >
          {t('reminders.settings.blocked')}
        </p>
      ) : null}
      {unsupported ? (
        <p className={`${styles.note} ${styles.cardNote}`} data-ui="reminders.unsupported">
          {t(
            androidApp ? 'reminders.settings.unsupportedAndroid' : 'reminders.settings.unsupported',
          )}
        </p>
      ) : null}
      {on && !anyOn ? (
        <p className={`${styles.note} ${styles.cardNote}`} data-ui="reminders.noneOn">
          {t('reminders.settings.noneOn')}
        </p>
      ) : null}
      {androidApp ? null : (
        <p className={`${styles.note} ${styles.cardNote}`} data-ui="reminders.openNote">
          {t('reminders.settings.openNote')}
        </p>
      )}
    </Card>
  );
}

interface TimedReminderRowProps {
  readonly id: DailyReminder;
  readonly value: Readonly<ReminderSetting>;
  /** Its switch's write is running. */
  readonly busy: boolean;
  readonly onSwitch: (on: boolean) => void;
  /** Stores a new time; a rejection puts the stored time back in the field. */
  readonly onTime: (at: string) => Promise<unknown>;
}

const NAME_KEYS = {
  breakfast: 'reminders.settings.breakfast',
  lunch: 'reminders.settings.lunch',
  dinner: 'reminders.settings.dinner',
  summary: 'reminders.settings.summary',
  water: 'reminders.settings.water',
} as const satisfies Record<DailyReminder, string>;

/** A reminder's switch and, while it is on, its time of day. */
function TimedReminderRow({ id, value, busy, onSwitch, onTime }: TimedReminderRowProps) {
  const toast = useToast();
  const name = t(NAME_KEYS[id]);
  // The field shows what was typed until the stored time catches up (or the write fails).
  const [typed, setTyped] = useState<string | null>(null);
  const [over, setOver] = useState(value.at);
  if (over !== value.at) {
    setOver(value.at);
    setTyped(null);
  }

  const changeTime = (at: string): void => {
    setTyped(at);
    onTime(at).catch((error: unknown) => {
      console.error('A reminder time could not be saved', error);
      toast.show(t('reminders.settings.saveFailed'));
      setTyped(null);
    });
  };

  return (
    <li className={`${styles.rowItem} ${styles.switchItem}`}>
      <Switch
        label={name}
        description={id === 'summary' ? t('reminders.settings.summaryHint') : undefined}
        checked={value.on}
        disabled={busy}
        onChange={onSwitch}
        data-ui={`reminders.${id}`}
      />
      {value.on ? (
        <DateTimeField
          kind="time"
          label={t('reminders.settings.time', { name })}
          value={typed ?? value.at}
          onChange={changeTime}
          className={styles.timeField}
          data-ui={`reminders.${id}.time`}
        />
      ) : null}
    </li>
  );
}

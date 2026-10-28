import { useState } from 'react';
import { useSettings } from '../../../data/hooks';
import type { SmartKind } from '../../../domain/reminders/notices';
import { t } from '../../../i18n/t';
import { useOptionalServices } from '../../../services/context';
import type { NotifyService } from '../../../services/notifications/contract';
import type { TrackingSettingsService } from '../../../services/trackingSettings';
import { Card } from '../../../ui/Card';
import { Switch } from '../../../ui/Switch';
import { useToast } from '../../../ui/Toast';
import styles from './tracking.module.css';
import { usePermission } from './usePermission';

const SETTINGS = ['notify.off', 'notify.quiet'] as const;

type SwitchId = SmartKind | 'quiet';

/**
 * Settings › Tracking & reminders › Smart notifications (P17, D-16.100/101), in the Android app
 * only: one switch per kind of nudge or notice Platewise sends by itself (all on until turned
 * off), each with a line on what it does, and Quiet hours. Turning one on while Android does not
 * allow notifications asks Android in the same press; while it refuses, the line pointing to
 * Android's settings shows. Nothing is drawn on the web (no `notify` service), before the
 * settings are read, or without the tracking settings' permission.
 */
export function SmartNotifications() {
  const services = useOptionalServices();
  const notify = services?.notify;
  const tracking = services?.trackingSettings;
  return notify && tracking ? <SmartCard notify={notify} tracking={tracking} /> : null;
}

function SmartCard({
  notify,
  tracking,
}: {
  readonly notify: NotifyService;
  readonly tracking: TrackingSettingsService;
}) {
  const settings = useSettings(SETTINGS);
  const permission = usePermission(tracking);
  const toast = useToast();
  const [writing, setWriting] = useState<ReadonlySet<SwitchId>>(() => new Set());
  if (settings.status !== 'ready') return null;
  const off = settings.value['notify.off'];

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

  const switchKind = (kind: SmartKind, on: boolean): void => {
    // Asked inside the press: Android shows its dialog only from one.
    const asked = on && permission !== 'granted' ? tracking.requestPermission() : null;
    void run(kind, async () => {
      await asked;
      await notify.setKind(kind, on);
    });
  };

  return (
    <Card heading={t('reminders.smart.heading')} className={styles.card} data-ui="notify.smart">
      <ul className={styles.rows}>
        {notify.kinds.map((kind) => (
          <li key={kind} className={`${styles.rowItem} ${styles.switchItem}`}>
            <Switch
              label={t(`reminders.smart.${kind}`)}
              description={t(`reminders.smart.${kind}Hint`)}
              checked={!off.includes(kind)}
              disabled={writing.has(kind)}
              onChange={(on) => switchKind(kind, on)}
              data-ui={`notify.smart.${kind}`}
            />
          </li>
        ))}
        <li className={`${styles.rowItem} ${styles.switchItem}`}>
          <Switch
            label={t('reminders.smart.quiet')}
            description={t('reminders.smart.quietHint')}
            checked={settings.value['notify.quiet']}
            disabled={writing.has('quiet')}
            onChange={(on) => void run('quiet', () => notify.setQuiet(on))}
            data-ui="notify.smart.quiet"
          />
        </li>
      </ul>
      {permission === 'denied' ? (
        <p
          className={`${styles.note} ${styles.cardNote} ${styles.pointer}`}
          role="status"
          data-ui="notify.smart.blocked"
        >
          {t('reminders.settings.blockedAndroid')}
        </p>
      ) : null}
    </Card>
  );
}

import { useState } from 'react';
import { useSettings } from '../../../data/hooks';
import { t } from '../../../i18n/t';
import { readCheckIns } from '../../../services/coach/checkIns';
import { useOptionalServices } from '../../../services/context';
import type { NotifyService } from '../../../services/notifications/contract';
import { IconButton } from '../../../ui/Button';
import { Card } from '../../../ui/Card';
import { Icon } from '../../../ui/icons';
import { Switch } from '../../../ui/Switch';
import { useToast } from '../../../ui/Toast';
import { checkInWhen } from '../../coach/CheckInCard';
import own from './coachSettings.module.css';
import styles from './tracking.module.css';

const SETTINGS = ['coach.setsReminders', 'coach.checkIns'] as const;

/**
 * The Coach's card on Settings › Tracking & reminders (P17, D-16.102), in the Android app only:
 * **Let the Coach set reminders** (on: it adds the reminders the person asks for at once; off: it
 * proposes them, as on the web), and the check-ins it scheduled that still wait, soonest first,
 * each with Delete. Nothing is drawn on the web (no `notify` service) or before the settings are
 * read.
 */
export function CoachSettings() {
  const notify = useOptionalServices()?.notify;
  return notify ? <CoachCard notify={notify} /> : null;
}

function CoachCard({ notify }: { readonly notify: NotifyService }) {
  const settings = useSettings(SETTINGS);
  const toast = useToast();
  const [writing, setWriting] = useState(false);
  if (settings.status !== 'ready') return null;
  const checkIns = readCheckIns(settings.value['coach.checkIns']);

  const failed = (error: unknown): void => {
    console.error('A Coach setting could not be saved', error);
    toast.show(t('reminders.settings.saveFailed'));
  };

  const switchSets = (on: boolean): void => {
    setWriting(true);
    notify
      .setCoachSets(on)
      .catch(failed)
      .finally(() => setWriting(false));
  };

  return (
    <Card heading={t('common.tabs.coach')} className={styles.card} data-ui="coach.settings">
      <ul className={styles.rows}>
        <li className={`${styles.rowItem} ${styles.switchItem}`}>
          <Switch
            label={t('reminders.yours.coachSets')}
            description={t('reminders.yours.coachSetsHint')}
            checked={settings.value['coach.setsReminders']}
            disabled={writing}
            onChange={switchSets}
            data-ui="coach.settings.sets"
          />
        </li>
      </ul>
      {checkIns.length > 0 ? (
        <>
          <h3 className={own.subheading}>{t('reminders.smart.coachCheckIn')}</h3>
          <p className={`${styles.note} ${styles.cardNote}`}>
            {t('reminders.smart.coachCheckInHint')}
          </p>
          <ul className={styles.rows}>
            {checkIns.map((checkIn) => (
              <li
                key={checkIn.id}
                className={`${styles.rowItem} ${own.item}`}
                data-ui="coach.settings.checkIn"
              >
                <div className={own.words}>
                  <p className={own.text}>{checkIn.text}</p>
                  <p className={own.when}>{checkInWhen(checkIn.at)}</p>
                </div>
                <IconButton
                  icon={<Icon name="trash" size={20} />}
                  label={t('reminders.inbox.delete', { title: checkIn.text })}
                  onClick={() => void notify.cancelCheckIn(checkIn.id).catch(failed)}
                  data-ui="coach.settings.checkIn.delete"
                />
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </Card>
  );
}

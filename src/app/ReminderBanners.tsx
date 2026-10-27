import { useSyncExternalStore } from 'react';
import { formatTime } from '../i18n/format';
import { t } from '../i18n/t';
import { useOptionalServices } from '../services/context';
import type { Notifier } from '../services/reminders/notifier';
import { Button } from '../ui/Button';
import styles from './notices.module.css';

/**
 * Reminders shown in the app (P09-09, D-16.5): one notice per reminder the notifier could not show
 * as a system notification, above the screen like the update banner. One missed while the app was
 * closed says when it was due. Each stays until Dismiss. Nothing is drawn without banners or
 * without a notifier (screens tested without one).
 */
export function ReminderBanners() {
  const notifier = useOptionalServices()?.notifier;
  return notifier ? <Banners notifier={notifier} /> : null;
}

function Banners({ notifier }: { readonly notifier: Notifier }) {
  const banners = useSyncExternalStore(notifier.subscribe, notifier.banners);
  return (
    <>
      {banners.map((banner) => (
        <div
          key={banner.id}
          className={styles.notice}
          role="status"
          data-ui={`shell.reminder.${banner.id}`}
        >
          <div className={styles.text}>
            <p className={styles.title}>{banner.title}</p>
            <p className={styles.body}>{banner.body}</p>
            {banner.missed ? (
              <p className={styles.body}>
                {t('reminders.banner.missed', { time: formatTime(banner.dueAt) })}
              </p>
            ) : null}
          </div>
          <div className={styles.actions}>
            <Button
              variant="quiet"
              data-ui={`shell.reminder.${banner.id}.dismiss`}
              onClick={() => notifier.dismiss(banner.id)}
            >
              {t('reminders.banner.dismiss')}
            </Button>
          </div>
        </div>
      ))}
    </>
  );
}

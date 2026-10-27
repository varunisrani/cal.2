import { t } from '../i18n/t';
import { Button } from '../ui/Button';
import styles from './notices.module.css';
import { appUpdates, useAppUpdate, type AppUpdates } from './swRegistration';

export interface UpdateBannerProps {
  /** The update flag; the app's own by default (tests pass theirs). */
  readonly updates?: AppUpdates;
}

/**
 * "Update ready" with a Reload button while a new version waits (P09-17). Only the press lets
 * the new version in and reloads; the banner never does it by itself, so nothing being edited
 * is lost. Nothing is drawn while the app is current.
 */
export function UpdateBanner({ updates = appUpdates }: UpdateBannerProps) {
  const { status, apply } = useAppUpdate(updates);
  if (status !== 'ready') return null;
  return (
    <div className={styles.notice} role="status" data-ui="shell.update">
      <div className={styles.text}>
        <p className={styles.title}>{t('shell.update.title')}</p>
        <p className={styles.body}>{t('shell.update.body')}</p>
      </div>
      <div className={styles.actions}>
        <Button variant="primary" data-ui="shell.update.reload" onClick={apply}>
          {t('shell.update.reload')}
        </Button>
      </div>
    </div>
  );
}

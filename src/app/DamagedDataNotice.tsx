import { useUnreadableFlag } from '../data/hooks';
import { t } from '../i18n/t';
import { useOptionalServices } from '../services/context';
import type { DamagedDataService } from '../services/damagedData';
import { Button } from '../ui/Button';
import styles from './notices.module.css';

/**
 * "Some saved data could not be read" (K9, R06.1): above the screen, like the update banner,
 * while the record guard has kept something aside, until Dismiss. It follows the live flag, so a
 * Dismiss in another tab takes it away here too. Nothing is drawn while the flag is down, still
 * being read or unreadable, or without the service (screens tested without one).
 */
export function DamagedDataNotice() {
  const damagedData = useOptionalServices()?.damagedData;
  return damagedData ? <Notice service={damagedData} /> : null;
}

function Notice({ service }: { readonly service: DamagedDataService }) {
  const flag = useUnreadableFlag();
  if (flag.status !== 'ready' || !flag.value) return null;

  // The live flag takes the notice away once the write is in; on a refusal it stays.
  const dismiss = (): void => {
    service.dismiss().catch((error: unknown) => {
      console.error('Platewise: the damaged-data notice could not be dismissed', error);
    });
  };

  return (
    <div className={styles.notice} role="status" data-ui="shell.damagedData">
      <div className={styles.text}>
        <p className={styles.title}>{t('shell.damagedData.title')}</p>
        <p className={styles.body}>{t('shell.damagedData.body')}</p>
      </div>
      <div className={styles.actions}>
        <Button variant="quiet" data-ui="shell.damagedData.dismiss" onClick={dismiss}>
          {t('shell.damagedData.dismiss')}
        </Button>
      </div>
    </div>
  );
}

import { useEffect, useId, useSyncExternalStore } from 'react';
import { tabRoute } from '../../../app/router';
import { useRoute, useRouter } from '../../../app/useRoute';
import { t } from '../../../i18n/t';
import { useOptionalServices } from '../../../services/context';
import type { StorageNudge as Nudger } from '../../../services/storageNudge';
import { Button } from '../../../ui/Button';
import styles from './storageNudge.module.css';

/** Where the cards' action goes: Settings › Your data, with Back up now. */
const DATA_ROUTE = tabRoute('settings', 'data');

/**
 * Home's storage card (D-16.8, R06.19): keep your diary safe (install, back up), or time for a
 * backup, under the diary on Home only, so it never pushes the gauge or the diary down. The card
 * was worked out as the app opened and never appears mid-visit. It is marked done only after it
 * was drawn and then dismissed or acted on (R06.15). Draws nothing without the service.
 */
export function StorageNudge() {
  const nudger = useOptionalServices()?.storageNudge;
  const route = useRoute();
  const onHome = route.kind === 'tab' && route.tab === 'home' && route.nested.length === 0;
  return nudger && onHome ? <NudgeSlot nudger={nudger} /> : null;
}

function NudgeSlot({ nudger }: { readonly nudger: Nudger }) {
  const router = useRouter();
  const titleId = useId();
  const nudge = useSyncExternalStore(nudger.subscribe, nudger.current);

  // After the commit: the card is on screen now.
  useEffect(() => {
    if (nudge) nudger.shown(nudge);
  }, [nudger, nudge]);

  if (!nudge) return null;

  const finish = async (thenOpen: boolean): Promise<void> => {
    await nudger.dismiss(nudge).catch((error: unknown) => {
      console.error('Platewise: the storage card could not be marked done', error);
    });
    if (thenOpen) router.navigate(DATA_ROUTE);
  };

  const keepSafe = nudge.kind === 'keepSafe';
  const body = keepSafe
    ? t(nudge.installed ? 'data.nudge.keepSafe.backUp' : 'data.nudge.keepSafe.install')
    : nudge.days === null
      ? t('data.nudge.backupDue.never')
      : t('data.nudge.backupDue.last', { days: nudge.days });

  return (
    <div
      className={styles.nudge}
      role="group"
      aria-labelledby={titleId}
      data-ui={`storageNudge.${nudge.kind}`}
    >
      <div className={styles.text}>
        <p id={titleId} className={styles.title}>
          {t(keepSafe ? 'data.nudge.keepSafe.title' : 'data.nudge.backupDue.title')}
        </p>
        <p className={styles.body}>{body}</p>
      </div>
      <div className={styles.actions}>
        <Button variant="quiet" data-ui="storageNudge.later" onClick={() => finish(false)}>
          {t('data.nudge.later')}
        </Button>
        <Button variant="primary" data-ui="storageNudge.open" onClick={() => finish(true)}>
          {t('data.nudge.open')}
        </Button>
      </div>
    </div>
  );
}
